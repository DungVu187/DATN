const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ActivityLog } = require('../models/activitylog');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const TEST_DB_URL = 'mongodb://localhost:27017/EcomTest';
const ADMIN_PHONE = '0917400999';
const ADMIN_NAME = 'Variant Pricing Action Validation Admin';
const PRODUCT_CODE_PREFIX = 'VARIANT-PRICING-ACTION-';
const PRODUCT_NAME_PREFIX = 'Variant Pricing Action Product';

let adminAgent;
let productSequence = 0;

const serialize = (value) => JSON.parse(JSON.stringify(value));

const cleanupTestData = async ({ includeUser = false } = {}) => {
  await Promise.all([
    ActivityLog.deleteMany({
      $or: [
        { userName: ADMIN_NAME },
        { productName: { $regex: '^' + PRODUCT_NAME_PREFIX } },
      ],
    }),
    Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } }),
    ...(includeUser ? [User.deleteMany({ phone: ADMIN_PHONE })] : []),
  ]);
};

const createProduct = async ({
  importPrice = '123.456',
  earn = 10,
  price = '100000',
} = {}) => {
  productSequence += 1;
  return Product.create({
    type: 'PLC',
    name: PRODUCT_NAME_PREFIX + ' ' + productSequence,
    brand: 'Test Brand',
    section: 'Automation',
    value: 'PLC',
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    warranty: '12 months',
    adjusted: false,
    variant: [{
      price,
      importPrice,
      earn,
      color: 'Gray',
      quantityForSale: 8,
      quantityInStorage: 13,
      note: 'unchanged note',
    }],
  });
};

const readProductSnapshot = async (productId) => {
  const product = await Product.findById(productId).lean();
  return serialize(product);
};

const readActivityLogSnapshot = async (productId) => {
  const logs = await ActivityLog.find({ productId }).sort({ _id: 1 }).lean();
  return serialize(logs);
};

const buildActionRequest = (action, productId) => {
  return adminAgent.put('/products/' + productId + '/0/' + action);
};

const expectRejectedWithoutMutation = async (action, body) => {
  const product = await createProduct();
  const beforeProduct = await readProductSnapshot(product._id);
  const beforeLogs = await readActivityLogSnapshot(product._id);

  const response = await buildActionRequest(action, product._id).send(body);

  expect(response.status).toBe(400);
  expect(response.status).not.toBe(500);
  expect(await readProductSnapshot(product._id)).toEqual(beforeProduct);
  expect(await readActivityLogSnapshot(product._id)).toEqual(beforeLogs);
};

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URL);
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
  expect(loginResponse.headers['set-cookie']).toBeDefined();
});

afterEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData({ includeUser: true });
  await mongoose.disconnect();
});

describe('PUT /products/:id/:variantIndex/update-earn validation', () => {
  it('rejects an array body without changing Product or ActivityLog', async () => {
    await expectRejectedWithoutMutation('update-earn', [{ earn: 25 }]);
  });

  it.each([
    ['missing earn', {}],
    ['null earn', { earn: null }],
    ['string earn', { earn: '25' }],
    ['negative earn', { earn: -1 }],
    ['object earn', { earn: { value: 25 } }],
    ['array earn', { earn: [25] }],
  ])('rejects %s without changing Product or ActivityLog', async (_caseName, body) => {
    await expectRejectedWithoutMutation('update-earn', body);
  });

  it('validates an invalid payload before looking up a missing product', async () => {
    const missingProductId = new mongoose.Types.ObjectId();
    const beforeLogs = await readActivityLogSnapshot(missingProductId);

    const response = await buildActionRequest('update-earn', missingProductId)
      .send({ earn: '25' });

    expect(response.status).toBe(400);
    expect(await Product.findById(missingProductId)).toBeNull();
    expect(await readActivityLogSnapshot(missingProductId)).toEqual(beforeLogs);
  });

  it('updates earn, rounds price up to 1000, and ignores unknown fields', async () => {
    const product = await createProduct({
      importPrice: '123.456',
      earn: 10,
      price: '100000',
    });

    const response = await buildActionRequest('update-earn', product._id)
      .send({
        earn: 25,
        unknownField: { shouldBeIgnored: true },
      });

    expect(response.status).toBe(200);
    const updated = await Product.findById(product._id).lean();
    expect(updated.adjusted).toBe(true);
    expect(updated.variant[0]).toMatchObject({
      earn: 25,
      importPrice: '123.456',
      price: '155000',
      quantityForSale: 8,
      quantityInStorage: 13,
      note: 'unchanged note',
    });
    expect(updated.unknownField).toBeUndefined();

    const logs = await ActivityLog.find({ productId: product._id }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      userName: ADMIN_NAME,
      action: 'update_earn',
      productId: product._id,
      productName: product.name,
    });
    expect(logs[0].details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'variant[0].earn',
        oldValue: '10%',
        newValue: '25%',
      }),
      expect.objectContaining({
        field: 'variant[0].price',
        oldValue: '100000',
        newValue: '155000',
      }),
    ]));
  });
});

describe('PUT /products/:id/:variantIndex/update-import-price validation', () => {
  it('rejects an array body without changing Product or ActivityLog', async () => {
    await expectRejectedWithoutMutation('update-import-price', [{ importPrice: '200.000' }]);
  });

  it.each([
    ['missing importPrice', {}],
    ['empty importPrice', { importPrice: '' }],
    ['number importPrice', { importPrice: 200000 }],
    ['object importPrice', { importPrice: { value: '200.000' } }],
    ['array importPrice', { importPrice: ['200.000'] }],
    ['nonnumeric importPrice', { importPrice: '200.000x' }],
    ['negative importPrice', { importPrice: '-200.000' }],
  ])('rejects %s without changing Product or ActivityLog', async (_caseName, body) => {
    await expectRejectedWithoutMutation('update-import-price', body);
  });

  it('validates an invalid payload before looking up a missing product', async () => {
    const missingProductId = new mongoose.Types.ObjectId();
    const beforeLogs = await readActivityLogSnapshot(missingProductId);

    const response = await buildActionRequest('update-import-price', missingProductId)
      .send({ importPrice: 200000 });

    expect(response.status).toBe(400);
    expect(await Product.findById(missingProductId)).toBeNull();
    expect(await readActivityLogSnapshot(missingProductId)).toEqual(beforeLogs);
  });

  it('keeps the dotted raw string, updates pricing fields, logs changes, and ignores unknown fields', async () => {
    const product = await createProduct({
      importPrice: '123.456',
      earn: 20,
      price: '100000',
    });

    const response = await buildActionRequest('update-import-price', product._id)
      .send({
        importPrice: '234.567',
        unknownField: ['ignored'],
      });

    expect(response.status).toBe(200);
    const updated = await Product.findById(product._id).lean();
    expect(updated.adjusted).toBe(true);
    expect(updated.variant[0]).toMatchObject({
      earn: 20,
      importPrice: '234.567',
      price: '282000',
      quantityForSale: 8,
      quantityInStorage: 13,
      note: 'unchanged note',
    });
    expect(updated.unknownField).toBeUndefined();

    const logs = await ActivityLog.find({ productId: product._id }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      userName: ADMIN_NAME,
      action: 'update_import_price',
      productId: product._id,
      productName: product.name,
    });
    expect(logs[0].details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'variant[0].importPrice',
        oldValue: '123.456',
        newValue: '234.567',
      }),
      expect.objectContaining({
        field: 'variant[0].price',
        oldValue: '100000',
        newValue: '282000',
      }),
    ]));
  });
});
