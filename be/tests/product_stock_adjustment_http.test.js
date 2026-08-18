const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ActivityLog } = require('../models/activitylog');
const { Product } = require('../models/product');
const { StorageHistory } = require('../models/storagehistory');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const ADMIN_PHONE = '0973000001';
const EDITOR_PHONE = '0973000002';
const BLOCKED_PHONE = '0973000003';
const ADMIN_NAME = 'Stock Adjustment Admin';
const EDITOR_NAME = 'Stock Adjustment Editor';
const BLOCKED_NAME = 'Stock Adjustment Blocked';
const PRODUCT_CODE_PREFIX = 'STOCK-ADJUSTMENT-';

let adminAgent;
let editorAgent;
let blockedAgent;
let productSequence = 0;

const createProduct = async ({
  quantityForSale = 10,
  quantityInStorage = 12,
  variants,
} = {}) => {
  productSequence += 1;
  return Product.create({
    type: 'PLC',
    name: 'Stock Adjustment Product ' + productSequence,
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    brand: 'Siemens',
    section: 'Automation',
    value: 'PLC',
    warranty: '12 months',
    variant: variants || [{
      price: '100000',
      quantityForSale,
      quantityInStorage,
    }],
  });
};

const cleanupTestData = async ({ includeUsers = false } = {}) => {
  await Promise.all([
    ActivityLog.deleteMany({ userName: { $in: [ADMIN_NAME, EDITOR_NAME, BLOCKED_NAME] } }),
    StorageHistory.deleteMany({ userName: { $in: [ADMIN_NAME, EDITOR_NAME, BLOCKED_NAME] } }),
    Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } }),
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

const adjustStock = (agent, productId, variantIndex, body) => (
  agent.post('/products/' + productId + '/' + variantIndex).send(body)
);

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

