const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ActivityLog } = require('../models/activitylog');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const ADMIN_PHONE = '0972800001';
const ALLOWED_STAFF_PHONE = '0972800002';
const BLOCKED_STAFF_PHONE = '0972800003';
const ADMIN_NAME = 'Bulk Delete HTTP Admin';
const ALLOWED_STAFF_NAME = 'Bulk Delete HTTP Allowed Staff';
const BLOCKED_STAFF_NAME = 'Bulk Delete HTTP Blocked Staff';
const PRODUCT_CODE_PREFIX = 'BULK-DELETE-HTTP-';
const PRODUCT_NAME_PREFIX = 'Bulk Delete HTTP Product';
const TEST_USER_NAMES = [ADMIN_NAME, ALLOWED_STAFF_NAME, BLOCKED_STAFF_NAME];
const TEST_PHONES = [ADMIN_PHONE, ALLOWED_STAFF_PHONE, BLOCKED_STAFF_PHONE];

let adminAgent;
let allowedStaffAgent;
let blockedStaffAgent;
let productSequence = 0;

const serialize = (value) => JSON.parse(JSON.stringify(value));

const cleanupFixtures = async ({ includeUsers = false } = {}) => {
  await Promise.all([
    ActivityLog.deleteMany({
      $or: [
        { userName: { $in: TEST_USER_NAMES } },
        { productName: { $regex: '^' + PRODUCT_NAME_PREFIX } },
      ],
    }),
    Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } }),
    ...(includeUsers ? [User.deleteMany({ phone: { $in: TEST_PHONES } })] : []),
  ]);
};

const createAuthenticatedAgent = async ({ phone, name, role, permissions = [] }) => {
  await User.create({
    phone,
    password: 'password123',
    name,
    role,
    functions: ['product_management'],
    permissions,
  });

  const agent = request.agent(app);
  const loginResponse = await agent
    .post('/users/admin/login')
    .send({ phone, password: 'password123' });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.headers['set-cookie']).toBeDefined();
  return agent;
};

const createProduct = async (label = 'Fixture') => {
  productSequence += 1;
  return Product.create({
    type: 'PLC',
    name: PRODUCT_NAME_PREFIX + ' ' + label + ' ' + productSequence,
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    brand: 'Bulk Delete Test Brand',
    section: 'Bulk Delete Test Section',
    value: 'PLC',
    warranty: '12 months',
    variant: [{
      price: '100000',
      color: 'Gray',
      quantityForSale: 10,
      quantityInStorage: 10,
    }],
  });
};

const createBaselineLog = async (product, userName = ADMIN_NAME) => {
  return ActivityLog.create({
    userName,
    action: 'bulk_delete_validation_baseline',
    productId: product._id,
    productName: product.name,
    details: [{ field: 'baseline', oldValue: '', newValue: 'unchanged' }],
  });
};

const readFixtureSnapshot = async (productId) => {
  const [product, logs] = await Promise.all([
    Product.findById(productId).lean(),
    ActivityLog.find({ productId }).sort({ _id: 1 }).lean(),
  ]);
  return serialize({ product, logs });
};

const sendBulkDelete = (agent, body) => {
  return agent.post('/products/bulk-delete').send(body);
};

const expectRejectedBeforeDatabase = async (bodyFactory, { rawJson = false } = {}) => {
  const sentinel = await createProduct('Malformed Sentinel');
  await createBaselineLog(sentinel);
  const before = await readFixtureSnapshot(sentinel._id);
  const productFindSpy = jest.spyOn(Product, 'find');
  const productDeleteManySpy = jest.spyOn(Product, 'deleteMany');
  const activityInsertManySpy = jest.spyOn(ActivityLog, 'insertMany');

  let response;
  try {
    const requestBuilder = adminAgent.post('/products/bulk-delete');
    if (rawJson) {
      response = await requestBuilder
        .set('Content-Type', 'application/json')
        .send('null');
    } else {
      const body = typeof bodyFactory === 'function'
        ? bodyFactory(sentinel)
        : bodyFactory;
      response = await requestBuilder.send(body);
    }

    expect(response.status).toBe(400);
    expect(response.status).not.toBe(500);
    expect(response.body.message).toEqual(expect.any(String));
    expect(productFindSpy).not.toHaveBeenCalled();
    expect(productDeleteManySpy).not.toHaveBeenCalled();
    expect(activityInsertManySpy).not.toHaveBeenCalled();
  } finally {
    productFindSpy.mockRestore();
    productDeleteManySpy.mockRestore();
    activityInsertManySpy.mockRestore();
  }

  expect(await readFixtureSnapshot(sentinel._id)).toEqual(before);
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupFixtures({ includeUsers: true });

  adminAgent = await createAuthenticatedAgent({
    phone: ADMIN_PHONE,
    name: ADMIN_NAME,
    role: 'admin',
  });
  allowedStaffAgent = await createAuthenticatedAgent({
    phone: ALLOWED_STAFF_PHONE,
    name: ALLOWED_STAFF_NAME,
    role: 'staff',
    permissions: ['product.delete'],
  });
  blockedStaffAgent = await createAuthenticatedAgent({
    phone: BLOCKED_STAFF_PHONE,
    name: BLOCKED_STAFF_NAME,
    role: 'staff',
    permissions: ['product.edit'],
  });
});

afterEach(async () => {
  await cleanupFixtures();
});

afterAll(async () => {
  await cleanupFixtures({ includeUsers: true });
  await mongoose.disconnect();
});

