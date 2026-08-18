const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ActivityLog } = require('../models/activitylog');
const { Product } = require('../models/product');
const { Type } = require('../models/producttype');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const TYPE_PREFIX = 'CHT-';
const EXTERNAL_TYPE_NAME = 'Legacy external chip type';
const PRODUCT_CODE_PREFIX = 'CHT-PRODUCT-';
const CREATOR_PHONE = '0988700101';
const DELETE_ONLY_PHONE = '0988700102';
const BLOCKED_PHONE = '0988700103';
const CREATOR_NAME = 'Chip Type Creator';
const DELETE_ONLY_NAME = 'Chip Type Delete Only';
const BLOCKED_NAME = 'Chip Type Blocked';
const TEST_PHONES = [CREATOR_PHONE, DELETE_ONLY_PHONE, BLOCKED_PHONE];
const TEST_USER_NAMES = [CREATOR_NAME, DELETE_ONLY_NAME, BLOCKED_NAME];

let creatorAgent;
let deleteOnlyAgent;
let blockedAgent;
let productSequence = 0;

const serialize = (value) => JSON.parse(JSON.stringify(value));

const ownedTypeFilter = {
  $or: [
    { Type: { $regex: '^' + TYPE_PREFIX } },
    { Type: EXTERNAL_TYPE_NAME },
  ],
};
const ownedLogFilter = {
  $or: [
    { userName: { $in: TEST_USER_NAMES } },
    { productName: { $regex: '^' + TYPE_PREFIX } },
  ],
};

const cleanupFixtures = async ({ includeUsers = false } = {}) => {
  await Promise.all([
    ActivityLog.deleteMany(ownedLogFilter),
    Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } }),
    Type.deleteMany(ownedTypeFilter),
    ...(includeUsers ? [User.deleteMany({ phone: { $in: TEST_PHONES } })] : []),
  ]);
};

const createAuthenticatedAgent = async ({ phone, name, permissions }) => {
  await User.create({
    phone,
    password: 'password123',
    name,
    role: 'staff',
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

const createProduct = (typeName, label) => {
  productSequence += 1;
  return Product.create({
    type: typeName,
    name: 'Chip Type ' + label + ' ' + productSequence,
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    brand: 'Chip Type Brand',
    section: 'Chip Type Section',
    value: typeName,
    warranty: '12 months',
    display: true,
    variant: [{
      price: '100000',
      quantityForSale: 5,
      quantityInStorage: 5,
    }],
  });
};

const readFixtureState = async () => {
  const [types, products, logs, users] = await Promise.all([
    Type.find(ownedTypeFilter).sort({ _id: 1 }).lean(),
    Product.find({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } }).sort({ _id: 1 }).lean(),
    ActivityLog.find(ownedLogFilter).sort({ _id: 1 }).lean(),
    User.find({ phone: { $in: TEST_PHONES } }).sort({ phone: 1 }).lean(),
  ]);

  return serialize({ types, products, logs, users });
};

const expectRejectedWithoutMutation = async (requestFactory, expectedStatus) => {
  const before = await readFixtureState();
  const response = await requestFactory();

  expect(response.status).toBe(expectedStatus);
  expect(await readFixtureState()).toEqual(before);
  return response;
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupFixtures({ includeUsers: true });

  creatorAgent = await createAuthenticatedAgent({
    phone: CREATOR_PHONE,
    name: CREATOR_NAME,
    permissions: ['product.create'],
  });
  deleteOnlyAgent = await createAuthenticatedAgent({
    phone: DELETE_ONLY_PHONE,
    name: DELETE_ONLY_NAME,
    permissions: ['product.delete'],
  });
  blockedAgent = await createAuthenticatedAgent({
    phone: BLOCKED_PHONE,
    name: BLOCKED_NAME,
    permissions: ['product.view'],
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupFixtures();
});

afterAll(async () => {
  await cleanupFixtures({ includeUsers: true });
  await mongoose.disconnect();
});

describe('GET /chips/types', () => {
  it('is public and returns legacy documents without Product Type serialization', async () => {
    await Type.collection.insertMany([
      { Type: TYPE_PREFIX + 'With Icon', icon: ' fa-cube ' },
      { Type: TYPE_PREFIX + 'Without Icon' },
      { Type: EXTERNAL_TYPE_NAME },
    ]);

    const response = await request(app).get('/chips/types');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ Type: TYPE_PREFIX + 'With Icon', icon: ' fa-cube ' }),
      expect.objectContaining({ Type: TYPE_PREFIX + 'Without Icon' }),
      expect.objectContaining({ Type: EXTERNAL_TYPE_NAME }),
    ]));
    expect(response.body.find((item) => item.Type === TYPE_PREFIX + 'Without Icon')).not.toHaveProperty('icon');
  });

  it('returns 500 on a Type query failure without mutating fixtures', async () => {
    const before = await readFixtureState();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Type, 'find').mockImplementationOnce(() => {
      throw new Error('forced legacy Type.find failure');
    });

    const response = await request(app).get('/chips/types');

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Lỗi server khi lấy danh sách loại sản phẩm');
    expect(await readFixtureState()).toEqual(before);
  });
});

