const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ActivityLog } = require('../models/activitylog');
const { Product } = require('../models/product');
const { User } = require('../models/user');

jest.setTimeout(30000);

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const ADMIN_PHONE = '0972900001';
const EDITOR_PHONE = '0972900002';
const DELETER_PHONE = '0972900003';
const BLOCKED_PHONE = '0972900004';
const ADMIN_NAME = 'Product Admin Actions Admin';
const EDITOR_NAME = 'Product Admin Actions Editor';
const DELETER_NAME = 'Product Admin Actions Deleter';
const BLOCKED_NAME = 'Product Admin Actions Blocked Staff';
const PRODUCT_CODE_PREFIX = 'PRODUCT-ADMIN-ACTIONS-';
const PRODUCT_NAME_PREFIX = 'Product Admin Actions';
const TEST_PHONES = [ADMIN_PHONE, EDITOR_PHONE, DELETER_PHONE, BLOCKED_PHONE];
const TEST_USER_NAMES = [ADMIN_NAME, EDITOR_NAME, DELETER_NAME, BLOCKED_NAME];

let adminAgent;
let editorAgent;
let deleterAgent;
let blockedAgent;
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

const buildProductPayload = (label, overrides = {}) => {
  productSequence += 1;
  return {
    type: 'PLC',
    name: PRODUCT_NAME_PREFIX + ' ' + label + ' ' + productSequence,
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    brand: 'Admin Actions Test Brand',
    section: 'Admin Actions Test Section',
    value: 'PLC',
    warranty: '12 months',
    display: true,
    purchaseCount: 0,
    variant: [{
      price: '100000',
      importPrice: '75000',
      earn: 25,
      color: 'Gray',
      quantityForSale: 10,
      quantityInStorage: 10,
    }],
    ...overrides,
  };
};

const createProduct = (label = 'Fixture', overrides = {}) => (
  Product.create(buildProductPayload(label, overrides))
);

const createLegacyProductWithoutDisplay = async (label = 'Legacy Display') => {
  const payload = buildProductPayload(label);
  delete payload.display;
  const result = await Product.collection.insertOne(payload);
  return result.insertedId;
};

const readProductSnapshot = async (productId) => {
  const product = await Product.findById(productId).lean();
  return serialize(product);
};

const readProductAndLogsSnapshot = async (productId) => {
  const [product, logs] = await Promise.all([
    Product.findById(productId).lean(),
    ActivityLog.find({ productId }).sort({ _id: 1 }).lean(),
  ]);
  return serialize({ product, logs });
};

const expectNoActionLogs = async (productId) => {
  expect(await ActivityLog.countDocuments({
    productId,
    action: { $in: ['delete_product', 'toggle_display'] },
  })).toBe(0);
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupFixtures({ includeUsers: true });

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
  deleterAgent = await createAuthenticatedAgent({
    phone: DELETER_PHONE,
    name: DELETER_NAME,
    role: 'staff',
    permissions: ['product.delete'],
  });
  blockedAgent = await createAuthenticatedAgent({
    phone: BLOCKED_PHONE,
    name: BLOCKED_NAME,
    role: 'staff',
    permissions: ['product.view'],
  });
});

beforeEach(async () => {
  await Product.collection.updateMany(
    { display: { $exists: false } },
    { $set: { display: true } }
  );
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupFixtures();
});

afterAll(async () => {
  await cleanupFixtures({ includeUsers: true });
  await mongoose.disconnect();
});

describe('PUT /products/update-display-field', () => {
  it('requires authentication and leaves legacy products unchanged', async () => {
    const productId = await createLegacyProductWithoutDisplay('Unauthenticated');

    const response = await request(app).put('/products/update-display-field');

    expect(response.status).toBe(401);
    const rawProduct = await Product.collection.findOne({ _id: productId });
    expect(rawProduct).not.toHaveProperty('display');
    await expectNoActionLogs(productId);
  });

  it('requires product.edit and leaves legacy products unchanged', async () => {
    const productId = await createLegacyProductWithoutDisplay('Forbidden');

    const response = await blockedAgent.put('/products/update-display-field');

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: product.edit');
    const rawProduct = await Product.collection.findOne({ _id: productId });
    expect(rawProduct).not.toHaveProperty('display');
    await expectNoActionLogs(productId);
  });

  it('sets only missing display fields to true and does not write ActivityLog entries', async () => {
    const legacyProductId = await createLegacyProductWithoutDisplay('Migration Target');
    const hiddenProduct = await createProduct('Existing Hidden', { display: false });
    const visibleProduct = await createProduct('Existing Visible', { display: true });

    const response = await editorAgent.put('/products/update-display-field');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'Cập nhật trường display thành công',
      updatedCount: 1,
    });
    const [legacyProduct, hiddenAfter, visibleAfter] = await Promise.all([
      Product.collection.findOne({ _id: legacyProductId }),
      Product.findById(hiddenProduct._id).lean(),
      Product.findById(visibleProduct._id).lean(),
    ]);
    expect(legacyProduct.display).toBe(true);
    expect(hiddenAfter.display).toBe(false);
    expect(visibleAfter.display).toBe(true);
    expect(await ActivityLog.countDocuments({
      productId: { $in: [legacyProductId, hiddenProduct._id, visibleProduct._id] },
    })).toBe(0);
  });

  it('returns the legacy no-op response when every product already has display', async () => {
    await createProduct('No-op Visible', { display: true });
    await createProduct('No-op Hidden', { display: false });

    const response = await adminAgent.put('/products/update-display-field');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'Không có sản phẩm nào cần cập nhật hoặc tất cả sản phẩm đã có trường display',
    });
  });
});

