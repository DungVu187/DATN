const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ActivityLog } = require('../models/activitylog');
const { Manage } = require('../models/manage');
const { Product } = require('../models/product');
const { Type } = require('../models/producttype');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const TYPE_PREFIX = 'PTR-';
const PRODUCT_CODE_PREFIX = 'PTR-PRODUCT-';
const EDITOR_PHONE = '0988700101';
const BLOCKED_PHONE = '0988700102';
const EDITOR_NAME = 'Product Type Rename Editor';
const BLOCKED_NAME = 'Product Type Rename Blocked';
const TEST_PHONES = [EDITOR_PHONE, BLOCKED_PHONE];
const TEST_USER_NAMES = [EDITOR_NAME, BLOCKED_NAME];

let editorAgent;
let blockedAgent;
let manageBaseline;
let productSequence = 0;

const serialize = (value) => JSON.parse(JSON.stringify(value, (key, entry) => (
  key === 'createdAt' || key === 'updatedAt' ? undefined : entry
)));

const cleanupOwnedFixtures = async () => {
  await Promise.all([
    ActivityLog.deleteMany({
      $or: [
        { userName: { $in: TEST_USER_NAMES } },
        { productName: { $regex: '^' + TYPE_PREFIX } },
      ],
    }),
    Product.deleteMany({
      $or: [
        { code: { $regex: '^' + PRODUCT_CODE_PREFIX } },
        { type: { $regex: '^' + TYPE_PREFIX } },
      ],
    }),
    Type.deleteMany({ Type: { $regex: '^' + TYPE_PREFIX } }),
  ]);
};

const restoreManageBaseline = async () => {
  await Manage.deleteMany({});
  if (manageBaseline.length > 0) {
    await Manage.collection.insertMany(manageBaseline);
  }
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
    name: 'Product Type Rename ' + label + ' ' + productSequence,
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    brand: 'Product Type Rename Brand',
    section: 'Product Type Rename Section',
    value: typeName,
    warranty: '12 months',
    display: true,
    variant: [{
      price: '100000',
      quantityForSale: 0,
      quantityInStorage: 0,
    }],
  });
};

const ensureManageDocument = async (items) => {
  let manage = await Manage.findOne();
  if (!manage) {
    manage = new Manage();
  }
  manage.homeCategoryConfig = {
    ...(manage.homeCategoryConfig?.toObject?.() || manage.homeCategoryConfig || {}),
    configured: true,
    items,
  };
  await manage.save();
  return manage;
};

const readState = async () => {
  const [types, products, manages, logs] = await Promise.all([
    Type.find({ Type: { $regex: '^' + TYPE_PREFIX } }).sort({ _id: 1 }).lean(),
    Product.find({
      $or: [
        { code: { $regex: '^' + PRODUCT_CODE_PREFIX } },
        { type: { $regex: '^' + TYPE_PREFIX } },
      ],
    }).sort({ _id: 1 }).lean(),
    Manage.find().sort({ _id: 1 }).lean(),
    ActivityLog.find({
      $or: [
        { userName: { $in: TEST_USER_NAMES } },
        { productName: { $regex: '^' + TYPE_PREFIX } },
      ],
    }).sort({ _id: 1 }).lean(),
  ]);

  return serialize({ types, products, manages, logs });
};