describe('POST /chips/types', () => {
  it('requires authentication and product.create permission', async () => {
    const unauthenticated = await expectRejectedWithoutMutation(
      () => request(app).post('/chips/types').send({ Type: TYPE_PREFIX + 'Unauthenticated' }),
      401,
    );
    const blocked = await expectRejectedWithoutMutation(
      () => blockedAgent.post('/chips/types').send({ Type: TYPE_PREFIX + 'Blocked' }),
      403,
    );

    expect(unauthenticated.body.message).toBe('Access denied, no token provided');
    expect(blocked.body.message).toBe('Access denied, missing permission: product.create');
  });

  it('trims Type, ignores the legacy icon payload and writes a best-effort create log', async () => {
    const response = await creatorAgent
      .post('/chips/types')
      .send({ Type: '  ' + TYPE_PREFIX + 'Created  ', icon: '<script>alert(1)</script>' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ Type: TYPE_PREFIX + 'Created' });
    expect(response.body).not.toHaveProperty('icon');
    const saved = await Type.findOne({ Type: TYPE_PREFIX + 'Created' }).lean();
    expect(saved).toMatchObject({ Type: TYPE_PREFIX + 'Created' });
    expect(saved).not.toHaveProperty('icon');
    const log = await ActivityLog.findOne({ action: 'create_type', productName: TYPE_PREFIX + 'Created' }).lean();
    expect(log).toMatchObject({
      userName: CREATOR_NAME,
      action: 'create_type',
      productName: TYPE_PREFIX + 'Created',
    });
    expect(log.details).toHaveLength(1);
    expect(log.details[0]).toMatchObject({ field: 'Type', oldValue: '', newValue: TYPE_PREFIX + 'Created' });
  });

  it('allows duplicate Type names because the legacy route has no duplicate guard', async () => {
    const first = await creatorAgent
      .post('/chips/types')
      .send({ Type: TYPE_PREFIX + 'Duplicate' });
    const second = await creatorAgent
      .post('/chips/types')
      .send({ Type: TYPE_PREFIX + 'Duplicate' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await Type.countDocuments({ Type: TYPE_PREFIX + 'Duplicate' })).toBe(2);
    expect(await ActivityLog.countDocuments({ action: 'create_type', productName: TYPE_PREFIX + 'Duplicate' })).toBe(2);
  });

  it('maps schema validation failures to 400 without writing a type or log', async () => {
    const missing = await creatorAgent.post('/chips/types').send({});
    const tooLong = await creatorAgent.post('/chips/types').send({ Type: 'x'.repeat(121) });

    expect(missing.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(await Type.countDocuments(ownedTypeFilter)).toBe(0);
    expect(await ActivityLog.countDocuments({ action: 'create_type' })).toBe(0);
  });

  it('maps a Type save failure to 400 without writing a type or log', async () => {
    jest.spyOn(Type.prototype, 'save').mockRejectedValueOnce(new Error('forced legacy Type save failure'));

    const response = await creatorAgent
      .post('/chips/types')
      .send({ Type: TYPE_PREFIX + 'Database Failure' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'forced legacy Type save failure' });
    expect(await Type.countDocuments(ownedTypeFilter)).toBe(0);
    expect(await ActivityLog.countDocuments({ action: 'create_type' })).toBe(0);
  });

  it('keeps the type when ActivityLog creation fails', async () => {
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(new Error('forced legacy create log failure'));

    const response = await creatorAgent
      .post('/chips/types')
      .send({ Type: TYPE_PREFIX + 'Log Failure' });

    expect(response.status).toBe(201);
    expect(await Type.exists({ Type: TYPE_PREFIX + 'Log Failure' })).not.toBeNull();
    expect(await ActivityLog.countDocuments({ action: 'create_type' })).toBe(0);
  });
});

describe('DELETE /chips/types/:id', () => {
  it('requires product.create rather than product.delete', async () => {
    const type = await Type.create({ Type: TYPE_PREFIX + 'Permission' });

    const unauthenticated = await expectRejectedWithoutMutation(
      () => request(app).delete('/chips/types/' + type._id),
      401,
    );
    const deleteOnly = await expectRejectedWithoutMutation(
      () => deleteOnlyAgent.delete('/chips/types/' + type._id),
      403,
    );
    const blocked = await expectRejectedWithoutMutation(
      () => blockedAgent.delete('/chips/types/' + type._id),
      403,
    );

    expect(unauthenticated.body.message).toBe('Access denied, no token provided');
    expect(deleteOnly.body.message).toBe('Access denied, missing permission: product.create');
    expect(blocked.body.message).toBe('Access denied, missing permission: product.create');
  });

  it('deletes a type even when a Product still references it and writes a best-effort log', async () => {
    const type = await Type.create({ Type: TYPE_PREFIX + 'In Use' });
    const product = await createProduct(type.Type, 'orphan');

    const response = await creatorAgent.delete('/chips/types/' + type._id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Type deleted' });
    expect(await Type.findById(type._id)).toBeNull();
    const retainedProduct = await Product.findById(product._id).lean();
    expect(retainedProduct).not.toBeNull();
    expect(retainedProduct.type).toBe(type.Type);
    const log = await ActivityLog.findOne({ action: 'delete_type', productName: type.Type }).lean();
    expect(log).toMatchObject({
      userName: CREATOR_NAME,
      action: 'delete_type',
      productName: type.Type,
    });
    expect(log.details).toHaveLength(1);
    expect(log.details[0]).toMatchObject({ field: 'Type', oldValue: type.Type, newValue: '' });
  });

  it('returns 404 for a missing type and 500 for a malformed id', async () => {
    const missing = await creatorAgent.delete('/chips/types/' + new mongoose.Types.ObjectId());
    const malformed = await creatorAgent.delete('/chips/types/not-an-object-id');

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: 'Type not found' });
    expect(malformed.status).toBe(500);
    expect(malformed.body.message).toBe('Lỗi server khi xóa loại sản phẩm');
  });

  it('keeps the deletion when ActivityLog creation fails', async () => {
    const type = await Type.create({ Type: TYPE_PREFIX + 'Delete Log Failure' });
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(new Error('forced legacy delete log failure'));

    const response = await creatorAgent.delete('/chips/types/' + type._id);

    expect(response.status).toBe(200);
    expect(await Type.findById(type._id)).toBeNull();
    expect(await ActivityLog.countDocuments({ action: 'delete_type' })).toBe(0);
  });

  it('maps a database delete failure to 500 without mutation', async () => {
    const type = await Type.create({ Type: TYPE_PREFIX + 'Database Failure' });
    jest.spyOn(Type, 'findByIdAndDelete').mockRejectedValueOnce(new Error('forced legacy delete failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await creatorAgent.delete('/chips/types/' + type._id);

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Lỗi server khi xóa loại sản phẩm');
    expect(await Type.findById(type._id)).not.toBeNull();
  });
});
