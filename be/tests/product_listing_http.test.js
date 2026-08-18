const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const ADMIN_PHONE = '0974000031';
const ADMIN_NAME = 'Product Listing Admin';
const PRODUCT_CODE_PREFIX = 'LISTING-HTTP-';

let adminAgent;
let productSequence = 0;

const createProduct = async (name, overrides = {}) => {
  productSequence += 1;
  const { createdAt, ...productOverrides } = overrides;
  const product = await Product.create({
    type: 'PLC',
    name,
    brand: 'Siemens',
    section: 'Automation',
    value: 'PLC',
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    warranty: '12 months',
    display: true,
    purchaseCount: 0,
    averageReviews: 0,
    variant: [{
      price: '100000',
      importPrice: '70000',
      earn: 30,
      quantityForSale: 10,
      quantityInStorage: 12,
    }],
    ...productOverrides,
  });

  if (createdAt) {
    await Product.collection.updateOne(
      { _id: product._id },
      { $set: { createdAt } },
    );
    return Product.findById(product._id);
  }

  return product;
};

const cleanupTestData = async ({ includeUser = false } = {}) => {
  await Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } });
  if (includeUser) {
    await User.deleteMany({ phone: ADMIN_PHONE });
  }
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupTestData({ includeUser: true });
  await User.create({
    phone: ADMIN_PHONE,
    password: 'password123',
    name: ADMIN_NAME,
    role: 'admin',
  });
  adminAgent = request.agent(app);
  const loginResponse = await adminAgent
    .post('/users/admin/login')
    .send({ phone: ADMIN_PHONE, password: 'password123' });
  expect(loginResponse.status).toBe(200);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData({ includeUser: true });
  await mongoose.disconnect();
});

