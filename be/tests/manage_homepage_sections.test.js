const fs = require('fs');
const path = require('path');

jest.mock('../models/manage', () => {
  const save = jest.fn();
  const Manage = jest.fn(function Manage(document = {}) {
    Object.assign(this, document);
    this.save = save;
  });
  Manage.findOne = jest.fn();
  Manage.findOneAndUpdate = jest.fn();
  Manage.__save = save;
  return { Manage };
});

const { Manage } = require('../models/manage');
const homepageSections = require('../controllers/manageHomepageSections');

const {
  updateHomepageSection,
  legacySectionHandlers,
} = homepageSections;

function createResponse() {
  const response = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response;
}

function readManageFacade() {
  return fs.readFileSync(
    path.join(__dirname, '..', 'components', 'manage.js'),
    'utf8'
  );
}

function getRouteRegistration(source, method, routePath) {
  const prefixes = [
    'router.' + method + '("' + routePath + '"',
    "router." + method + "('" + routePath + "'",
  ];
  const start = prefixes
    .map((prefix) => source.indexOf(prefix))
    .find((index) => index !== -1);
  if (start === undefined) return '';

  const end = source.indexOf(';', start);
  return end === -1 ? '' : source.slice(start, end + 1);
}

function expectExternalRegistration(registration) {
  expect(registration).not.toBe('');
  expect(registration).not.toMatch(/\basync\b|=>|\bfunction\b/);
  expect(registration).toMatch(/,\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\);$/);
}

