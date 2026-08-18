const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ActivityLog } = require('../models/activitylog');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const ADMIN_PHONE = '0972800001';
const EDITOR_PHONE = '0972800002';
const BLOCKED_PHONE = '0972800003';
const ADMIN_NAME = 'Product Update Admin';
const EDITOR_NAME = 'Product Update Editor';
const BLOCKED_NAME = 'Product Update Blocked';
const PRODUCT_CODE_PREFIX = 'PRODUCT-UPDATE-';

let adminAgent;
let editorAgent;
let blockedAgent;

const buildProductPayload = (overrides = {}) => ({
  type: 'PLC',
  name: 'Product Update Base',
  code: PRODUCT_CODE_PREFIX + Date.now() + '-' + Math.random(),
  brand: 'Siemens',
  section: 'Automation',
  value: 'PLC',
  warranty: '12 months',
  description: '',
  purchaseCount: 7,
  variant: [
    {
      price: '100000',
      importPrice: '75000',
      earn: 25,
      color: 'Gray',
      note: 'First',
      quantityForSale: 10,
      quantityInStorage: 12,
    },
    {
      price: '200000',
      importPrice: '150000',
      earn: 25,
      color: 'Black',
      note: 'Second',
      quantityForSale: 20,
      quantityInStorage: 22,
    },
  ],
  ...overrides,
});

const createProduct = (overrides = {}) => Product.create(buildProductPayload(overrides));