describe('PUT /products/purchase/:_id', () => {
  it('requires authentication and leaves purchaseCount unchanged', async () => {
    const product = await createProduct('Purchase Unauthenticated', { purchaseCount: 3 });
    const before = await readProductAndLogsSnapshot(product._id);

    const response = await request(app)
      .put('/products/purchase/' + product._id)
      .send({ action: 'increase', amount: 2 });

    expect(response.status).toBe(401);
    expect(await readProductAndLogsSnapshot(product._id)).toEqual(before);
  });

  it('requires product.edit and leaves purchaseCount unchanged', async () => {
    const product = await createProduct('Purchase Forbidden', { purchaseCount: 3 });
    const before = await readProductAndLogsSnapshot(product._id);

    const response = await blockedAgent
      .put('/products/purchase/' + product._id)
      .send({ action: 'increase', amount: 2 });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: product.edit');
    expect(await readProductAndLogsSnapshot(product._id)).toEqual(before);
  });

  it('atomically increases and decreases purchaseCount without writing an ActivityLog', async () => {
    const product = await createProduct('Purchase Success', { purchaseCount: 4 });

    const increaseResponse = await editorAgent
      .put('/products/purchase/' + product._id)
      .send({ action: 'increase', amount: '3' });
    const decreaseResponse = await editorAgent
      .put('/products/purchase/' + product._id)
      .send({ action: 'decrease', amount: 2 });

    expect(increaseResponse.status).toBe(200);
    expect(increaseResponse.body).toEqual({
      message: 'Cập nhật thành công',
      purchaseCount: 7,
    });
    expect(decreaseResponse.status).toBe(200);
    expect(decreaseResponse.body).toEqual({
      message: 'Cập nhật thành công',
      purchaseCount: 5,
    });
    expect((await Product.findById(product._id).lean()).purchaseCount).toBe(5);
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });

  it('returns 404 for a valid nonexistent product id', async () => {
    const missingId = new mongoose.Types.ObjectId();

    const response = await editorAgent
      .put('/products/purchase/' + missingId)
      .send({ action: 'increase', amount: 1 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Sản phẩm không tồn tại' });
    await expectNoActionLogs(missingId);
  });

  it('rejects an invalid product id before database access', async () => {
    const updateSpy = jest.spyOn(Product, 'findOneAndUpdate');
    const existsSpy = jest.spyOn(Product, 'exists');

    const response = await editorAgent
      .put('/products/purchase/not-an-object-id')
      .send({ action: 'increase', amount: 1 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Mã sản phẩm không hợp lệ' });
    expect(updateSpy).not.toHaveBeenCalled();
    expect(existsSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown action', { action: 'reset', amount: 1 }],
    ['a missing action', { amount: 1 }],
    ['a zero amount', { action: 'increase', amount: 0 }],
    ['a negative amount', { action: 'increase', amount: -1 }],
    ['a nonnumeric amount', { action: 'increase', amount: 'many' }],
  ])('rejects %s before changing the database', async (_caseName, payload) => {
    const product = await createProduct('Purchase Invalid', { purchaseCount: 6 });
    const before = await readProductAndLogsSnapshot(product._id);
    const updateSpy = jest.spyOn(Product, 'findOneAndUpdate');

    const response = await editorAgent
      .put('/products/purchase/' + product._id)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Dữ liệu không hợp lệ' });
    expect(updateSpy).not.toHaveBeenCalled();
    expect(await readProductAndLogsSnapshot(product._id)).toEqual(before);
  });

  it('rejects a decrease above the current count without changing the product', async () => {
    const product = await createProduct('Purchase Insufficient', { purchaseCount: 2 });
    const before = await readProductAndLogsSnapshot(product._id);

    const response = await editorAgent
      .put('/products/purchase/' + product._id)
      .send({ action: 'decrease', amount: 3 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Số lượng đã mua không đủ để giảm' });
    expect(await readProductAndLogsSnapshot(product._id)).toEqual(before);
  });

  it('keeps the decrease floor atomic under concurrent requests', async () => {
    const product = await createProduct('Purchase Atomic Floor', { purchaseCount: 3 });

    const responses = await Promise.all([
      editorAgent
        .put('/products/purchase/' + product._id)
        .send({ action: 'decrease', amount: 2 }),
      editorAgent
        .put('/products/purchase/' + product._id)
        .send({ action: 'decrease', amount: 2 }),
    ]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(1);
    expect(responses.find((response) => response.status === 400).body).toEqual({
      message: 'Số lượng đã mua không đủ để giảm',
    });
    expect((await Product.findById(product._id).lean()).purchaseCount).toBe(1);
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });
});

describe('DELETE /products/:_id', () => {
  it('requires authentication and leaves the product unchanged', async () => {
    const product = await createProduct('Delete Unauthenticated');
    const before = await readProductAndLogsSnapshot(product._id);

    const response = await request(app).delete('/products/' + product._id);

    expect(response.status).toBe(401);
    expect(await readProductAndLogsSnapshot(product._id)).toEqual(before);
  });

  it('requires product.delete and leaves the product unchanged', async () => {
    const product = await createProduct('Delete Forbidden');
    const before = await readProductAndLogsSnapshot(product._id);

    const response = await editorAgent.delete('/products/' + product._id);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: product.delete');
    expect(await readProductAndLogsSnapshot(product._id)).toEqual(before);
  });

  it('deletes the product and records the legacy activity details', async () => {
    const product = await createProduct('Delete Success');

    const response = await deleterAgent.delete('/products/' + product._id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Product deleted successfully' });
    expect(await Product.findById(product._id)).toBeNull();
    const log = await ActivityLog.findOne({
      userName: DELETER_NAME,
      action: 'delete_product',
      productId: product._id,
    }).lean();
    expect(log).toEqual(expect.objectContaining({
      productName: product.name,
      details: [expect.objectContaining({
        field: 'Xóa sản phẩm',
        oldValue: product.name,
        newValue: '',
      })],
    }));
  });

  it('returns 404 and writes no log for a valid nonexistent product id', async () => {
    const missingId = new mongoose.Types.ObjectId();

    const response = await deleterAgent.delete('/products/' + missingId);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Product not found' });
    await expectNoActionLogs(missingId);
  });

  it('keeps deletion successful when ActivityLog persistence fails', async () => {
    const product = await createProduct('Delete Log Failure');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(new Error('log unavailable'));

    const response = await adminAgent.delete('/products/' + product._id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Product deleted successfully' });
    expect(await Product.findById(product._id)).toBeNull();
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith('ActivityLog error:', 'log unavailable');
  });
});

describe('PUT /products/:_id/toggle-display', () => {
  it('requires authentication and leaves display unchanged', async () => {
    const product = await createProduct('Toggle Unauthenticated', { display: false });
    const before = await readProductAndLogsSnapshot(product._id);

    const response = await request(app).put('/products/' + product._id + '/toggle-display');

    expect(response.status).toBe(401);
    expect(await readProductAndLogsSnapshot(product._id)).toEqual(before);
  });

  it('requires product.edit and leaves display unchanged', async () => {
    const product = await createProduct('Toggle Forbidden', { display: false });
    const before = await readProductAndLogsSnapshot(product._id);

    const response = await deleterAgent.put('/products/' + product._id + '/toggle-display');

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: product.edit');
    expect(await readProductAndLogsSnapshot(product._id)).toEqual(before);
  });

  it('toggles display and records the legacy activity details', async () => {
    const product = await createProduct('Toggle Success', { display: false });

    const response = await editorAgent.put('/products/' + product._id + '/toggle-display');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Thay đổi hiển thị thành công');
    expect(response.body.product).toEqual(expect.objectContaining({
      _id: product._id.toString(),
      display: true,
    }));
    expect((await Product.findById(product._id).lean()).display).toBe(true);
    const log = await ActivityLog.findOne({
      userName: EDITOR_NAME,
      action: 'toggle_display',
      productId: product._id,
    }).lean();
    expect(log).toEqual(expect.objectContaining({
      productName: product.name,
      details: [expect.objectContaining({
        field: 'display',
        oldValue: 'Ẩn',
        newValue: 'Hiển thị',
      })],
    }));
  });

  it('returns 404 and writes no log for a valid nonexistent product id', async () => {
    const missingId = new mongoose.Types.ObjectId();

    const response = await editorAgent.put('/products/' + missingId + '/toggle-display');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Product not found' });
    await expectNoActionLogs(missingId);
  });

  it('keeps the display change successful when ActivityLog persistence fails', async () => {
    const product = await createProduct('Toggle Log Failure', { display: true });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(new Error('log unavailable'));

    const response = await adminAgent.put('/products/' + product._id + '/toggle-display');

    expect(response.status).toBe(200);
    expect(response.body.product.display).toBe(false);
    expect((await Product.findById(product._id).lean()).display).toBe(false);
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith('ActivityLog error:', 'log unavailable');
  });
});
