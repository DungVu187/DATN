const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const PRODUCT_CODE_PREFIX = 'BATCH-READ-HTTP-';
const PRODUCT_NAME_PREFIX = 'Batch Read HTTP';
const CUSTOMER_PHONE = '0958272701';
const ADMIN_PHONE = '0958272702';
const PASSWORD = 'password123';
const TEST_PRODUCT_FILTER = {
  $or: [
    { code: { $regex: '^' + PRODUCT_CODE_PREFIX } },
    { name: { $regex: '^' + PRODUCT_NAME_PREFIX } },
  ],
};

let customerAgent;
let adminAgent;
let productSequence = 0;

const cleanupFixtures = async ({ includePersistentUsers = false } = {}) => {
  await Promise.all([
    Product.deleteMany(TEST_PRODUCT_FILTER),
    ...(includePersistentUsers
      ? [User.deleteMany({ phone: { $in: [CUSTOMER_PHONE, ADMIN_PHONE] } })]
      : []),
  ]);
};

const createProduct = async (label, overrides = {}) => {
  productSequence += 1;

  return Product.create({
    type: 'PLC',
    name: PRODUCT_NAME_PREFIX + ' ' + label + ' ' + productSequence,
    code: PRODUCT_CODE_PREFIX + label.toUpperCase() + '-' + productSequence,
    brand: 'Batch Read Brand',
    section: 'Batch Read Section',
    value: 'PLC',
    warranty: '12 months',
    display: true,
    purchaseCount: 0,
    averageReviews: 0,
    reviewCount: 0,
    totalRating: 0,
    variant: [{
      price: '125000',
      importPrice: '100000',
      earn: 25,
      color: 'Gray',
      quantityForSale: 5,
      quantityInStorage: 7,
    }],
    ...overrides,
  });
};

const createAuthenticatedAgent = async ({ phone, name, role }) => {
  await User.create({
    phone,
    password: PASSWORD,
    name,
    role,
  });

  const agent = request.agent(app);
  const endpoint = role === 'customer' ? '/users/login' : '/users/admin/login';
  const loginResponse = await agent
    .post(endpoint)
    .send({ phone, password: PASSWORD });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.headers['set-cookie']).toBeDefined();
  return agent;
};

const createVisibilityScenario = async () => {
  const insideProduct = await createProduct('Inside');
  const hiddenProduct = await createProduct('Hidden', { display: false });
  const outsideProduct = await createProduct('Outside');

  return { insideProduct, hiddenProduct, outsideProduct };
};

const fetchByIds = (client, ids) => client
  .post('/products/fetch-by-ids')
  .send({ ids });

const fetchByCodes = (client, codes) => client
  .post('/products/by-codes')
  .send({ codes });

const expectSuccessEnvelope = (response, expectedTotal) => {
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    success: 1,
    total: expectedTotal,
    products: expect.any(Array),
  });
  expect(response.body.products).toHaveLength(expectedTotal);
};

const expectFetchCodes = (response, expectedCodes) => {
  expectSuccessEnvelope(response, expectedCodes.length);
  expect(response.body.products.map((product) => product.code).sort()).toEqual(
    [...expectedCodes].sort()
  );
};

const expectByCodeItems = (response, expectedProducts) => {
  expectSuccessEnvelope(response, expectedProducts.length);

  response.body.products.forEach((product) => {
    expect(product).toEqual({
      code: expect.any(String),
      _id: expect.any(String),
    });
  });

  const expectedByCode = new Map(
    expectedProducts.map((product) => [product.code, product._id.toString()])
  );
  expect(new Map(
    response.body.products.map((product) => [product.code, product._id])
  )).toEqual(expectedByCode);
};

const expectPrivateVariantFieldsStripped = (products) => {
  products.forEach((product) => {
    expect(product.variant).toEqual(expect.any(Array));
    expect(product.variant[0]).not.toHaveProperty('importPrice');
    expect(product.variant[0]).not.toHaveProperty('earn');
  });
};

const expectFetchBadRequestShape = (response) => {
  expect(response.status).toBe(400);
  expect(response.status).not.toBe(500);
  expect(response.body).toEqual({
    success: 0,
    message: expect.any(String),
  });
};

const expectMessageOnlyError = (response, status) => {
  expect(response.status).toBe(status);
  expect(response.status).not.toBe(500);
  expect(response.body).toEqual({ message: expect.any(String) });
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupFixtures({ includePersistentUsers: true });

  customerAgent = await createAuthenticatedAgent({
    phone: CUSTOMER_PHONE,
    name: 'Batch Read HTTP Customer',
    role: 'customer',
  });
  adminAgent = await createAuthenticatedAgent({
    phone: ADMIN_PHONE,
    name: 'Batch Read HTTP Admin',
    role: 'admin',
  });
});

afterEach(async () => {
  await cleanupFixtures();
});

afterAll(async () => {
  await cleanupFixtures({ includePersistentUsers: true });
  await mongoose.disconnect();
});