describe('GET /products listing characterization', () => {
  it('keeps legacy pagination coercion, sort fallback, defaults, and response envelope', async () => {
    await createProduct('Low Purchase', { purchaseCount: 1 });
    await createProduct('Middle Purchase', { purchaseCount: 2 });
    await createProduct('High Purchase', { purchaseCount: 3 });

    const response = await request(app).get('/products').query({
      page: '2suffix',
      limit: '1suffix',
      sortBy: 'unsupported-field',
      sortOrder: 'asc',
    });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['limit', 'page', 'products', 'total']);
    expect(response.body).toEqual(expect.objectContaining({
      total: 3,
      page: 2,
      limit: 1,
    }));
    expect(response.body.products).toHaveLength(1);
    expect(response.body.products[0]).toEqual(expect.objectContaining({
      name: 'Middle Purchase',
      purchaseCount: 2,
      averageReviews: 0,
      adjusted: true,
    }));
  });

  it('ranks full search phrases before token-only matches and paginates in memory', async () => {
    await createProduct('Alpha Beta Controller', { purchaseCount: 0 });
    await createProduct('Beta Alpha Controller', { purchaseCount: 100 });

    const firstPage = await request(app).get('/products').query({
      search: 'Alpha Beta',
      page: 1,
      limit: 1,
    });
    const secondPage = await request(app).get('/products').query({
      search: 'Alpha Beta',
      page: 2,
      limit: 1,
    });

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.total).toBe(2);
    expect(firstPage.body.products.map((product) => product.name)).toEqual([
      'Alpha Beta Controller',
    ]);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.total).toBe(2);
    expect(secondPage.body.products.map((product) => product.name)).toEqual([
      'Beta Alpha Controller',
    ]);
  });

  it('keeps fuzzy code matching and the legacy name fallback for the code query', async () => {
    await createProduct('Fuzzy Code Product', {
      code: PRODUCT_CODE_PREFIX + 'TT-SM/1',
    });
    await createProduct('TTSM1 Name Fallback', {
      code: PRODUCT_CODE_PREFIX + 'OTHER-CODE',
    });

    const response = await request(app).get('/products').query({ code: 'TTSM1' });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.products.map((product) => product.name).sort()).toEqual([
      'Fuzzy Code Product',
      'TTSM1 Name Fallback',
    ]);
  });

  it('drops both type and brand after an empty result while preserving section and value', async () => {
    await createProduct('Relaxed Match', {
      type: 'PLC',
      brand: 'Siemens',
      section: 'Target Section',
      value: 'Target Value',
    });
    await createProduct('Wrong Section', {
      type: 'PLC',
      brand: 'Siemens',
      section: 'Other Section',
      value: 'Target Value',
    });

    const response = await request(app).get('/products').query({
      type: 'Missing Type',
      brand: 'Missing Brand',
      section: 'Target Section',
      value: 'Target Value',
    });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.products.map((product) => product.name)).toEqual(['Relaxed Match']);
  });

  it('progressively narrows entity tokens while preserving the code constraint', async () => {
    await createProduct('Alpha Target', {
      code: PRODUCT_CODE_PREFIX + 'MATCH-1',
    });
    await createProduct('Alpha Distractor', {
      code: PRODUCT_CODE_PREFIX + 'OTHER-1',
    });

    const response = await request(app).get('/products').query({
      search: 'Tìm Alpha MissingToken',
      code: 'MATCH1',
    });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.products.map((product) => product.name)).toEqual(['Alpha Target']);
  });

  it('filters adjusted dynamically instead of trusting the stored adjusted field', async () => {
    await createProduct('Computed Adjusted True', { adjusted: false });
    await createProduct('Computed Adjusted False', {
      adjusted: true,
      brand: 'Chưa có',
    });

    const adjustedResponse = await request(app)
      .get('/products')
      .query({ adjusted: 'true' });
    const unadjustedResponse = await request(app)
      .get('/products')
      .query({ adjusted: 'false' });

    expect(adjustedResponse.status).toBe(200);
    expect(adjustedResponse.body.products.map((product) => product.name)).toEqual([
      'Computed Adjusted True',
    ]);
    expect(adjustedResponse.body.products[0].adjusted).toBe(true);
    expect(unadjustedResponse.status).toBe(200);
    expect(unadjustedResponse.body.products.map((product) => product.name)).toEqual([
      'Computed Adjusted False',
    ]);
    expect(unadjustedResponse.body.products[0].adjusted).toBe(false);
  });

  it('ignores display for guests but honors it for privileged viewers', async () => {
    await createProduct('Visible Product');
    await createProduct('Hidden Product', { display: false });

    const guestResponse = await request(app)
      .get('/products')
      .query({ display: 'false' });
    const adminResponse = await adminAgent
      .get('/products')
      .query({ display: 'false' });

    expect(guestResponse.status).toBe(200);
    expect(guestResponse.body.products.map((product) => product.name)).toEqual([
      'Visible Product',
    ]);
    expect(guestResponse.body.products[0].variant[0].importPrice).toBeUndefined();
    expect(guestResponse.body.products[0].variant[0].earn).toBeUndefined();
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.products.map((product) => product.name)).toEqual([
      'Hidden Product',
    ]);
    expect(adminResponse.body.products[0].variant[0]).toEqual(expect.objectContaining({
      importPrice: '70000',
      earn: 30,
    }));
  });

  it('keeps the legacy createdAt descending order even when ascending is requested', async () => {
    await createProduct('Older Product', {
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await createProduct('Newer Product', {
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const response = await request(app).get('/products').query({
      sortBy: 'createdAt',
      sortOrder: 'asc',
    });

    expect(response.status).toBe(200);
    expect(response.body.products.map((product) => product.name)).toEqual([
      'Newer Product',
      'Older Product',
    ]);
  });

  it('keeps the exact generic database error response', async () => {
    jest.spyOn(Product, 'find').mockImplementationOnce(() => {
      throw new Error('forced listing failure');
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app).get('/products');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: 'Server error. Please try again later.',
    });
  });
});
