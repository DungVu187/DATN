const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ActivityLog } = require('../models/activitylog');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const ADMIN_PHONE = '0972900001';
const EDITOR_PHONE = '0972900002';
const BLOCKED_PHONE = '0972900003';
const ADMIN_NAME = 'Variant Operations Admin';
const EDITOR_NAME = 'Variant Operations Editor';
const BLOCKED_NAME = 'Variant Operations Blocked';
const PRODUCT_CODE_PREFIX = 'VARIANT-OPS-';

let adminAgent;
let editorAgent;
let blockedAgent;
let productSequence = 0;

const buildVariant = (overrides = {}) => ({
  price: '100000',
  importPrice: '75000',
  earn: 25,
  imgUrl: '/images/original.png',
  note: 'Original',
  color: 'Gray',
  shape: 'Square',
  buttonCount: '2',
  frame: 'Metal',
  quantityForSale: 10,
  quantityInStorage: 12,
  ...overrides,
});

const createProduct = async ({ variants, ...overrides } = {}) => {
  productSequence += 1;
  return Product.create({
    type: 'PLC',
    name: 'Variant Operations Product ' + productSequence,
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    brand: 'Siemens',
    section: 'Automation',
    value: 'PLC',
    warranty: '12 months',
    variant: variants || [buildVariant()],
    ...overrides,
  });
};