describe('POST /products/:id/:variantIndex manual stock adjustment', () => {
  it('runs authentication and permission checks before payload validation', async () => {
    const product = await createProduct();

    const unauthenticated = await request(app)
      .post('/products/' + product._id + '/0')
      .send({ quantity: 'invalid' });
    const forbidden = await blockedAgent
      .post('/products/' + product._id + '/0')
      .send({ quantity: 'invalid' });

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.message).toBe('Access denied, no token provided');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.message).toBe('Access denied, missing permission: product.edit');
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 10,
      quantityInStorage: 12,
    }));
  });

  it('validates the payload before Product database access', async () => {
    const findByIdSpy = jest.spyOn(Product, 'findById');

    const response = await adjustStock(
      editorAgent,
      new mongoose.Types.ObjectId(),
      0,
      { quantity: 'invalid' },
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Quantity must be a number' });
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('keeps legacy product id and variant index mappings', async () => {
    const product = await createProduct();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const malformed = await adjustStock(editorAgent, 'not-an-object-id', 0, { quantity: 1 });
    const missing = await adjustStock(editorAgent, new mongoose.Types.ObjectId(), 'not-an-index', { quantity: 1 });
    const invalidIndex = await adjustStock(editorAgent, product._id, 'not-an-index', { quantity: 1 });

    expect(malformed.status).toBe(500);
    expect(malformed.body).toEqual({ message: 'Server error' });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: 'Product not found' });
    expect(invalidIndex.status).toBe(400);
    expect(invalidIndex.body).toEqual({ message: 'Invalid variant index' });
    const beforeLegacy = await Product.findById(product._id).lean();
    expect(beforeLegacy.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 10,
      quantityInStorage: 12,
    }));
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);

    const legacyIndex = await adjustStock(editorAgent, product._id, '0suffix', { quantity: 1 });
    expect(legacyIndex.status).toBe(200);
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 11,
      quantityInStorage: 13,
    }));
  });

  it('returns the exact success envelope and persists exact manual history fields', async () => {
    const product = await createProduct();

    const response = await adjustStock(adminAgent, product._id, 0, {
      quantity: '3',
      orderId: 12345,
      orderName: false,
      isAIScan: 1,
    });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['history', 'message', 'product']);
    expect(response.body.message).toBe('Quantity updated & history saved');
    expect(response.body.product.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 13,
      quantityInStorage: 15,
    }));
    expect(response.body.history).toEqual(expect.objectContaining({
      productId: product._id.toString(),
      productName: product.name,
      quantity: 3,
      userName: ADMIN_NAME,
      orderId: '12345',
      orderName: 'false',
      isAIScan: true,
      source: 'product_manual',
    }));
    const persistedHistory = await StorageHistory.findById(response.body.history._id).lean();
    expect(persistedHistory).toEqual(expect.objectContaining({
      productId: product._id,
      productName: product.name,
      quantity: 3,
      userName: ADMIN_NAME,
      orderId: '12345',
      orderName: 'false',
      isAIScan: true,
      source: 'product_manual',
    }));
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });

  it('updates only the requested non-zero variant index', async () => {
    const product = await createProduct({
      variants: [
        { price: '100000', quantityForSale: 7, quantityInStorage: 9 },
        { price: '200000', quantityForSale: 20, quantityInStorage: 25 },
      ],
    });

    const response = await adjustStock(editorAgent, product._id, 1, { quantity: -4 });

    expect(response.status).toBe(200);
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 7,
      quantityInStorage: 9,
    }));
    expect(persisted.variant[1]).toEqual(expect.objectContaining({
      quantityForSale: 16,
      quantityInStorage: 21,
    }));
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(1);
  });

  it('returns the InventoryError message and writes no history when stock is insufficient', async () => {
    const product = await createProduct({ quantityForSale: 2, quantityInStorage: 2 });

    const response = await adjustStock(editorAgent, product._id, 0, { quantity: -3 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Không đủ hàng để bán cho sản phẩm ' + product.name + '. Tồn khả dụng hiện có: 2.',
    });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 2,
      quantityInStorage: 2,
    }));
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it('rejects insufficient physical storage even when sale stock is sufficient', async () => {
    const product = await createProduct({ quantityForSale: 10, quantityInStorage: 1 });

    const response = await adjustStock(editorAgent, product._id, 0, { quantity: -2 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Không đủ tồn kho vật lý cho sản phẩm ' + product.name + '. Tồn hiện có: 1.',
    });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 10,
      quantityInStorage: 1,
    }));
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it('writes no history when the atomic stock update fails', async () => {
    const product = await createProduct();
    jest.spyOn(Product, 'findOneAndUpdate').mockRejectedValueOnce(new Error('forced stock write failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await adjustStock(editorAgent, product._id, 0, { quantity: 2 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Server error' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 10,
      quantityInStorage: 12,
    }));
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it('rolls stock back when StorageHistory persistence fails', async () => {
    const product = await createProduct();
    jest.spyOn(StorageHistory.prototype, 'save').mockRejectedValueOnce(new Error('forced history failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await adjustStock(editorAgent, product._id, 0, { quantity: 4 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Server error' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 10,
      quantityInStorage: 12,
    }));
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it('returns InventoryRollbackError and keeps the partial stock write when rollback also fails', async () => {
    const product = await createProduct();
    const originalFindOneAndUpdate = Product.findOneAndUpdate.bind(Product);
    jest.spyOn(Product, 'findOneAndUpdate')
      .mockImplementationOnce((...args) => originalFindOneAndUpdate(...args))
      .mockRejectedValueOnce(new Error('forced rollback failure'));
    jest.spyOn(StorageHistory.prototype, 'save').mockRejectedValueOnce(new Error('forced history failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await adjustStock(editorAgent, product._id, 0, { quantity: 4 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Không thể hoàn tác đầy đủ thay đổi tồn kho.' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 14,
      quantityInStorage: 16,
    }));
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it('keeps stock and history when the final Product refetch fails', async () => {
    const product = await createProduct();
    const originalFindById = Product.findById.bind(Product);
    jest.spyOn(Product, 'findById')
      .mockImplementationOnce((...args) => originalFindById(...args))
      .mockRejectedValueOnce(new Error('forced refetch failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await adjustStock(editorAgent, product._id, 0, { quantity: 2 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Server error' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 12,
      quantityInStorage: 14,
    }));
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(1);
  });

  it('allows only one concurrent subtraction of the final unit and writes one history', async () => {
    const product = await createProduct({ quantityForSale: 1, quantityInStorage: 1 });
    const orderIds = ['CONCURRENT-A', 'CONCURRENT-B'];

    const responses = await Promise.all([
      adjustStock(editorAgent, product._id, 0, { quantity: -1, orderId: orderIds[0] }),
      adjustStock(editorAgent, product._id, 0, { quantity: -1, orderId: orderIds[1] }),
    ]);

    const successfulIndex = responses.findIndex((response) => response.status === 200);
    const failedIndex = responses.findIndex((response) => response.status === 400);
    expect(successfulIndex).toBeGreaterThanOrEqual(0);
    expect(failedIndex).toBeGreaterThanOrEqual(0);
    expect(successfulIndex).not.toBe(failedIndex);
    expect(responses[failedIndex].body).toEqual({
      message: 'Không đủ hàng để bán cho sản phẩm ' + product.name + '. Tồn khả dụng hiện có: 0.',
    });
    expect(responses[successfulIndex].body.history.orderId).toBe(orderIds[successfulIndex]);
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 0,
      quantityInStorage: 0,
    }));
    const histories = await StorageHistory.find({ productId: product._id }).lean();
    expect(histories).toHaveLength(1);
    expect(histories[0].orderId).toBe(orderIds[successfulIndex]);
  });
});
