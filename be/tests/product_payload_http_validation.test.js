const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { ActivityLog } = require('../models/activitylog');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const ADMIN_PHONE = '0972700001';
const STAFF_PHONE = '0972700002';
const ADMIN_NAME = 'Payload HTTP Admin';
const STAFF_NAME = 'Payload HTTP Staff';
const TEST_PRODUCT_FILTER = {
  $or: [
    { code: /^PAYLOAD-HTTP-/ },
    { name: /^Payload HTTP/ },
  ],
};

let adminAgent;
let staffAgent;

const buildCreatePayload = (overrides = {}) => ({
  type: 'PLC',
  name: 'Payload HTTP Product',
  code: 'PAYLOAD-HTTP-BASE',
  brand: 'Siemens',
  section: 'Automation',
  value: 'PLC',
  warranty: '12 months',
  infoDoc: { manual: '' },
  documents: [],
  variant: [{
    price: '100000',
    importPrice: '75000',
    earn: 25,
    color: 'Gray',
    quantityForSale: 10,
    quantityInStorage: 10,
  }],
  ...overrides,
});

const cleanupTestData = async ({ includeUsers = false } = {}) => {
  await Promise.all([
    ActivityLog.deleteMany({ userName: { $in: [ADMIN_NAME, STAFF_NAME] } }),
    Product.deleteMany(TEST_PRODUCT_FILTER),
    ...(includeUsers
      ? [User.deleteMany({ phone: { $in: [ADMIN_PHONE, STAFF_PHONE] } })]
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
  expect(loginResponse.headers['set-cookie']).toBeDefined();
  return agent;
};

const expectFieldValidationError = (response, fieldPath) => {
  expect(response.status).toBe(400);
  expect(response.status).not.toBe(500);
  expect(response.body.message).toEqual(expect.any(String));
  expect(response.body.message).toContain(fieldPath);
};

const readProductSnapshot = async (productId) => {
  const product = await Product.findById(productId).lean();
  return JSON.parse(JSON.stringify(product));
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupTestData({ includeUsers: true });
  adminAgent = await createAuthenticatedAgent({
    phone: ADMIN_PHONE,
    name: ADMIN_NAME,
    role: 'admin',
  });
  staffAgent = await createAuthenticatedAgent({
    phone: STAFF_PHONE,
    name: STAFF_NAME,
    role: 'staff',
    permissions: ['product.edit'],
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

describe('Product payload HTTP validation', () => {
  it.each([
    ['code object', 'code-object', { code: { value: 'OBJECT-CODE' } }, 'code'],
    ['name number', 'name-number', { name: 2026 }, 'name'],
    ['name object', 'name-object', { name: { value: 'Object name' } }, 'name'],
    ['variant object', 'variant-object', { variant: { price: '100000' } }, 'variant'],
    ['documents object', 'documents-object', { documents: { label: 'Manual' } }, 'documents'],
  ])('rejects malformed create payload: %s', async (_label, caseKey, override, fieldPath) => {
    const response = await adminAgent
      .post('/products/create')
      .send(buildCreatePayload({
        code: `PAYLOAD-HTTP-CREATE-${caseKey}`,
        name: `Payload HTTP Create ${caseKey}`,
        ...override,
      }));

    expectFieldValidationError(response, fieldPath);
    expect(await Product.countDocuments(TEST_PRODUCT_FILTER)).toBe(0);
  });

  it.each([
    ['code object', { code: { value: 'OBJECT-CODE' } }, 'code'],
    ['name number', { name: 2026 }, 'name'],
    ['name object', { name: { value: 'Object name' } }, 'name'],
    ['infoDoc scalar', { infoDoc: 'manual.pdf' }, 'infoDoc'],
    ['documents object', { documents: { label: 'Manual' } }, 'documents'],
    ['variant object', { variant: { price: '100000' } }, 'variant'],
  ])('rejects malformed update payload: %s without changing the product', async (_label, update, fieldPath) => {
    const product = await Product.create(buildCreatePayload({
      code: 'PAYLOAD-HTTP-UPDATE-TARGET',
      name: 'Payload HTTP Update Target',
      infoDoc: { manual: 'before-manual.pdf' },
      documents: [{ label: 'Before', url: 'before.pdf', sourceType: 'file' }],
    }));
    const before = await readProductSnapshot(product._id);

    const response = await staffAgent
      .put(`/products/${product._id}`)
      .send(update);

    expectFieldValidationError(response, fieldPath);
    expect(await readProductSnapshot(product._id)).toEqual(before);
  });

  it('keeps supported scalar coercion when creating a product', async () => {
    const response = await adminAgent
      .post('/products/create')
      .send(buildCreatePayload({
        code: 'PAYLOAD-HTTP-VALID-CREATE',
        name: 'Payload HTTP Valid Create',
        vat: 10,
        adjusted: 0,
        infoDoc: { manual: 2026 },
        documents: [{ label: 123, url: 456, sourceType: 789 }],
        variant: [{
          price: 150000,
          importPrice: 120000,
          earn: '30',
          imgUrl: 999,
          color: 7,
          quantityForSale: '4',
          quantityInStorage: '5',
          note: false,
        }],
      }));

    expect(response.status).toBe(201);
    const created = await Product.findById(response.body.product._id).lean();
    expect(created).toEqual(expect.objectContaining({
      vat: '10',
      adjusted: false,
      infoDoc: expect.objectContaining({ manual: '2026' }),
      documents: [expect.objectContaining({ label: '123', url: '456', sourceType: '789' })],
    }));
    expect(created.variant[0]).toEqual(expect.objectContaining({
      price: '150000',
      importPrice: '120000',
      earn: 30,
      imgUrl: '999',
      color: '7',
      quantityForSale: 4,
      quantityInStorage: 5,
      note: 'false',
    }));
  });

  it('strips client variant ids, applies legacy earn defaults, and writes the create log', async () => {
    const firstClientId = new mongoose.Types.ObjectId();
    const secondClientId = new mongoose.Types.ObjectId();
    const response = await adminAgent
      .post('/products/create')
      .send(buildCreatePayload({
        code: 'PAYLOAD-HTTP-CREATE-VARIANT-NORMALIZATION',
        name: 'Payload HTTP Create Variant Normalization',
        variant: [
          {
            _id: firstClientId,
            price: '150000',
            importPrice: '120000',
            earn: null,
            quantityForSale: 2,
            quantityInStorage: 3,
          },
          {
            _id: secondClientId,
            price: '80000',
            importPrice: '80000',
            earn: 0,
            quantityForSale: 4,
            quantityInStorage: 5,
          },
        ],
      }));

    expect(response.status).toBe(201);
    const created = await Product.findById(response.body.product._id).lean();
    expect(created.variant).toHaveLength(2);
    expect(created.variant[0]._id.toString()).not.toBe(firstClientId.toString());
    expect(created.variant[1]._id.toString()).not.toBe(secondClientId.toString());
    expect(created.variant[0].earn).toBe(25);
    expect(created.variant[1].earn).toBe(0);
    const log = await ActivityLog.findOne({ productId: created._id }).lean();
    expect(log).toMatchObject({
      userName: ADMIN_NAME,
      action: 'create_product',
      productName: created.name,
    });
    expect(log.details).toHaveLength(1);
    expect(log.details[0]).toMatchObject({
      field: 'Tạo mới',
      oldValue: '',
      newValue: created.name,
    });
  });

  it('keeps the created Product when ActivityLog persistence fails', async () => {
    jest.spyOn(ActivityLog.prototype, 'save').mockRejectedValueOnce(new Error('forced create_product log failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await adminAgent
      .post('/products/create')
      .send(buildCreatePayload({
        code: 'PAYLOAD-HTTP-CREATE-LOG-FAILURE',
        name: 'Payload HTTP Create Log Failure',
      }));

    expect(response.status).toBe(201);
    expect(await Product.findById(response.body.product._id)).not.toBeNull();
    expect(await ActivityLog.countDocuments({ productId: response.body.product._id })).toBe(0);
  });

  it('maps a code unique-index failure to the legacy 409 response', async () => {
    const duplicateError = Object.assign(new Error('duplicate code'), {
      code: 11000,
      keyPattern: { code: 1 },
      keyValue: { code: 'PAYLOAD-HTTP-UNIQUE-CONFLICT' },
    });
    jest.spyOn(Product.prototype, 'save').mockRejectedValueOnce(duplicateError);

    const response = await adminAgent
      .post('/products/create')
      .send(buildCreatePayload({
        code: 'PAYLOAD-HTTP-UNIQUE-CONFLICT',
        name: 'Payload HTTP Unique Conflict',
      }));

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('PAYLOAD-HTTP-UNIQUE-CONFLICT');
    expect(await Product.countDocuments({ code: 'PAYLOAD-HTTP-UNIQUE-CONFLICT' })).toBe(0);
    expect(await ActivityLog.countDocuments({ productName: 'Payload HTTP Unique Conflict' })).toBe(0);
  });

  it('keeps supported scalar coercion when updating a product', async () => {
    const product = await Product.create(buildCreatePayload({
      code: 'PAYLOAD-HTTP-VALID-UPDATE',
      name: 'Payload HTTP Valid Update',
    }));

    const response = await staffAgent
      .put(`/products/${product._id}`)
      .send({
        vat: 12,
        adjusted: 0,
        infoDoc: { manual: 2027 },
        documents: [{ label: 321, url: 654, sourceType: 987 }],
        variant: [{
          _id: product.variant[0]._id,
          price: 250000,
          importPrice: 200000,
          earn: '35',
          imgUrl: 888,
          color: 6,
          note: true,
        }],
      });

    expect(response.status).toBe(200);
    const updated = await Product.findById(product._id).lean();
    expect(updated).toEqual(expect.objectContaining({
      vat: '12',
      adjusted: false,
      infoDoc: expect.objectContaining({ manual: '2027' }),
      documents: [expect.objectContaining({ label: '321', url: '654', sourceType: '987' })],
    }));
    expect(updated.variant[0]).toEqual(expect.objectContaining({
      price: '250000',
      importPrice: '200000',
      earn: 35,
      imgUrl: '888',
      color: '6',
      note: 'true',
    }));
  });
});
