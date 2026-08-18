const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User } = require('../models/user');
const { Product } = require('../models/product');
const { StorageHistory } = require('../models/storagehistory');
const { ActivityLog } = require('../models/activitylog');

const TEST_DB_URL = 'mongodb://localhost:27017/EcomTest';
const ADMIN_PHONE = '0917800998';
const ADMIN_NAME = 'Variant Stock Validation Admin';
const PRODUCT_CODE_PREFIX = 'VARIANT-STOCK-VALIDATION-';
const BASELINE_ORDER_PREFIX = 'VARIANT-STOCK-BASELINE-';

let adminAgent;
let productSequence = 0;

const serialize = (value) => JSON.parse(JSON.stringify(value));

const cleanTestData = async ({ includeUser = false } = {}) => {
  await Promise.all([
    StorageHistory.deleteMany({ userName: ADMIN_NAME }),
    ActivityLog.deleteMany({ userName: ADMIN_NAME }),
    Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } }),
    ...(includeUser ? [User.deleteMany({ phone: ADMIN_PHONE })] : []),
  ]);
};

const createProduct = async ({ quantityForSale = 20, quantityInStorage = 25 } = {}) => {
  productSequence += 1;
  return Product.create({
    type: 'PLC',
    name: 'Variant Stock Validation Product ' + productSequence,
    brand: 'Test Brand',
    section: 'Automation',
    value: 'PLC',
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    warranty: '12 months',
    variant: [{
      price: '100000',
      color: 'Gray',
      quantityForSale,
      quantityInStorage,
    }],
  });
};

const createUnchangedDbSentinels = async (product) => {
  const history = await StorageHistory.create({
    productId: product._id,
    productName: product.name,
    quantity: 2,
    userName: ADMIN_NAME,
    orderId: BASELINE_ORDER_PREFIX + product._id,
    orderName: 'Baseline history',
    isAIScan: false,
    source: 'product_manual',
  });

  const activity = await ActivityLog.create({
    userName: ADMIN_NAME,
    action: 'stock_validation_baseline',
    productId: product._id,
    productName: product.name,
    details: [{ field: 'baseline', oldValue: '', newValue: 'unchanged' }],
  });

  return { history, activity };
};

const readDatabaseSnapshot = async (productId) => {
  const [product, histories, activities] = await Promise.all([
    Product.findById(productId).lean(),
    StorageHistory.find({ productId }).sort({ _id: 1 }).lean(),
    ActivityLog.find({ productId }).sort({ _id: 1 }).lean(),
  ]);

  return serialize({ product, histories, activities });
};

const sendStockAdjustment = (productId, body) => {
  return adminAgent
    .post('/products/' + productId + '/0')
    .send(body);
};

const expectRejectedWithoutMutation = async (body) => {
  const product = await createProduct();
  await createUnchangedDbSentinels(product);
  const before = await readDatabaseSnapshot(product._id);

  const response = await sendStockAdjustment(product._id, body);

  expect(response.status).toBe(400);
  expect(response.status).not.toBe(500);
  expect(response.body.message).toEqual(expect.any(String));
  expect(await readDatabaseSnapshot(product._id)).toEqual(before);
};

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URL);
  await cleanTestData({ includeUser: true });

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
  expect(loginResponse.headers['set-cookie']).toBeDefined();
});

afterEach(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData({ includeUser: true });
  await mongoose.disconnect();
});

describe('manual stock action body and quantity validation', () => {
  it('rejects an array body without changing Product, StorageHistory, or ActivityLog', async () => {
    await expectRejectedWithoutMutation([{ quantity: 5 }]);
  });

  it.each([
    ['missing', {}],
    ['null', { quantity: null }],
    ['empty string', { quantity: '' }],
    ['whitespace string', { quantity: '   ' }],
    ['boolean', { quantity: true }],
    ['object', { quantity: { value: 5 } }],
    ['array', { quantity: [5] }],
    ['nonnumeric string', { quantity: 'five' }],
    ['numeric zero', { quantity: 0 }],
    ['string zero', { quantity: '0' }],
  ])('rejects %s quantity without changing the database', async (_caseName, body) => {
    await expectRejectedWithoutMutation(body);
  });
});