describe('Product batch read HTTP endpoints', () => {
  it('keeps guest visibility and strips private variant fields', async () => {
    const { insideProduct, hiddenProduct, outsideProduct } = await createVisibilityScenario();
    const products = [insideProduct, hiddenProduct, outsideProduct];

    const fetchResponse = await fetchByIds(
      request(app),
      products.map((product) => product._id.toString())
    );
    expectFetchCodes(fetchResponse, [insideProduct.code, outsideProduct.code]);
    expectPrivateVariantFieldsStripped(fetchResponse.body.products);

    const byCodesResponse = await fetchByCodes(
      request(app),
      products.map((product) => product.code)
    );
    expectByCodeItems(byCodesResponse, [insideProduct, outsideProduct]);
  });

  it('lets customers read every public product', async () => {
    const { insideProduct, hiddenProduct, outsideProduct } = await createVisibilityScenario();
    const products = [insideProduct, hiddenProduct, outsideProduct];

    const fetchResponse = await fetchByIds(
      customerAgent,
      products.map((product) => product._id.toString())
    );
    expectFetchCodes(fetchResponse, [insideProduct.code, outsideProduct.code]);
    expectPrivateVariantFieldsStripped(fetchResponse.body.products);

    const byCodesResponse = await fetchByCodes(
      customerAgent,
      products.map((product) => product.code)
    );
    expectByCodeItems(byCodesResponse, [insideProduct, outsideProduct]);
  });

  it('lets admins see hidden products while keeping batch pricing private', async () => {
    const { insideProduct, hiddenProduct, outsideProduct } = await createVisibilityScenario();
    const products = [insideProduct, hiddenProduct, outsideProduct];

    const fetchResponse = await fetchByIds(
      adminAgent,
      products.map((product) => product._id.toString())
    );
    expectFetchCodes(fetchResponse, products.map((product) => product.code));
    expectPrivateVariantFieldsStripped(fetchResponse.body.products);

    const byCodesResponse = await fetchByCodes(
      adminAgent,
      products.map((product) => product.code)
    );
    expectByCodeItems(byCodesResponse, products);
  });

  it('returns the exact empty fetch envelope without viewer or product queries', async () => {
    const viewerQuerySpy = jest.spyOn(User, 'findById');
    const productQuerySpy = jest.spyOn(Product, 'find');

    const response = await fetchByIds(request(app), []);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: 1, total: 0, products: [] });
    expect(viewerQuerySpy).not.toHaveBeenCalled();
    expect(productQuerySpy).not.toHaveBeenCalled();
  });

  it('filters invalid IDs when at least one valid ID remains', async () => {
    const matchedProduct = await createProduct('Mixed Valid Id');

    const response = await fetchByIds(request(app), [
      'not-an-object-id',
      matchedProduct._id.toString(),
      null,
      { invalid: true },
    ]);

    expectFetchCodes(response, [matchedProduct.code]);
    expectPrivateVariantFieldsStripped(response.body.products);
  });

  it('rejects fetch requests when every ID is invalid', async () => {
    const response = await fetchByIds(request(app), [
      'not-an-object-id',
      '',
      null,
      { invalid: true },
    ]);

    expectFetchBadRequestShape(response);
  });

  it.each([
    ['array body', []],
    ['missing ids', {}],
    ['string ids', { ids: 'not-an-array' }],
    ['object ids', { ids: { value: 'not-an-array' } }],
  ])('rejects malformed fetch payload: %s', async (_label, payload) => {
    const response = await request(app)
      .post('/products/fetch-by-ids')
      .send(payload);

    expectFetchBadRequestShape(response);
  });

  it.each([
    ['array body', []],
    ['empty codes', { codes: [] }],
    ['string codes', { codes: 'not-an-array' }],
    ['object item', { codes: [{ code: 'OBJECT' }] }],
    ['array item', { codes: [['NESTED']] }],
  ])('rejects malformed by-codes payload: %s', async (_label, payload) => {
    const response = await request(app)
      .post('/products/by-codes')
      .send(payload);

    expectMessageOnlyError(response, 400);
  });

  it('returns the exact not-found shape when no visible code matches', async () => {
    const hiddenProduct = await createProduct('Hidden Only', { display: false });

    const response = await fetchByCodes(request(app), [hiddenProduct.code]);

    expectMessageOnlyError(response, 404);
  });

  it('keeps Mongoose scalar-to-string coercion for product codes', async () => {
    const numericCode = 26072701;
    const product = await createProduct('Numeric Code', { code: numericCode });

    const response = await fetchByCodes(request(app), [numericCode]);

    expectByCodeItems(response, [product]);
    expect(response.body.products[0].code).toBe(String(numericCode));
  });

  it('validates malformed guest payloads before viewer or product queries', async () => {
    const viewerQuerySpy = jest.spyOn(User, 'findById');
    const productQuerySpy = jest.spyOn(Product, 'find');

    const fetchResponse = await request(app)
      .post('/products/fetch-by-ids')
      .send({ ids: 'not-an-array' });
    const byCodesResponse = await request(app)
      .post('/products/by-codes')
      .send({ codes: [{ invalid: true }] });

    expectFetchBadRequestShape(fetchResponse);
    expectMessageOnlyError(byCodesResponse, 400);
    expect(viewerQuerySpy).not.toHaveBeenCalled();
    expect(productQuerySpy).not.toHaveBeenCalled();
  });
});