describe('manage homepage sections extraction contract', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    Manage.findOne.mockReset();
    Manage.findOneAndUpdate.mockReset();
    Manage.__save.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('exposes the generic handler and ten callable legacy handlers', () => {
    expect(updateHomepageSection).toEqual(expect.any(Function));
    expect(legacySectionHandlers).toEqual(expect.any(Object));

    for (let sectionNumber = 1; sectionNumber <= 10; sectionNumber += 1) {
      expect(legacySectionHandlers['section' + sectionNumber]).toEqual(expect.any(Function));
    }
  });

  it('keeps the generic and all ten legacy facade routes on external handlers', () => {
    const source = readManageFacade();
    expect(source).toMatch(/require\(["']\.\.\/controllers\/manageHomepageSections["']\)/);

    const genericRegistration = getRouteRegistration(
      source,
      'put',
      '/update-section/:sectionId'
    );
    expectExternalRegistration(genericRegistration);
    expect(genericRegistration).toMatch(/,\s*updateHomepageSection\s*\);$/);

    for (let sectionNumber = 1; sectionNumber <= 10; sectionNumber += 1) {
      const registration = getRouteRegistration(
        source,
        'put',
        '/update-section' + sectionNumber
      );
      expectExternalRegistration(registration);
    }
  });

  it('updates section11 through a single atomic upsert', async () => {
    const updatedManage = { section11: { name: 'Section Eleven' } };
    Manage.findOne.mockResolvedValue(null);
    Manage.findOneAndUpdate.mockResolvedValue(updatedManage);
    const response = createResponse();

    await updateHomepageSection({
      params: { sectionId: 'section11' },
      body: {
        name: 'Section Eleven',
        productId: ['product-1'],
        display: true,
        image: '/images/section-11.jpg',
        link: '/products',
      },
    }, response);

    expect(Manage.findOneAndUpdate).toHaveBeenCalledWith(
      {},
      {
        $set: {
          'section11.name': 'Section Eleven',
          'section11.productId': ['product-1'],
          'section11.display': true,
          'section11.image': '/images/section-11.jpg',
          'section11.link': '/products',
        },
      },
      { new: true, upsert: true }
    );
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: 1,
      data: updatedManage,
    }));
  });

  it('preserves explicit clear values in the generic section update', async () => {
    Manage.findOne.mockResolvedValue({});
    Manage.findOneAndUpdate.mockResolvedValue({ section4: {} });
    const response = createResponse();

    await updateHomepageSection({
      params: { sectionId: 'section4' },
      body: {
        name: '',
        productId: [],
        display: false,
        image: '',
        link: '',
      },
    }, response);

    expect(Manage.findOneAndUpdate).toHaveBeenCalledWith(
      {},
      {
        $set: {
          'section4.name': '',
          'section4.productId': [],
          'section4.display': false,
          'section4.image': '',
          'section4.link': '',
        },
      },
      { new: true, upsert: true }
    );
  });

  it('normalizes nameTranslations and derives name from Vietnamese when omitted', async () => {
    Manage.findOne.mockResolvedValue({});
    Manage.findOneAndUpdate.mockResolvedValue({ section11: {} });
    const response = createResponse();

    await updateHomepageSection({
      params: { sectionId: 'section11' },
      body: {
        nameTranslations: {
          vi: '  Trang chu  ',
          zh: '  Zhong wen  ',
          en: '  Home  ',
        },
      },
    }, response);

    expect(Manage.findOneAndUpdate).toHaveBeenCalledWith(
      {},
      {
        $set: {
          'section11.name': 'Trang chu',
          'section11.nameTranslations': {
            vi: 'Trang chu',
            zh: 'Zhong wen',
            en: 'Home',
          },
        },
      },
      { new: true, upsert: true }
    );
  });

  it('rejects overlong localized section names before persistence', async () => {
    const response = createResponse();

    await updateHomepageSection({
      params: { sectionId: 'section11' },
      body: {
        nameTranslations: {
          vi: 'Valid',
          zh: 'x'.repeat(151),
          en: 'Valid',
        },
      },
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: 0,
      message: expect.any(String),
    }));
    expect(Manage.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects section identifiers outside section1 through section11', async () => {
    const response = createResponse();

    await updateHomepageSection({
      params: { sectionId: 'section12' },
      body: { name: 'Invalid section' },
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: 0 }));
    expect(Manage.findOne).not.toHaveBeenCalled();
    expect(Manage.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('keeps section1 legacy truthy updates for empty name, empty products and false display', async () => {
    const updatedManage = { section1: { productId: [], display: false } };
    Manage.findOne.mockResolvedValue({ section1: {} });
    Manage.findOneAndUpdate.mockResolvedValue(updatedManage);
    const response = createResponse();

    await legacySectionHandlers.section1({
      body: { name: '', productId: [], display: false },
    }, response);

    expect(Manage.findOneAndUpdate).toHaveBeenCalledWith(
      {},
      {
        $set: {
          'section1.productId': [],
          'section1.display': false,
        },
      },
      { new: true }
    );
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: 1,
      data: updatedManage,
    }));
  });

  it('keeps section10 legacy create defaults when no manage document exists', async () => {
    const createdManage = {
      section10: { name: '', productId: [], display: true },
    };
    Manage.findOne.mockResolvedValue(null);
    Manage.__save.mockResolvedValue(createdManage);
    const response = createResponse();

    await legacySectionHandlers.section10({ body: {} }, response);

    expect(Manage).toHaveBeenCalledWith({
      section10: {
        name: '',
        productId: [],
        display: true,
      },
    });
    expect(Manage.__save).toHaveBeenCalledWith();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: 1,
      data: createdManage,
    }));
  });

  it('maps unexpected generic and legacy persistence failures to status 500', async () => {
    Manage.findOne.mockResolvedValue({});
    Manage.findOneAndUpdate.mockRejectedValueOnce(new Error('generic failed'));
    const genericResponse = createResponse();

    await updateHomepageSection({
      params: { sectionId: 'section11' },
      body: { name: 'Section Eleven' },
    }, genericResponse);

    expect(genericResponse.status).toHaveBeenCalledWith(500);
    expect(genericResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: 0,
      message: expect.any(String),
      error: expect.any(String),
    }));

    Manage.findOne.mockResolvedValue({});
    Manage.findOneAndUpdate.mockRejectedValueOnce(new Error('legacy failed'));
    const legacyResponse = createResponse();

    await legacySectionHandlers.section10({
      body: { name: 'Legacy section' },
    }, legacyResponse);

    expect(legacyResponse.status).toHaveBeenCalledWith(500);
    expect(legacyResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: 0,
      message: expect.any(String),
      error: expect.any(String),
    }));
  });
});