describe('POST /products/bulk-delete authorization', () => {
  it('returns 401 without authentication and leaves Product and ActivityLog unchanged', async () => {
    const product = await createProduct('Unauthenticated');
    await createBaselineLog(product);
    const before = await readFixtureSnapshot(product._id);

    const response = await request(app)
      .post('/products/bulk-delete')
      .send({ ids: [product._id.toString()] });

    expect(response.status).toBe(401);
    expect(response.body.message).toEqual(expect.any(String));
    expect(await readFixtureSnapshot(product._id)).toEqual(before);
  });

  it('returns 403 for staff without product.delete and leaves data unchanged', async () => {
    const product = await createProduct('Blocked Staff');
    await createBaselineLog(product, BLOCKED_STAFF_NAME);
    const before = await readFixtureSnapshot(product._id);

    const response = await sendBulkDelete(blockedStaffAgent, {
      ids: [product._id.toString()],
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: product.delete');
    expect(await readFixtureSnapshot(product._id)).toEqual(before);
  });
});

describe('POST /products/bulk-delete success behavior', () => {
  it('lets an admin delete multiple products and writes one corresponding ActivityLog per product', async () => {
    const firstProduct = await createProduct('Admin First');
    const secondProduct = await createProduct('Admin Second');

    const response = await sendBulkDelete(adminAgent, {
      ids: [firstProduct._id.toString(), secondProduct._id.toString()],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Đã xóa thành công 2 sản phẩm.' });
    expect(await Product.countDocuments({
      _id: { $in: [firstProduct._id, secondProduct._id] },
    })).toBe(0);

    const logs = await ActivityLog.find({
      userName: ADMIN_NAME,
      action: 'delete_product',
      productId: { $in: [firstProduct._id, secondProduct._id] },
    }).sort({ productName: 1 }).lean();
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.productId.toString()).sort()).toEqual([
      firstProduct._id.toString(),
      secondProduct._id.toString(),
    ].sort());
    expect(logs.map((log) => log.productName).sort()).toEqual([
      firstProduct.name,
      secondProduct.name,
    ].sort());
    for (const log of logs) {
      expect(log.details).toEqual([expect.objectContaining({
        field: 'Xóa sản phẩm hàng loạt',
        oldValue: log.productName,
        newValue: '',
      })]);
    }
  });

  it('lets staff with product.delete delete multiple products and records the staff name', async () => {
    const firstProduct = await createProduct('Allowed Staff First');
    const secondProduct = await createProduct('Allowed Staff Second');

    const response = await sendBulkDelete(allowedStaffAgent, {
      ids: [firstProduct._id.toString(), secondProduct._id.toString()],
    });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Đã xóa thành công 2 sản phẩm.');
    expect(await Product.countDocuments({
      _id: { $in: [firstProduct._id, secondProduct._id] },
    })).toBe(0);
    expect(await ActivityLog.countDocuments({
      userName: ALLOWED_STAFF_NAME,
      action: 'delete_product',
      productId: { $in: [firstProduct._id, secondProduct._id] },
    })).toBe(2);
  });

  it('returns success with deleted count 0 for valid nonexistent ids', async () => {
    const sentinel = await createProduct('Nonexistent IDs Sentinel');
    await createBaselineLog(sentinel);
    const before = await readFixtureSnapshot(sentinel._id);
    const missingIds = [
      new mongoose.Types.ObjectId().toString(),
      new mongoose.Types.ObjectId().toString(),
    ];

    const response = await sendBulkDelete(adminAgent, { ids: missingIds });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Đã xóa thành công 0 sản phẩm.' });
    expect(await readFixtureSnapshot(sentinel._id)).toEqual(before);
    expect(await ActivityLog.countDocuments({
      userName: ADMIN_NAME,
      action: 'delete_product',
      productId: { $in: missingIds },
    })).toBe(0);
  });

  it('keeps duplicate-id behavior by deleting and logging each matching product once', async () => {
    const firstProduct = await createProduct('Duplicate First');
    const secondProduct = await createProduct('Duplicate Second');
    const duplicateIds = [
      firstProduct._id.toString(),
      firstProduct._id.toString(),
      secondProduct._id.toString(),
      secondProduct._id.toString(),
      firstProduct._id.toString(),
    ];

    const response = await sendBulkDelete(adminAgent, { ids: duplicateIds });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Đã xóa thành công 2 sản phẩm.' });
    expect(await Product.countDocuments({
      _id: { $in: [firstProduct._id, secondProduct._id] },
    })).toBe(0);
    expect(await ActivityLog.countDocuments({
      userName: ADMIN_NAME,
      action: 'delete_product',
      productId: { $in: [firstProduct._id, secondProduct._id] },
    })).toBe(2);
  });
});

describe('POST /products/bulk-delete payload validation', () => {
  it('rejects an array body before database access', async () => {
    await expectRejectedBeforeDatabase([{ ids: [] }]);
  });

  it('rejects a null body before database access', async () => {
    await expectRejectedBeforeDatabase(null, { rawJson: true });
  });

  it.each([
    ['missing ids', {}],
    ['null ids', { ids: null }],
    ['string ids', { ids: '507f1f77bcf86cd799439011' }],
    ['number ids', { ids: 2026 }],
    ['object ids', { ids: { value: '507f1f77bcf86cd799439011' } }],
    ['empty ids', { ids: [] }],
  ])('rejects %s before database access', async (_caseName, body) => {
    await expectRejectedBeforeDatabase(body);
  });

  it.each([
    ['malformed string', 'not-an-object-id'],
    ['empty string', ''],
    ['whitespace string', '   '],
    ['number', 123],
    ['boolean', true],
    ['null', null],
    ['object', { id: '507f1f77bcf86cd799439011' }],
    ['array', ['507f1f77bcf86cd799439011']],
  ])('rejects an invalid %s item before database access', async (_caseName, invalidItem) => {
    await expectRejectedBeforeDatabase((sentinel) => ({
      ids: [sentinel._id.toString(), invalidItem],
    }));
  });
});
