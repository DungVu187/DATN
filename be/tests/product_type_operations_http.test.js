const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ActivityLog } = require('../models/activitylog');
const { Product } = require('../models/product');
const { Type } = require('../models/producttype');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const TYPE_PREFIX = 'PTO-';
const PRODUCT_CODE_PREFIX = 'PTO-PRODUCT-';
const CREATOR_PHONE = '0988700011';
const DELETER_PHONE = '0988700012';
const BLOCKED_PHONE = '0988700013';
const CREATOR_NAME = 'Product Type Operations Creator';
const DELETER_NAME = 'Product Type Operations Deleter';
const BLOCKED_NAME = 'Product Type Operations Blocked';
const TEST_PHONES = [CREATOR_PHONE, DELETER_PHONE, BLOCKED_PHONE];
const TEST_USER_NAMES = [CREATOR_NAME, DELETER_NAME, BLOCKED_NAME];

let creatorAgent;
let deleterAgent;
let blockedAgent;
let productSequence = 0;

const serialize = (value) => JSON.parse(JSON.stringify(value));

const ownedTypeFilter = {
  $or: [
    { Type: { $regex: '^' + TYPE_PREFIX } },
    { Type: { $in: ['PLC', '42'] } },
  ],
};

const ownedLogFilter = {
  $or: [
    { userName: { $in: TEST_USER_NAMES } },
    { productName: { $regex: '^' + TYPE_PREFIX } },
    { productName: { $in: ['PLC', '42'] } },
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

const createType = (label, overrides = {}) => Type.create({
  Type: TYPE_PREFIX + label,
  icon: 'ri-tb-box-multiple',
  ...overrides,
});

const createProduct = (typeName, label) => {
  productSequence += 1;
  return Product.create({
    type: typeName,
    name: 'Product Type Operations ' + label + ' ' + productSequence,
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    brand: 'Product Type Operations Brand',
    section: 'Product Type Operations Section',
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
  deleterAgent = await createAuthenticatedAgent({
    phone: DELETER_PHONE,
    name: DELETER_NAME,
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

describe('GET /products/types', () => {
  it('is public and takes precedence over the generic /:_id route', async () => {
    const response = await request(app).get('/products/types');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('sorts types by Type and serializes explicit icons', async () => {
    await Type.collection.insertMany([
      { Type: TYPE_PREFIX + 'Zulu', icon: 'fa-cube' },
      { Type: TYPE_PREFIX + 'Alpha', icon: ' ri-tb-cpu ' },
      { Type: TYPE_PREFIX + 'Middle', icon: 'ri-tb-settings' },
    ]);

    const response = await request(app).get('/products/types');

    expect(response.status).toBe(200);
    expect(response.body.map((item) => item.Type)).toEqual([
      TYPE_PREFIX + 'Alpha',
      TYPE_PREFIX + 'Middle',
      TYPE_PREFIX + 'Zulu',
    ]);
    expect(response.body.map((item) => item.icon)).toEqual([
      'ri-tb-cpu',
      'ri-tb-settings',
      'fa-cube',
    ]);
  });

  it('infers mapped and fallback icons for legacy documents', async () => {
    await Type.collection.insertMany([
      { Type: 'PLC' },
      { Type: TYPE_PREFIX + 'Legacy Unknown' },
    ]);

    const response = await request(app).get('/products/types');

    expect(response.status).toBe(200);
    expect(response.body.find((item) => item.Type === 'PLC')).toMatchObject({
      Type: 'PLC',
      icon: 'ri-tb-cpu',
    });
    expect(response.body.find((item) => item.Type === TYPE_PREFIX + 'Legacy Unknown')).toMatchObject({
      Type: TYPE_PREFIX + 'Legacy Unknown',
      icon: 'ri-tb-box-multiple',
    });
  });

  it('returns 500 on a Type query failure without mutating fixtures', async () => {
    await createType('GET Database Failure');
    const before = await readFixtureState();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const findSpy = jest.spyOn(Type, 'find').mockImplementationOnce(() => {
      throw new Error('forced Type.find failure');
    });

    const response = await request(app).get('/products/types');

    expect(response.status).toBe(500);
    expect(response.body.message).toEqual(expect.any(String));
    findSpy.mockRestore();
    expect(await readFixtureState()).toEqual(before);
  });
});

describe('POST /products/types', () => {
  it('requires authentication and leaves the database unchanged', async () => {
    const response = await expectRejectedWithoutMutation(
      () => request(app).post('/products/types').send({
        Type: TYPE_PREFIX + 'Unauthenticated',
        icon: 'ri-tb-cpu',
      }),
      401,
    );

    expect(response.body.message).toEqual(expect.any(String));
  });

  it('requires product.create and leaves the database unchanged', async () => {
    const response = await expectRejectedWithoutMutation(
      () => blockedAgent.post('/products/types').send({
        Type: TYPE_PREFIX + 'Forbidden',
        icon: 'ri-tb-cpu',
      }),
      403,
    );

    expect(response.body.message).toBe('Access denied, missing permission: product.create');
  });

  it('collapses type whitespace and trims an explicit icon', async () => {
    const response = await creatorAgent.post('/products/types').send({
      Type: '  ' + TYPE_PREFIX + 'Spaced   Type  ',
      icon: '  fa-cube  ',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      Type: TYPE_PREFIX + 'Spaced Type',
      icon: 'fa-cube',
    });
    expect(await Type.findById(response.body._id).lean()).toMatchObject({
      Type: TYPE_PREFIX + 'Spaced Type',
      icon: 'fa-cube',
    });
  });

  it('coerces a numeric Type and infers an empty icon', async () => {
    const response = await creatorAgent.post('/products/types').send({
      Type: 42,
      icon: '   ',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      Type: '42',
      icon: 'ri-tb-box-multiple',
    });
    expect(await Type.findById(response.body._id).lean()).toMatchObject({
      Type: '42',
      icon: 'ri-tb-box-multiple',
    });
  });

  it('rejects an empty type name without changing the database', async () => {
    const response = await expectRejectedWithoutMutation(
      () => creatorAgent.post('/products/types').send({
        Type: '   ',
        icon: 'ri-tb-cpu',
      }),
      400,
    );

    expect(response.body.message).toEqual(expect.any(String));
  });

  it('rejects an invalid icon without changing the database', async () => {
    const response = await expectRejectedWithoutMutation(
      () => creatorAgent.post('/products/types').send({
        Type: TYPE_PREFIX + 'Invalid Icon',
        icon: '<script>alert(1)</script>',
      }),
      400,
    );

    expect(response.body.message).toEqual(expect.any(String));
  });

  it('rejects normalized duplicates and returns the existing typeId', async () => {
    const existingType = await createType('Device Category');

    const response = await expectRejectedWithoutMutation(
      () => creatorAgent.post('/products/types').send({
        Type: '  pto-device---category  ',
        icon: 'ri-tb-cpu',
      }),
      409,
    );

    expect(response.body.typeId).toBe(existingType._id.toString());
  });

  it('creates a type and records its ActivityLog details', async () => {
    const typeName = TYPE_PREFIX + 'Logged Create';

    const response = await creatorAgent.post('/products/types').send({
      Type: typeName,
      icon: 'ri-tb-cpu',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ Type: typeName, icon: 'ri-tb-cpu' });
    expect(await Type.findById(response.body._id)).not.toBeNull();
    const log = await ActivityLog.findOne({
      userName: CREATOR_NAME,
      action: 'create_type',
      productName: typeName,
    }).lean();
    expect(log).toMatchObject({
      userName: CREATOR_NAME,
      action: 'create_type',
      productName: typeName,
    });
    expect(log.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'Type', oldValue: '', newValue: typeName }),
      expect.objectContaining({ field: 'icon', oldValue: '', newValue: 'ri-tb-cpu' }),
    ]));
  });

  it('still creates the type when ActivityLog persistence fails', async () => {
    const typeName = TYPE_PREFIX + 'Create Log Failure';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(
      new Error('forced create_type log failure'),
    );

    const response = await creatorAgent.post('/products/types').send({
      Type: typeName,
      icon: 'ri-tb-cpu',
    });

    expect(response.status).toBe(201);
    expect(await Type.findOne({ Type: typeName })).not.toBeNull();
    expect(await ActivityLog.countDocuments({
      action: 'create_type',
      productName: typeName,
    })).toBe(0);
  });

  it('maps Mongoose validation errors to 400 without persisting a type', async () => {
    const tooLongTypeName = TYPE_PREFIX + 'X'.repeat(121);

    const response = await expectRejectedWithoutMutation(
      () => creatorAgent.post('/products/types').send({
        Type: tooLongTypeName,
        icon: 'ri-tb-cpu',
      }),
      400,
    );

    expect(response.body.message).toEqual(expect.any(String));
  });

  it('returns 500 on duplicate lookup failure without changing the database', async () => {
    await createType('POST Database Failure Baseline');
    const before = await readFixtureState();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const findSpy = jest.spyOn(Type, 'find').mockImplementationOnce(() => {
      throw new Error('forced duplicate lookup failure');
    });

    const response = await creatorAgent.post('/products/types').send({
      Type: TYPE_PREFIX + 'POST Database Failure Request',
      icon: 'ri-tb-cpu',
    });

    expect(response.status).toBe(500);
    expect(response.body.message).toEqual(expect.any(String));
    findSpy.mockRestore();
    expect(await readFixtureState()).toEqual(before);
  });
});

describe('DELETE /products/types/:id', () => {
  it('requires authentication and leaves the database unchanged', async () => {
    const type = await createType('Delete Unauthenticated');

    await expectRejectedWithoutMutation(
      () => request(app).delete('/products/types/' + type._id),
      401,
    );
  });

  it('requires product.delete and leaves the database unchanged', async () => {
    const type = await createType('Delete Forbidden');

    const response = await expectRejectedWithoutMutation(
      () => blockedAgent.delete('/products/types/' + type._id),
      403,
    );

    expect(response.body.message).toBe('Access denied, missing permission: product.delete');
  });

  it('reports the in-use product count and preserves all records', async () => {
    const type = await createType('Delete In Use');
    await createProduct(type.Type, 'In Use One');
    await createProduct(type.Type, 'In Use Two');

    const response = await expectRejectedWithoutMutation(
      () => deleterAgent.delete('/products/types/' + type._id),
      409,
    );

    expect(response.body.message).toContain('2');
    expect(await ActivityLog.countDocuments({
      action: 'delete_type',
      productName: type.Type,
    })).toBe(0);
  });

  it('returns 404 for a missing valid id without changing the database', async () => {
    const missingId = new mongoose.Types.ObjectId();

    const response = await expectRejectedWithoutMutation(
      () => deleterAgent.delete('/products/types/' + missingId),
      404,
    );

    expect(response.body.message).toEqual(expect.any(String));
  });

  it('returns 400 for an invalid id without changing the database', async () => {
    await createType('Delete Invalid Id Baseline');

    const response = await expectRejectedWithoutMutation(
      () => deleterAgent.delete('/products/types/not-an-object-id'),
      400,
    );

    expect(response.body.message).toEqual(expect.any(String));
  });

  it('deletes an unused type and records its ActivityLog details', async () => {
    const type = await createType('Logged Delete');

    const response = await deleterAgent.delete('/products/types/' + type._id);

    expect(response.status).toBe(200);
    expect(response.body.message).toEqual(expect.any(String));
    expect(await Type.findById(type._id)).toBeNull();
    const log = await ActivityLog.findOne({
      userName: DELETER_NAME,
      action: 'delete_type',
      productName: type.Type,
    }).lean();
    expect(log).toMatchObject({
      userName: DELETER_NAME,
      action: 'delete_type',
      productName: type.Type,
    });
    expect(log.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'Type', oldValue: type.Type, newValue: '' }),
    ]));
  });

  it('still deletes the type when ActivityLog persistence fails', async () => {
    const type = await createType('Delete Log Failure');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(
      new Error('forced delete_type log failure'),
    );

    const response = await deleterAgent.delete('/products/types/' + type._id);

    expect(response.status).toBe(200);
    expect(await Type.findById(type._id)).toBeNull();
    expect(await ActivityLog.countDocuments({
      action: 'delete_type',
      productName: type.Type,
    })).toBe(0);
  });

  it('returns 500 on type lookup failure without changing the database', async () => {
    const type = await createType('Delete Lookup Failure');
    const before = await readFixtureState();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const findByIdSpy = jest.spyOn(Type, 'findById').mockImplementationOnce(() => {
      throw new Error('forced Type.findById failure');
    });

    const response = await deleterAgent.delete('/products/types/' + type._id);

    expect(response.status).toBe(500);
    findByIdSpy.mockRestore();
    expect(await readFixtureState()).toEqual(before);
  });

  it('returns 500 on product count failure without changing the database', async () => {
    const type = await createType('Delete Count Failure');
    const before = await readFixtureState();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const countSpy = jest.spyOn(Product, 'countDocuments').mockImplementationOnce(() => {
      throw new Error('forced Product.countDocuments failure');
    });

    const response = await deleterAgent.delete('/products/types/' + type._id);

    expect(response.status).toBe(500);
    countSpy.mockRestore();
    expect(await readFixtureState()).toEqual(before);
  });
});