const cleanupTestData = async ({ includeUsers = false } = {}) => {
  await Promise.all([
    ActivityLog.deleteMany({ userName: { $in: [ADMIN_NAME, EDITOR_NAME, BLOCKED_NAME] } }),
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

describe('Product structural variant operations', () => {
  it('runs authentication and permission checks before all three operations', async () => {
    const product = await createProduct({
      variants: [buildVariant({ quantityForSale: 0, quantityInStorage: 0 })],
    });

    const unauthenticatedAdd = await request(app)
      .post('/products/' + product._id + '/variant')
      .send({ price: { invalid: true } });
    const forbiddenUpdate = await blockedAgent
      .put('/products/' + product._id + '/0')
      .send({ price: { invalid: true } });
    const forbiddenDelete = await blockedAgent.delete('/products/' + product._id + '/0');

    expect(unauthenticatedAdd.status).toBe(401);
    expect(unauthenticatedAdd.body.message).toBe('Access denied, no token provided');
    expect(forbiddenUpdate.status).toBe(403);
    expect(forbiddenUpdate.body.message).toBe('Access denied, missing permission: product.edit');
    expect(forbiddenDelete.status).toBe(403);
    expect(forbiddenDelete.body.message).toBe('Access denied, missing permission: product.edit');
    expect((await Product.findById(product._id)).variant).toHaveLength(1);
  });

  it('validates add and update payloads before Product database access', async () => {
    const product = await createProduct();
    const findByIdAndUpdateSpy = jest.spyOn(Product, 'findByIdAndUpdate');
    const findByIdSpy = jest.spyOn(Product, 'findById');

    const addResponse = await editorAgent
      .post('/products/' + product._id + '/variant')
      .send({ price: { invalid: true } });
    const updateResponse = await editorAgent
      .put('/products/' + product._id + '/0')
      .send({ price: { invalid: true } });

    expect(addResponse.status).toBe(400);
    expect(updateResponse.status).toBe(400);
    expect(findByIdAndUpdateSpy).not.toHaveBeenCalled();
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('maps malformed and missing product ids for add using the legacy responses', async () => {
    const malformed = await editorAgent
      .post('/products/not-an-object-id/variant')
      .send({ price: '100000' });
    const missingId = new mongoose.Types.ObjectId();
    const missing = await editorAgent
      .post('/products/' + missingId + '/variant')
      .send({ price: '100000' });

    expect(malformed.status).toBe(400);
    expect(malformed.body.message).toContain('ObjectId');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: 'Product not found' });
  });

  it('adds a variant with a generated id, exact response, and exact ActivityLog', async () => {
    const product = await createProduct();
    const clientVariantId = new mongoose.Types.ObjectId();

    const response = await adminAgent
      .post('/products/' + product._id + '/variant')
      .send({
        _id: clientVariantId,
        price: '250000',
        importPrice: '180000',
        quantityForSale: 0,
        quantityInStorage: 0,
      });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Variant added successfully');
    expect(response.body.product.variant).toHaveLength(2);
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[1]._id.toString()).not.toBe(clientVariantId.toString());
    const log = await ActivityLog.findOne({ action: 'add_variant', productId: product._id }).lean();
    expect(log).toMatchObject({
      userName: ADMIN_NAME,
      action: 'add_variant',
      productName: product.name,
    });
    expect(log.details.map(({ field, oldValue, newValue }) => ({ field, oldValue, newValue }))).toEqual([
      { field: 'variant[1]', oldValue: '', newValue: 'Giá: 250000, Giá nhập: 180000' },
    ]);
  });

  it('keeps an added variant when ActivityLog persistence fails', async () => {
    const product = await createProduct();
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(new Error('forced add_variant log failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await adminAgent
      .post('/products/' + product._id + '/variant')
      .send({ price: '200000', quantityForSale: 0, quantityInStorage: 0 });

    expect(response.status).toBe(201);
    expect((await Product.findById(product._id)).variant).toHaveLength(2);
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });

  it('maps add Mongoose validation errors to 400 and generic database errors to 500', async () => {
    const product = await createProduct();
    const invalidStock = await editorAgent
      .post('/products/' + product._id + '/variant')
      .send({ price: '200000', quantityForSale: -1, quantityInStorage: 0 });
    expect(invalidStock.status).toBe(400);
    expect((await Product.findById(product._id)).variant).toHaveLength(1);

    jest.spyOn(Product, 'findByIdAndUpdate').mockRejectedValueOnce(new Error('forced add failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const genericFailure = await editorAgent
      .post('/products/' + product._id + '/variant')
      .send({ price: '200000' });

    expect(genericFailure.status).toBe(500);
    expect(genericFailure.body).toEqual({ message: 'Server error' });
  });

  it('maps update product ids and preserves legacy parseInt variant indexes', async () => {
    const product = await createProduct();
    const malformed = await editorAgent
      .put('/products/not-an-object-id/0')
      .send({ price: '110000' });
    const missing = await editorAgent
      .put('/products/' + new mongoose.Types.ObjectId() + '/0')
      .send({ price: '110000' });
    const invalidIndex = await editorAgent
      .put('/products/' + product._id + '/not-an-index')
      .send({ price: '110000' });
    const legacyIndex = await editorAgent
      .put('/products/' + product._id + '/0suffix')
      .send({ price: '110000' });

    expect(malformed.status).toBe(400);
    expect(malformed.body.message).toContain('ObjectId');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: 'Product not found' });
    expect(invalidIndex.status).toBe(404);
    expect(invalidIndex.body).toEqual({ message: 'Variant not found' });
    expect(legacyIndex.status).toBe(200);
    expect((await Product.findById(product._id)).variant[0].price).toBe('110000');
  });

  it('updates only metadata and writes exact tracked ActivityLog details in legacy order', async () => {
    const product = await createProduct();

    const response = await adminAgent
      .put('/products/' + product._id + '/0')
      .send({
        price: '120000',
        importPrice: '',
        earn: '30',
        imgUrl: '/images/updated.png',
        note: false,
        color: 'Blue',
        shape: 'Round',
        buttonCount: '4',
        frame: 'Plastic',
        quantityForSale: 0,
        quantityInStorage: 0,
        unknownField: 'ignored',
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Variant updated successfully');
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      price: '120000',
      importPrice: '',
      earn: 30,
      imgUrl: '/images/updated.png',
      note: 'false',
      color: 'Blue',
      shape: 'Round',
      buttonCount: '4',
      frame: 'Plastic',
      quantityForSale: 10,
      quantityInStorage: 12,
    }));
    const log = await ActivityLog.findOne({ action: 'update_variant', productId: product._id }).lean();
    expect(log).toMatchObject({
      userName: ADMIN_NAME,
      action: 'update_variant',
      productName: product.name,
    });
    expect(log.details.map(({ field, oldValue, newValue }) => ({ field, oldValue, newValue }))).toEqual([
      { field: 'variant[0].price', oldValue: '100000', newValue: '120000' },
      { field: 'variant[0].importPrice', oldValue: '75000', newValue: '' },
      { field: 'variant[0].earn', oldValue: '25', newValue: '30' },
      { field: 'variant[0].note', oldValue: 'Original', newValue: 'false' },
      { field: 'variant[0].color', oldValue: 'Gray', newValue: 'Blue' },
      { field: 'variant[0].shape', oldValue: 'Square', newValue: 'Round' },
      { field: 'variant[0].buttonCount', oldValue: '2', newValue: '4' },
      { field: 'variant[0].frame', oldValue: 'Metal', newValue: 'Plastic' },
    ]);
  });

  it('accepts an update with no allowed metadata without writing or logging', async () => {
    const product = await createProduct();
    const findOneAndUpdateSpy = jest.spyOn(Product, 'findOneAndUpdate');

    const response = await editorAgent
      .put('/products/' + product._id + '/0')
      .send({ quantityForSale: 999, quantityInStorage: 999, unknownField: 'ignored' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Variant updated successfully');
    expect(findOneAndUpdateSpy).not.toHaveBeenCalled();
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0]).toEqual(expect.objectContaining({
      quantityForSale: 10,
      quantityInStorage: 12,
    }));
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });

  it('returns 409 when the update target disappears after the initial read', async () => {
    const product = await createProduct();
    jest.spyOn(Product, 'findOneAndUpdate').mockResolvedValueOnce(null);

    const response = await editorAgent
      .put('/products/' + product._id + '/0')
      .send({ price: '130000' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      message: 'Phiên bản sản phẩm đã thay đổi, vui lòng tải lại dữ liệu.',
    });
    expect((await Product.findById(product._id)).variant[0].price).toBe('100000');
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });

  it('maps update Mongoose errors while keeping ActivityLog best-effort', async () => {
    const validationProduct = await createProduct();
    const validationError = Object.assign(new Error('forced update validation'), { name: 'ValidationError' });
    jest.spyOn(Product, 'findOneAndUpdate').mockRejectedValueOnce(validationError);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const validationResponse = await editorAgent
      .put('/products/' + validationProduct._id + '/0')
      .send({ price: '130000' });
    expect(validationResponse.status).toBe(400);
    expect(validationResponse.body).toEqual({ message: 'forced update validation' });

    jest.restoreAllMocks();
    const logFailureProduct = await createProduct();
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(new Error('forced update_variant log failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const logFailureResponse = await editorAgent
      .put('/products/' + logFailureProduct._id + '/0')
      .send({ price: '140000' });

    expect(logFailureResponse.status).toBe(200);
    expect((await Product.findById(logFailureProduct._id)).variant[0].price).toBe('140000');
    expect(await ActivityLog.countDocuments({ productId: logFailureProduct._id })).toBe(0);
  });

  it('keeps legacy delete id and index error mappings', async () => {
    const product = await createProduct({
      variants: [buildVariant({ quantityForSale: 0, quantityInStorage: 0 })],
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const malformed = await editorAgent.delete('/products/not-an-object-id/0');
    const missing = await editorAgent.delete('/products/' + new mongoose.Types.ObjectId() + '/0');
    const invalidIndex = await editorAgent.delete('/products/' + product._id + '/not-an-index');

    expect(malformed.status).toBe(500);
    expect(malformed.body).toEqual({ message: 'Server error' });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: 'Product not found' });
    expect(invalidIndex.status).toBe(404);
    expect(invalidIndex.body).toEqual({ message: 'Variant not found' });
  });

  it('enforces the one-variant, last-only, and zero-stock delete guards in order', async () => {
    const singleVariant = await createProduct({
      variants: [buildVariant({ quantityForSale: 0, quantityInStorage: 0 })],
    });
    const twoZeroStock = await createProduct({
      variants: [
        buildVariant({ quantityForSale: 0, quantityInStorage: 0 }),
        buildVariant({ price: '200000', quantityForSale: 0, quantityInStorage: 0 }),
      ],
    });
    const stockedLast = await createProduct({
      variants: [
        buildVariant({ quantityForSale: 0, quantityInStorage: 0 }),
        buildVariant({ price: '200000', quantityForSale: 1, quantityInStorage: 0 }),
      ],
    });

    const singleResponse = await editorAgent.delete('/products/' + singleVariant._id + '/0');
    const shiftedResponse = await editorAgent.delete('/products/' + twoZeroStock._id + '/0');
    const stockedResponse = await editorAgent.delete('/products/' + stockedLast._id + '/1');

    expect(singleResponse.status).toBe(400);
    expect(singleResponse.body).toEqual({ message: 'Sản phẩm phải còn ít nhất một phiên bản.' });
    expect(shiftedResponse.status).toBe(400);
    expect(shiftedResponse.body).toEqual({
      message: 'Chỉ được xóa phiên bản cuối cùng để không làm lệch phiên bản trong các đơn hàng cũ.',
    });
    expect(stockedResponse.status).toBe(400);
    expect(stockedResponse.body).toEqual({
      message: 'Không thể xóa phiên bản vẫn còn tồn kho hoặc tồn khả dụng.',
    });
  });

  it('returns 409 when the atomic zero-stock delete predicate no longer matches', async () => {
    const product = await createProduct({
      variants: [
        buildVariant({ quantityForSale: 0, quantityInStorage: 0 }),
        buildVariant({ price: '200000', quantityForSale: 0, quantityInStorage: 0 }),
      ],
    });
    jest.spyOn(Product, 'findOneAndUpdate').mockResolvedValueOnce(null);

    const response = await editorAgent.delete('/products/' + product._id + '/1');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      message: 'Phiên bản vừa được thay đổi bởi thao tác khác, vui lòng tải lại dữ liệu.',
    });
    expect((await Product.findById(product._id)).variant).toHaveLength(2);
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });

  it('deletes the zero-stock last variant atomically and writes the exact ActivityLog', async () => {
    const product = await createProduct({
      variants: [
        buildVariant({ quantityForSale: 0, quantityInStorage: 0 }),
        buildVariant({
          price: '220000',
          importPrice: '160000',
          quantityForSale: 0,
          quantityInStorage: 0,
        }),
      ],
    });
    const findOneAndUpdateSpy = jest.spyOn(Product, 'findOneAndUpdate');

    const response = await adminAgent.delete('/products/' + product._id + '/1');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Variant deleted successfully');
    expect(response.body.product.variant).toHaveLength(1);
    const [filter, update, options] = findOneAndUpdateSpy.mock.calls[0];
    expect(filter).toEqual({
      _id: product._id.toString(),
      variant: {
        $elemMatch: {
          _id: product.variant[1]._id,
          quantityForSale: 0,
          quantityInStorage: 0,
        },
      },
    });
    expect(update).toEqual({ $pull: { variant: { _id: product.variant[1]._id } } });
    expect(options).toEqual({ new: true, runValidators: true });
    const log = await ActivityLog.findOne({ action: 'delete_variant', productId: product._id }).lean();
    expect(log).toMatchObject({
      userName: ADMIN_NAME,
      action: 'delete_variant',
      productName: product.name,
    });
    expect(log.details.map(({ field, oldValue, newValue }) => ({ field, oldValue, newValue }))).toEqual([
      { field: 'variant[1]', oldValue: 'Giá: 220000, Giá nhập: 160000', newValue: '' },
    ]);
  });

  it('keeps a successful delete when ActivityLog persistence fails', async () => {
    const product = await createProduct({
      variants: [
        buildVariant({ quantityForSale: 0, quantityInStorage: 0 }),
        buildVariant({ price: '200000', quantityForSale: 0, quantityInStorage: 0 }),
      ],
    });
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(new Error('forced delete_variant log failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await adminAgent.delete('/products/' + product._id + '/1');

    expect(response.status).toBe(200);
    expect((await Product.findById(product._id)).variant).toHaveLength(1);
    expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
  });
});