describe('manual stock action metadata validation', () => {
  it.each([
    ['object orderId', { quantity: 1, orderId: { id: 'ORDER-1' } }],
    ['array orderId', { quantity: 1, orderId: ['ORDER-1'] }],
    ['object orderName', { quantity: 1, orderName: { name: 'Order one' } }],
    ['array orderName', { quantity: 1, orderName: ['Order one'] }],
  ])('rejects %s without changing the database', async (_caseName, body) => {
    await expectRejectedWithoutMutation(body);
  });

  it.each([
    ['string', 'true'],
    ['number outside 0/1', 2],
    ['object', { enabled: true }],
    ['array', [1]],
  ])('rejects %s isAIScan without changing the database', async (_caseName, isAIScan) => {
    await expectRejectedWithoutMutation({ quantity: 1, isAIScan });
  });
});

describe('manual stock action valid coercion and persistence', () => {
  it('accepts a positive numeric string, updates both stock fields, and writes history', async () => {
    const product = await createProduct();

    const response = await sendStockAdjustment(product._id, {
      quantity: '5',
      orderId: 'POSITIVE-STRING',
      orderName: 'Positive numeric string',
    });

    expect(response.status).toBe(200);
    const [updatedProduct, histories] = await Promise.all([
      Product.findById(product._id).lean(),
      StorageHistory.find({ productId: product._id }).lean(),
    ]);
    expect(updatedProduct.variant[0]).toMatchObject({
      quantityForSale: 25,
      quantityInStorage: 30,
    });
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({
      quantity: 5,
      orderId: 'POSITIVE-STRING',
      orderName: 'Positive numeric string',
      isAIScan: false,
      source: 'product_manual',
    });
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });

  it('accepts a negative numeric string, updates both stock fields, and writes history', async () => {
    const product = await createProduct();

    const response = await sendStockAdjustment(product._id, {
      quantity: '-4',
      orderId: 'NEGATIVE-STRING',
      orderName: 'Negative numeric string',
    });

    expect(response.status).toBe(200);
    const [updatedProduct, histories] = await Promise.all([
      Product.findById(product._id).lean(),
      StorageHistory.find({ productId: product._id }).lean(),
    ]);
    expect(updatedProduct.variant[0]).toMatchObject({
      quantityForSale: 16,
      quantityInStorage: 21,
    });
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({
      quantity: -4,
      orderId: 'NEGATIVE-STRING',
      orderName: 'Negative numeric string',
      isAIScan: false,
      source: 'product_manual',
    });
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });

  it('lets Mongoose cast scalar order metadata', async () => {
    const product = await createProduct();

    const response = await sendStockAdjustment(product._id, {
      quantity: '1',
      orderId: 123456,
      orderName: false,
    });

    expect(response.status).toBe(200);
    const history = await StorageHistory.findOne({ productId: product._id }).lean();
    expect(history).toMatchObject({
      quantity: 1,
      orderId: '123456',
      orderName: 'false',
      isAIScan: false,
      source: 'product_manual',
    });
  });

  it.each([
    ['boolean true', true, true],
    ['boolean false', false, false],
    ['numeric one', 1, true],
    ['numeric zero', 0, false],
  ])('normalizes %s isAIScan to %s', async (_caseName, input, expected) => {
    const product = await createProduct();

    const response = await sendStockAdjustment(product._id, {
      quantity: '1',
      orderId: 'AI-SCAN-' + String(input),
      isAIScan: input,
    });

    expect(response.status).toBe(200);
    const history = await StorageHistory.findOne({ productId: product._id }).lean();
    expect(history.isAIScan).toBe(expected);
  });
});

describe('manual stock action validation precedence', () => {
  it('returns the quantity validation error before looking up a missing product', async () => {
    const untouchedProduct = await createProduct();
    await createUnchangedDbSentinels(untouchedProduct);
    const before = await readDatabaseSnapshot(untouchedProduct._id);
    const missingProductId = new mongoose.Types.ObjectId();

    const response = await sendStockAdjustment(missingProductId, { quantity: 'not-a-number' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Quantity must be a number');
    expect(await readDatabaseSnapshot(untouchedProduct._id)).toEqual(before);
  });
});