const cleanupTestData = async ({ includeUsers = false } = {}) => {
  await Promise.all([
    ActivityLog.deleteMany({ userName: { $in: [ADMIN_NAME, EDITOR_NAME, BLOCKED_NAME] } }),
    Product.deleteMany({
      $or: [
        { code: /^product[-_]update/i },
        { name: /^Product Update/i },
        { name: 'Điện Áp Mới' },
      ],
    }),
    ...(includeUsers
      ? [User.deleteMany({ phone: { $in: [ADMIN_PHONE, EDITOR_PHONE, BLOCKED_PHONE] } })]
      : []),
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
  return agent;
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupTestData({ includeUsers: true });
  adminAgent = await createAuthenticatedAgent({
    phone: ADMIN_PHONE,
    name: ADMIN_NAME,
    role: 'admin',
  });
  editorAgent = await createAuthenticatedAgent({
    phone: EDITOR_PHONE,
    name: EDITOR_NAME,
    role: 'staff',
    permissions: ['product.edit'],
  });
  blockedAgent = await createAuthenticatedAgent({
    phone: BLOCKED_PHONE,
    name: BLOCKED_NAME,
    role: 'staff',
    permissions: ['product.create'],
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData({ includeUsers: true });
  await mongoose.disconnect();
});

describe('PUT /products/:_id', () => {
  it('runs authentication and permission checks before payload validation', async () => {
    const product = await createProduct({ code: PRODUCT_CODE_PREFIX + 'AUTH' });

    const unauthenticated = await request(app)
      .put('/products/' + product._id)
      .send({ name: { invalid: true } });
    const forbidden = await blockedAgent
      .put('/products/' + product._id)
      .send({ name: { invalid: true } });

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.message).toBe('Access denied, no token provided');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.message).toBe('Access denied, missing permission: product.edit');
    expect((await Product.findById(product._id)).name).toBe('Product Update Base');
  });

  it('validates the body before touching Product persistence', async () => {
    const findByIdSpy = jest.spyOn(Product, 'findById');

    const response = await editorAgent
      .put('/products/not-an-object-id')
      .send({ name: { invalid: true } });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('name');
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('maps malformed ids to 400 and missing products to 404', async () => {
    const malformed = await editorAgent
      .put('/products/not-an-object-id')
      .send({ name: 'Never persisted' });
    const missingId = new mongoose.Types.ObjectId();
    const missing = await editorAgent
      .put('/products/' + missingId)
      .send({ name: 'Still missing' });

    expect(malformed.status).toBe(400);
    expect(malformed.body.message).toContain('ObjectId');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: 'Product not found' });
  });

  it('filters unknown fields and derives nameUnsigned from an updated name', async () => {
    const product = await createProduct({ code: PRODUCT_CODE_PREFIX + 'FIELDS' });

    const response = await editorAgent
      .put('/products/' + product._id)
      .send({
        name: 'Điện Áp Mới',
        purchaseCount: 999,
        reviews: [{ email: 'ignored@example.com', rating: 5 }],
        unknownField: 'ignored',
      });

    expect(response.status).toBe(200);
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.name).toBe('Điện Áp Mới');
    expect(persisted.nameUnsigned).toBe('Dien Ap Moi');
    expect(persisted.purchaseCount).toBe(7);
    expect(persisted.reviews).toEqual([]);
    expect(persisted.unknownField).toBeUndefined();
  });

  it('rejects an equivalent code owned by another product but excludes the current product', async () => {
    const first = await createProduct({
      name: 'Product Update First',
      code: PRODUCT_CODE_PREFIX + 'DUP 100',
    });
    const second = await createProduct({
      name: 'Product Update Second',
      code: PRODUCT_CODE_PREFIX + 'OTHER',
    });

    const duplicate = await editorAgent
      .put('/products/' + second._id)
      .send({ code: 'productupdatedup100' });
    const selfEquivalent = await editorAgent
      .put('/products/' + first._id)
      .send({ code: 'product_update_dup_100' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toContain('Product Update First');
    expect((await Product.findById(second._id)).code).toBe(PRODUCT_CODE_PREFIX + 'OTHER');
    expect(selfEquivalent.status).toBe(200);
    expect((await Product.findById(first._id)).code).toBe('product_update_dup_100');
  });

  it('resolves variant metadata by id first and by current index otherwise', async () => {
    const product = await createProduct({ code: PRODUCT_CODE_PREFIX + 'VARIANT-RESOLUTION' });
    const firstVariantId = product.variant[0]._id.toString();
    const secondVariantId = product.variant[1]._id.toString();

    const byId = await editorAgent
      .put('/products/' + product._id)
      .send({ variant: [{ _id: secondVariantId, color: 'Blue' }] });
    const byIndex = await editorAgent
      .put('/products/' + product._id)
      .send({ variant: [{ note: 'Index zero' }, { note: 'Index one' }] });

    expect(byId.status).toBe(200);
    expect(byIndex.status).toBe(200);
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]._id.toString()).toBe(firstVariantId);
    expect(persisted.variant[0]).toEqual(expect.objectContaining({ color: 'Gray', note: 'Index zero' }));
    expect(persisted.variant[1]._id.toString()).toBe(secondVariantId);
    expect(persisted.variant[1]).toEqual(expect.objectContaining({ color: 'Blue', note: 'Index one' }));
  });

  it('updates only variant metadata and never restores client stock values', async () => {
    const product = await createProduct({ code: PRODUCT_CODE_PREFIX + 'VARIANT-METADATA' });

    const response = await editorAgent
      .put('/products/' + product._id)
      .send({
        variant: [{
          _id: product.variant[0]._id,
          price: '125000',
          imgUrl: '/images/updated.png',
          quantityForSale: 1,
          quantityInStorage: 2,
          unsupported: 'ignored',
        }],
      });

    expect(response.status).toBe(200);
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      price: '125000',
      imgUrl: '/images/updated.png',
      quantityForSale: 10,
      quantityInStorage: 12,
    }));
    expect(persisted.variant[0].unsupported).toBeUndefined();
  });

  it('writes the exact tracked scalar and variant ActivityLog details', async () => {
    const product = await createProduct({
      name: 'Product Update Log Before',
      code: PRODUCT_CODE_PREFIX + 'LOG',
    });

    const response = await adminAgent
      .put('/products/' + product._id)
      .send({
        name: 'Product Update Log After',
        description: 'Updated description',
        variant: [{
          _id: product.variant[0]._id,
          price: '110000',
          color: 'Blue',
          imgUrl: '/images/not-tracked.png',
        }],
      });

    expect(response.status).toBe(200);
    const log = await ActivityLog.findOne({ action: 'update_product', productId: product._id }).lean();
    expect(log).toMatchObject({
      userName: ADMIN_NAME,
      action: 'update_product',
      productName: 'Product Update Log After',
    });
    expect(log.details.map(({ field, oldValue, newValue }) => ({ field, oldValue, newValue }))).toEqual([
      { field: 'name', oldValue: 'Product Update Log Before', newValue: 'Product Update Log After' },
      { field: 'description', oldValue: '', newValue: 'Updated description' },
      { field: 'variant[0].price', oldValue: '100000', newValue: '110000' },
      { field: 'variant[0].color', oldValue: 'Gray', newValue: 'Blue' },
    ]);
  });

  it('keeps the Product update when ActivityLog persistence fails', async () => {
    const product = await createProduct({ code: PRODUCT_CODE_PREFIX + 'LOG-FAILURE' });
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(new Error('forced update_product log failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await adminAgent
      .put('/products/' + product._id)
      .send({ name: 'Product Update Log Failure Persisted' });

    expect(response.status).toBe(200);
    expect((await Product.findById(product._id)).name).toBe('Product Update Log Failure Persisted');
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });

  it('keeps the first-phase update when variant metadata persistence fails', async () => {
    const product = await createProduct({ code: PRODUCT_CODE_PREFIX + 'PARTIAL-FAILURE' });
    jest.spyOn(Product, 'updateOne').mockRejectedValueOnce(new Error('forced metadata failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent
      .put('/products/' + product._id)
      .send({
        name: 'Product Update Main Phase Persisted',
        variant: [{ _id: product.variant[0]._id, color: 'Never persisted' }],
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Lỗi server' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.name).toBe('Product Update Main Phase Persisted');
    expect(persisted.variant[0].color).toBe('Gray');
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });

  it('maps second-phase Mongoose validation errors to 400 after the first phase persists', async () => {
    const product = await createProduct({ code: PRODUCT_CODE_PREFIX + 'PARTIAL-VALIDATION' });
    const validationError = Object.assign(new Error('forced metadata validation'), { name: 'ValidationError' });
    jest.spyOn(Product, 'updateOne').mockRejectedValueOnce(validationError);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent
      .put('/products/' + product._id)
      .send({
        name: 'Product Update Validation Phase Persisted',
        variant: [{ _id: product.variant[0]._id, color: 'Never persisted' }],
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'forced metadata validation' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.name).toBe('Product Update Validation Phase Persisted');
    expect(persisted.variant[0].color).toBe('Gray');
  });

  it('keeps the legacy generic 500 mapping for update E11000 errors', async () => {
    const product = await createProduct({ code: PRODUCT_CODE_PREFIX + 'E11000' });
    const duplicateError = Object.assign(new Error('forced duplicate update'), {
      code: 11000,
      keyPattern: { code: 1 },
      keyValue: { code: PRODUCT_CODE_PREFIX + 'E11000' },
    });
    jest.spyOn(Product, 'findByIdAndUpdate').mockRejectedValueOnce(duplicateError);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent
      .put('/products/' + product._id)
      .send({ name: 'Never persisted' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Lỗi server' });
    expect((await Product.findById(product._id)).name).toBe('Product Update Base');
  });

  it('accepts a no-op update without writing an ActivityLog', async () => {
    const product = await createProduct({ code: PRODUCT_CODE_PREFIX + 'NOOP' });

    const response = await editorAgent
      .put('/products/' + product._id)
      .send({ unknownField: 'ignored' });

    expect(response.status).toBe(200);
    expect(response.body._id).toBe(product._id.toString());
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });
});
