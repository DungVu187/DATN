const fs = require('fs');
const path = require('path');

jest.mock('../models/manage', () => {
  const Manage = jest.fn();
  Manage.findOne = jest.fn();
  Manage.findOneAndUpdate = jest.fn();
  return { Manage };
});

const { Manage } = require('../models/manage');
const {
  POLICY_KEYS,
  createDefaultPolicies,
} = require('../config/policydefaults');
const managePolicies = require('../controllers/managePolicies');

const {
  getPolicies,
  updateMainPolicy,
  updatePolicies,
} = managePolicies;

function createResponse() {
  const response = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response;
}

function createPoliciesPayload() {
  return createDefaultPolicies().map((policy) => ({
    key: policy.key,
    title: policy.translations.vi.title,
    summary: policy.translations.vi.summary,
    sections: policy.translations.vi.sections.map((section) => ({ ...section })),
    translations: {
      vi: {
        ...policy.translations.vi,
        sections: policy.translations.vi.sections.map((section) => ({ ...section })),
      },
      zh: {
        ...policy.translations.zh,
        sections: policy.translations.zh.sections.map((section) => ({ ...section })),
      },
      en: {
        ...policy.translations.en,
        sections: policy.translations.en.sections.map((section) => ({ ...section })),
      },
    },
  }));
}

function getRouteRegistration(source, method, routePath) {
  const escapedPath = routePath.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
  const routePattern = new RegExp(
    `router\\.${method}\\(\\s*["']${escapedPath}["'][\\s\\S]*?\\);`
  );
  const match = source.match(routePattern);
  return match ? match[0] : '';
}

describe('manage policies controller contract', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('exports the three policy handlers', () => {
    expect(managePolicies).toEqual(expect.objectContaining({
      getPolicies: expect.any(Function),
      updateMainPolicy: expect.any(Function),
      updatePolicies: expect.any(Function),
    }));
  });

  it.each([
    ['get', '/policies', 'getPolicies'],
    ['put', '/update-policy', 'updateMainPolicy'],
    ['put', '/update-policies', 'updatePolicies'],
  ])('registers %s %s with the external %s handler', (method, routePath, handlerName) => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'manage.js'),
      'utf8'
    );
    const registration = getRouteRegistration(source, method, routePath);

    expect(registration).not.toBe('');
    expect(registration).toMatch(new RegExp(`\\b${handlerName}\\s*\\);$`));
    expect(registration).not.toMatch(/\basync\b|=>|\bfunction\b/);
  });

  it('returns normalized default policies when no manage document exists', async () => {
    const lean = jest.fn().mockResolvedValue(null);
    Manage.findOne.mockReturnValue({ lean });
    const response = createResponse();

    await getPolicies({}, response);

    expect(Manage.findOne).toHaveBeenCalledWith();
    expect(lean).toHaveBeenCalledWith();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({
      success: 1,
      data: expect.arrayContaining([
        expect.objectContaining({
          key: 'purchase',
          translations: expect.objectContaining({
            vi: expect.any(Object),
            zh: expect.any(Object),
            en: expect.any(Object),
          }),
        }),
      ]),
    });

    const responseBody = response.json.mock.calls[0][0];
    expect(responseBody.data.map((policy) => policy.key)).toEqual(POLICY_KEYS);
  });

  it('updates the legacy mainPolicy field on the existing manage document', async () => {
    const existingManage = { _id: 'manage-id' };
    const updatedManage = { ...existingManage, mainPolicy: 'Legacy policy content' };
    Manage.findOne.mockResolvedValue(existingManage);
    Manage.findOneAndUpdate.mockResolvedValue(updatedManage);
    const request = { body: { mainPolicy: 'Legacy policy content' } };
    const response = createResponse();

    await updateMainPolicy(request, response);

    expect(Manage.findOneAndUpdate).toHaveBeenCalledWith(
      {},
      { $set: { mainPolicy: 'Legacy policy content' } },
      { new: true }
    );
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: 1,
      data: updatedManage,
    }));
  });

  it('rejects an invalid structured policy payload before querying MongoDB', async () => {
    const response = createResponse();

    await updatePolicies({ body: { policies: [] } }, response);

    expect(Manage.findOne).not.toHaveBeenCalled();
    expect(Manage.findOneAndUpdate).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: 0,
      message: expect.any(String),
    }));
  });

  it('normalizes and updates structured policies while preserving unchanged timestamps', async () => {
    const now = new Date('2030-01-02T03:04:05.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const currentPolicies = createDefaultPolicies();
    const payload = createPoliciesPayload();
    payload[0].translations.vi.sections[0].content = 'Nội dung mua hàng đã cập nhật';
    payload[0].sections[0].content = 'Nội dung mua hàng đã cập nhật';

    Manage.findOne.mockResolvedValue({ policies: currentPolicies });
    Manage.findOneAndUpdate.mockImplementation(async (_filter, update) => ({
      policies: update.$set.policies,
    }));
    const response = createResponse();

    await updatePolicies({ body: { policies: payload } }, response);

    expect(Manage.findOneAndUpdate).toHaveBeenCalledWith(
      {},
      { $set: { policies: expect.any(Array) } },
      { new: true, runValidators: true }
    );

    const persistedPolicies = Manage.findOneAndUpdate.mock.calls[0][1].$set.policies;
    expect(persistedPolicies.map((policy) => policy.key)).toEqual(POLICY_KEYS);
    expect(persistedPolicies[0].updatedAt).toEqual(now);
    expect(persistedPolicies[1].updatedAt).toEqual(currentPolicies[1].updatedAt);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: 1,
      data: persistedPolicies,
    }));
  });

  it.each([
    ['getPolicies', () => {
      Manage.findOne.mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('read failed')),
      });
      return { handler: getPolicies, request: {} };
    }],
    ['updateMainPolicy', () => {
      Manage.findOne.mockRejectedValue(new Error('legacy update failed'));
      return {
        handler: updateMainPolicy,
        request: { body: { mainPolicy: 'Legacy content' } },
      };
    }],
    ['updatePolicies', () => {
      Manage.findOne.mockRejectedValue(new Error('structured update failed'));
      return {
        handler: updatePolicies,
        request: { body: { policies: createPoliciesPayload() } },
      };
    }],
  ])('maps unexpected %s failures to the legacy 500 response', async (_name, arrange) => {
    const { handler, request } = arrange();
    const response = createResponse();

    await handler(request, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: 0,
      message: expect.any(String),
      error: expect.any(String),
    }));
  });
});
