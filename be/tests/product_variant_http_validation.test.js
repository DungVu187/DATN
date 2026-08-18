const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Product } = require('../models/product');
const { User } = require('../models/user');
const { ActivityLog } = require('../models/activitylog');

const TEST_DB_URL = 'mongodb://localhost:27017/EcomTest';
const ADMIN_PHONE = '0917000999';
const ADMIN_NAME = 'Variant HTTP Validation Admin';
const PRODUCT_CODE_PREFIX = 'VARIANT-HTTP-';

let adminAgent;
let productSequence = 0;

const serialize = (value) => JSON.parse(JSON.stringify(value));

const cleanTestData = async () => {
  await Promise.all([
    ActivityLog.deleteMany({ userName: ADMIN_NAME }),
    Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } }),
  ]);
};

const createProduct = async () => {
  productSequence += 1;
  return Product.create({
    type: 'PLC',
    name: 'Variant HTTP Validation Product ' + productSequence,
    brand: 'Test Brand',
    section: 'Automation',
    value: 'PLC',
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    warranty: '12 months',
    variant: [{
      price: '100000',
      importPrice: '75000',
      earn: 25,
      imgUrl: '/images/original.png',
      color: 'Gray',
      shape: 'Square',
      buttonCount: '2',
      frame: 'Metal',
      quantityForSale: 10,
      quantityInStorage: 12,
      note: 'original note',
    }],
  });
};

const readProductSnapshot = async (productId) => {
  const product = await Product.findById(productId).lean();
  return serialize(product);
};

const buildVariantRequest = (operation, productId) => {
  if (operation === 'create') {
    return adminAgent.post('/products/' + productId + '/variant');
  }
  return adminAgent.put('/products/' + productId + '/0');
};

const sendVariantRequest = (operation, productId, body, { rawJsonNull = false } = {}) => {
  const httpRequest = buildVariantRequest(operation, productId);
  if (rawJsonNull) {
    return httpRequest
      .set('Content-Type', 'application/json')
      .send('null');
  }
  return httpRequest.send(body);
};

const expectRejectedWithoutMutation = async (operation, body, options) => {
  const product = await createProduct();
  const before = await readProductSnapshot(product._id);

  const response = await sendVariantRequest(operation, product._id, body, options);

  expect(response.status).toBe(400);
  expect(await readProductSnapshot(product._id)).toEqual(before);
  expect(await ActivityLog.countDocuments({ productId: product._id })).toBe(0);
};

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URL);
  await cleanTestData();
  await User.deleteMany({ phone: ADMIN_PHONE });

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
  await cleanTestData();
  await User.deleteMany({ phone: ADMIN_PHONE });
  await mongoose.disconnect();
});

describe.each(['create', 'update'])('%s variant payload shape validation', (operation) => {
  it('rejects an array body without changing the database', async () => {
    await expectRejectedWithoutMutation(operation, [{ price: '200000' }]);
  });

  it('rejects a JSON null body without changing the database', async () => {
    await expectRejectedWithoutMutation(operation, null, { rawJsonNull: true });
  });
});

describe.each([
  ['create', 'object-valued price', { price: { amount: '200000' } }],
  ['create', 'array-valued note', { note: ['new note'] }],
  ['update', 'object-valued price', { price: { amount: '200000' } }],
  ['update', 'array-valued note', { note: ['new note'] }],
])('%s variant scalar validation', (operation, caseName, payload) => {
  it('rejects ' + caseName + ' without changing the database', async () => {
    await expectRejectedWithoutMutation(operation, payload);
  });
});

describe('create variant numeric validation', () => {
  it.each(['earn', 'quantityForSale', 'quantityInStorage'])(
    'rejects nonnumeric %s without changing the database',
    async (field) => {
      await expectRejectedWithoutMutation('create', { [field]: 'not-a-number' });
    }
  );
});

describe('update variant numeric validation', () => {
  it('rejects nonnumeric earn without changing the database', async () => {
    await expectRejectedWithoutMutation('update', { earn: 'not-a-number' });
  });
});

describe('valid create variant payloads', () => {
  it('accepts numeric strings and keeps the existing Mongoose casts', async () => {
    const product = await createProduct();

    const response = await sendVariantRequest('create', product._id, {
      price: '225000',
      importPrice: '150000',
      earn: '33',
      quantityForSale: '7',
      quantityInStorage: '11',
    });

    expect(response.status).toBe(201);
    const updated = await Product.findById(product._id).lean();
    expect(updated.variant).toHaveLength(2);
    expect(updated.variant[1]).toMatchObject({
      price: '225000',
      importPrice: '150000',
      earn: 33,
      quantityForSale: 7,
      quantityInStorage: 11,
    });
  });

  it('accepts empty strings, a boolean note, and ignores an unknown field', async () => {
    const product = await createProduct();

    const response = await sendVariantRequest('create', product._id, {
      price: '',
      importPrice: '',
      earn: '',
      quantityForSale: '',
      quantityInStorage: '',
      note: false,
      unknownField: { nested: true },
    });

    expect(response.status).toBe(201);
    const updated = await Product.findById(product._id).lean();
    expect(updated.variant).toHaveLength(2);
    expect(updated.variant[1]).toMatchObject({
      price: '',
      importPrice: '',
      earn: null,
      quantityForSale: null,
      quantityInStorage: null,
      note: 'false',
    });
    expect(updated.variant[1].unknownField).toBeUndefined();
  });

  it('ignores a client supplied _id and generates a new variant id', async () => {
    const product = await createProduct();
    const clientVariantId = new mongoose.Types.ObjectId();

    const response = await sendVariantRequest('create', product._id, {
      _id: clientVariantId.toString(),
      price: '300000',
    });

    expect(response.status).toBe(201);
    const updated = await Product.findById(product._id).lean();
    expect(updated.variant).toHaveLength(2);
    expect(updated.variant[1]._id.toString()).not.toBe(clientVariantId.toString());
    expect(updated.variant[1]._id.toString()).not.toBe(updated.variant[0]._id.toString());
  });
});

describe('valid update variant payloads', () => {
  it('accepts a numeric string and keeps stock fields unchanged', async () => {
    const product = await createProduct();

    const response = await sendVariantRequest('update', product._id, {
      price: '210000',
      earn: '40',
    });

    expect(response.status).toBe(200);
    const updated = await Product.findById(product._id).lean();
    expect(updated.variant[0]).toMatchObject({
      price: '210000',
      earn: 40,
      quantityForSale: 10,
      quantityInStorage: 12,
    });
  });

  it('accepts empty strings and a boolean note while ignoring an unknown field', async () => {
    const product = await createProduct();

    const response = await sendVariantRequest('update', product._id, {
      price: '',
      importPrice: '',
      earn: '',
      note: false,
      unknownField: ['ignored'],
    });

    expect(response.status).toBe(200);
    const updated = await Product.findById(product._id).lean();
    expect(updated.variant[0]).toMatchObject({
      price: '',
      importPrice: '',
      earn: null,
      note: 'false',
      quantityForSale: 10,
      quantityInStorage: 12,
    });
    expect(updated.variant[0].unknownField).toBeUndefined();
  });
});