const expectRejectedWithoutMutation = async (requestFactory, expectedStatus) => {
  const before = await readState();
  const response = await requestFactory();
  expect(response.status).toBe(expectedStatus);
  expect(await readState()).toEqual(before);
  return response;
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  manageBaseline = await Manage.find().lean();
  await cleanupOwnedFixtures();
  await User.deleteMany({ phone: { $in: TEST_PHONES } });

  editorAgent = await createAuthenticatedAgent({
    phone: EDITOR_PHONE,
    name: EDITOR_NAME,
    permissions: ['product.edit'],
  });
  blockedAgent = await createAuthenticatedAgent({
    phone: BLOCKED_PHONE,
    name: BLOCKED_NAME,
    permissions: ['product.create'],
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupOwnedFixtures();
  await restoreManageBaseline();
});

afterAll(async () => {
  await cleanupOwnedFixtures();
  await restoreManageBaseline();
  await User.deleteMany({ phone: { $in: TEST_PHONES } });
  await mongoose.disconnect();
});

describe('PUT /products/types/:id', () => {
  it('requires authentication and product.edit permission', async () => {
    const type = await createType('Auth');

    await expectRejectedWithoutMutation(
      () => request(app).put('/products/types/' + type._id).send({ Type: TYPE_PREFIX + 'Auth New' }),
      401,
    );

    await expectRejectedWithoutMutation(
      () => blockedAgent.put('/products/types/' + type._id).send({ Type: TYPE_PREFIX + 'Auth New' }),
      403,
    );
  });

  it('maps missing and malformed ids without mutation', async () => {
    const missingId = new mongoose.Types.ObjectId();

    const missingResponse = await expectRejectedWithoutMutation(
      () => editorAgent.put('/products/types/' + missingId).send({ Type: TYPE_PREFIX + 'Missing' }),
      404,
    );
    expect(missingResponse.body.message).toEqual(expect.any(String));

    const invalidResponse = await expectRejectedWithoutMutation(
      () => editorAgent.put('/products/types/not-an-object-id').send({ Type: TYPE_PREFIX + 'Invalid' }),
      400,
    );
    expect(invalidResponse.body.message).toEqual(expect.any(String));
  });

  it('rejects invalid names, icons, and normalized duplicates', async () => {
    const type = await createType('Validation');
    await createType('Existing Name');

    await expectRejectedWithoutMutation(
      () => editorAgent.put('/products/types/' + type._id).send({ Type: '   ', icon: 'ri-tb-cpu' }),
      400,
    );

    await expectRejectedWithoutMutation(
      () => editorAgent.put('/products/types/' + type._id).send({
        Type: TYPE_PREFIX + 'Invalid Icon',
        icon: '<script>alert(1)</script>',
      }),
      400,
    );

    const duplicateResponse = await expectRejectedWithoutMutation(
      () => editorAgent.put('/products/types/' + type._id).send({
        Type: '  ptr existing---name  ',
        icon: 'ri-tb-cpu',
      }),
      409,
    );
    expect(duplicateResponse.body.message).toBe('Tên loại sản phẩm đã tồn tại');
  });

  it('renames products and home categories while preserving custom fields', async () => {
    const oldName = TYPE_PREFIX + 'Old Name';
    const nextName = TYPE_PREFIX + 'New Name';
    const oldIcon = 'ri-tb-box-multiple';
    const nextIcon = 'ri-tb-circuit-motor';
    const type = await createType('Old Name', { icon: oldIcon });
    const firstProduct = await createProduct(oldName, 'First');
    const secondProduct = await createProduct(oldName, 'Second');
    await ensureManageDocument([
      { id: 'matching-default', label: oldName, type: oldName, icon: oldIcon },
      { id: 'matching-custom', label: 'Custom label', type: oldName, icon: 'ri-tb-robot' },
      { id: 'other-type', label: oldName, type: TYPE_PREFIX + 'Other', icon: oldIcon },
    ]);

    const response = await editorAgent
      .put('/products/types/' + type._id)
      .send({ Type: nextName, icon: nextIcon });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      Type: nextName,
      icon: nextIcon,
      updatedProducts: 2,
      updatedHomeCategories: 2,
    });
    expect((await Product.findById(firstProduct._id)).type).toBe(nextName);
    expect((await Product.findById(secondProduct._id)).type).toBe(nextName);
    const manage = await Manage.findOne();
    expect(manage.homeCategoryConfig.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'matching-default', label: nextName, type: nextName, icon: nextIcon }),
      expect.objectContaining({ id: 'matching-custom', label: 'Custom label', type: nextName, icon: 'ri-tb-robot' }),
      expect.objectContaining({ id: 'other-type', label: oldName, type: TYPE_PREFIX + 'Other', icon: oldIcon }),
    ]));
    const log = await ActivityLog.findOne({ userName: EDITOR_NAME, action: 'update_type', productName: nextName }).lean();
    expect(log.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'Type', oldValue: oldName, newValue: nextName }),
      expect.objectContaining({ field: 'icon', oldValue: oldIcon, newValue: nextIcon }),
    ]));
  });

  it('updates an icon without renaming products and preserves custom category icons', async () => {
    const typeName = TYPE_PREFIX + 'Icon Only';
    const type = await createType('Icon Only');
    const product = await createProduct(typeName, 'Icon Only');
    await ensureManageDocument([
      { id: 'default-icon', label: typeName, type: typeName, icon: 'ri-tb-box-multiple' },
      { id: 'custom-icon', label: 'Custom label', type: typeName, icon: 'ri-tb-robot' },
    ]);

    const response = await editorAgent
      .put('/products/types/' + type._id)
      .send({ Type: typeName, icon: 'ri-tb-circuit-motor' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ updatedProducts: 0, updatedHomeCategories: 1 });
    expect((await Product.findById(product._id)).type).toBe(typeName);
    const manage = await Manage.findOne();
    expect(manage.homeCategoryConfig.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'default-icon', icon: 'ri-tb-circuit-motor' }),
      expect.objectContaining({ id: 'custom-icon', icon: 'ri-tb-robot' }),
    ]));
  });

  it('keeps the operation successful when ActivityLog persistence fails', async () => {
    const type = await createType('Log Failure');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(new Error('forced update_type log failure'));

    const response = await editorAgent
      .put('/products/types/' + type._id)
      .send({ Type: TYPE_PREFIX + 'Log Failure New', icon: 'ri-tb-cpu' });

    expect(response.status).toBe(200);
    expect(await Type.findById(type._id)).toMatchObject({ Type: TYPE_PREFIX + 'Log Failure New', icon: 'ri-tb-cpu' });
    expect(await ActivityLog.countDocuments({ action: 'update_type', productName: TYPE_PREFIX + 'Log Failure New' })).toBe(0);
  });

  it('rolls back the Type when Product discovery fails', async () => {
    const type = await createType('Distinct Failure');
    const before = await readState();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Product, 'distinct').mockRejectedValueOnce(new Error('forced Product.distinct failure'));

    const response = await editorAgent
      .put('/products/types/' + type._id)
      .send({ Type: TYPE_PREFIX + 'Distinct Failure New', icon: 'ri-tb-cpu' });

    expect(response.status).toBe(500);
    expect(await readState()).toEqual(before);
  });

  it('rolls back Product and Type when Manage lookup fails', async () => {
    const oldName = TYPE_PREFIX + 'Manage Lookup Failure';
    const type = await createType('Manage Lookup Failure');
    await createProduct(oldName, 'Manage Lookup Failure');
    await ensureManageDocument([]);
    const before = await readState();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Manage, 'findOne').mockRejectedValueOnce(new Error('forced Manage.findOne failure'));

    const response = await editorAgent
      .put('/products/types/' + type._id)
      .send({ Type: TYPE_PREFIX + 'Manage Lookup Failure New', icon: 'ri-tb-cpu' });

    expect(response.status).toBe(500);
    expect(await readState()).toEqual(before);
  });

  it('rolls back Product and Type when Manage save fails', async () => {
    const oldName = TYPE_PREFIX + 'Manage Save Failure';
    const type = await createType('Manage Save Failure');
    await createProduct(oldName, 'Manage Save Failure');
    await ensureManageDocument([{ id: 'save-failure', label: oldName, type: oldName, icon: 'ri-tb-box-multiple' }]);
    const before = await readState();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Manage.prototype, 'save').mockRejectedValueOnce(new Error('forced Manage.save failure'));

    const response = await editorAgent
      .put('/products/types/' + type._id)
      .send({ Type: TYPE_PREFIX + 'Manage Save Failure New', icon: 'ri-tb-cpu' });

    expect(response.status).toBe(500);
    expect(await readState()).toEqual(before);
  });

  it('restores the Type when the initial save writes and then rejects', async () => {
    const type = await createType('Type Save Uncertain');
    const before = await readState();
    const originalSave = Type.prototype.save;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Type.prototype, 'save').mockImplementationOnce(async function (...args) {
      await originalSave.apply(this, args);
      throw new Error('forced Type.save post-write failure');
    });

    const response = await editorAgent
      .put('/products/types/' + type._id)
      .send({ Type: TYPE_PREFIX + 'Type Save Uncertain New', icon: 'ri-tb-cpu' });

    expect(response.status).toBe(500);
    expect(await readState()).toEqual(before);
  });

  it('restores a legacy Type without persisting an inferred rollback icon', async () => {
    const oldName = TYPE_PREFIX + 'Legacy No Icon';
    const insertResult = await Type.collection.insertOne({ Type: oldName });
    const before = await readState();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Product, 'distinct').mockRejectedValueOnce(new Error('forced legacy rollback failure'));

    const response = await editorAgent
      .put('/products/types/' + insertResult.insertedId)
      .send({ Type: TYPE_PREFIX + 'Legacy No Icon New', icon: 'ri-tb-cpu' });

    expect(response.status).toBe(500);
    expect(await readState()).toEqual(before);
    const restoredType = await Type.collection.findOne({ _id: insertResult.insertedId });
    expect(restoredType).not.toHaveProperty('icon');
  });

  it('restores Manage when its save writes and then rejects', async () => {
    const oldName = TYPE_PREFIX + 'Manage Post Write Failure';
    const type = await createType('Manage Post Write Failure');
    await createProduct(oldName, 'Manage Post Write Failure');
    await ensureManageDocument([{
      id: 'post-write-failure',
      label: oldName,
      type: oldName,
      icon: 'ri-tb-box-multiple',
    }]);
    const before = await readState();
    const originalSave = Manage.prototype.save;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Manage.prototype, 'save').mockImplementationOnce(async function (...args) {
      await originalSave.apply(this, args);
      throw new Error('forced Manage.save post-write failure');
    });

    const response = await editorAgent
      .put('/products/types/' + type._id)
      .send({ Type: TYPE_PREFIX + 'Manage Post Write Failure New', icon: 'ri-tb-cpu' });

    expect(response.status).toBe(500);
    expect(await readState()).toEqual(before);
  });

  it('continues Manage and Type compensation when Product rollback fails', async () => {
    const oldName = TYPE_PREFIX + 'Rollback Continuation';
    const nextName = TYPE_PREFIX + 'Rollback Continuation New';
    const type = await createType('Rollback Continuation');
    const product = await createProduct(oldName, 'Rollback Continuation');
    await ensureManageDocument([{
      id: 'rollback-continuation',
      label: oldName,
      type: oldName,
      icon: 'ri-tb-box-multiple',
    }]);
    const originalUpdateMany = Product.updateMany.bind(Product);
    let updateCallCount = 0;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Product, 'updateMany').mockImplementation(async (...args) => {
      updateCallCount += 1;
      if (updateCallCount === 1) {
        return originalUpdateMany(...args);
      }
      throw new Error('forced Product rollback failure');
    });
    jest.spyOn(Manage.prototype, 'save').mockRejectedValueOnce(new Error('forced Manage.save failure'));
    const manageRollbackSpy = jest.spyOn(Manage, 'updateOne');
    const typeRollbackSpy = jest.spyOn(Type, 'updateOne');

    const response = await editorAgent
      .put('/products/types/' + type._id)
      .send({ Type: nextName, icon: 'ri-tb-cpu' });

    expect(response.status).toBe(500);
    expect(manageRollbackSpy).toHaveBeenCalled();
    expect(typeRollbackSpy).toHaveBeenCalled();
    expect((await Type.findById(type._id)).Type).toBe(oldName);
    expect((await Product.findById(product._id)).type).toBe(nextName);
    const manage = await Manage.findOne();
    expect(manage.homeCategoryConfig.items[0]).toMatchObject({
      label: oldName,
      type: oldName,
      icon: 'ri-tb-box-multiple',
    });
    expect(await ActivityLog.countDocuments({ action: 'update_type', productName: nextName })).toBe(0);
  });
});
