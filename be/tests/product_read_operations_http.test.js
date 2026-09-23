const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Product } = require('../models/product');
const { User } = require('../models/user');
const { defaultPermissionsFor } = require('./fixtures/adminPermissions');

const DATABASE_URL = 'mongodb://localhost:27017/EcomProductReadOperationsTest';
const PASSWORD = 'password123';
const PRODUCT_CODE_PREFIX = 'PRODUCT-READ-HTTP-';
const CUSTOMER_PHONE = '0968273101';
const EDITOR_PHONE = '0968273102';
const BLOCKED_PHONE = '0968273103';
const ADMIN_PHONE = '0968273104';
const TEST_PHONES = [CUSTOMER_PHONE, EDITOR_PHONE, BLOCKED_PHONE, ADMIN_PHONE];

let customerAgent;
let editorAgent;
let blockedAgent;
let adminAgent;
let productSequence = 0;

const serialize = (value) => JSON.parse(JSON.stringify(value));

const createProduct = async (label, overrides = {}) => {
  productSequence += 1;

  return Product.create({
    type: 'PLC',
    name: 'Product Read HTTP ' + label + ' ' + productSequence,
    code: PRODUCT_CODE_PREFIX + label.toUpperCase().replace(/[^A-Z0-9]+/g, '-') + '-' + productSequence,
    brand: 'Product Read Brand',
    section: 'Product Read Section',
    value: 'PLC',
    warranty: '12 months',
    display: true,
    purchaseCount: 0,
    variant: [{
      price: '100000',
      importPrice: '75000',
      earn: 25,
      color: 'Gray',
      quantityForSale: 8,
      quantityInStorage: 10,
    }],
    ...overrides,
  });
};

const createAuthenticatedAgent = async ({ phone, name, role, permissions = defaultPermissionsFor(role) }) => {
  await User.create({
    phone,
    password: PASSWORD,
    name,
    role,
    functions: ['product_management'],
    permissions,
  });

  const agent = request.agent(app);
  const endpoint = role === 'customer' ? '/users/login' : '/users/admin/login';
  const loginResponse = await agent
    .post(endpoint)
    .send({ phone, password: PASSWORD });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.headers['set-cookie']).toBeDefined();
  return agent;
};

const expectPrivatePricingRedacted = (product) => {
  expect(product.variant).toEqual(expect.any(Array));
  expect(product.variant[0]).toEqual(expect.objectContaining({
    price: '100000',
    contactForPrice: false,
  }));
  product.variant.forEach((variant) => {
    expect(variant).toHaveProperty('contactForPrice');
    expect(variant).not.toHaveProperty('importPrice');
    expect(variant).not.toHaveProperty('earn');
  });
};

const expectRawPricing = (product) => {
  expect(product.variant[0]).toEqual(expect.objectContaining({
    price: '100000',
    importPrice: '75000',
    earn: 25,
  }));
  product.variant.forEach((variant) => {
    expect(variant).toHaveProperty('importPrice');
    expect(variant).toHaveProperty('earn');
    expect(variant).not.toHaveProperty('contactForPrice');
  });
};

const readDatabaseSnapshot = async () => {
  const [products, users] = await Promise.all([
    Product.collection
      .find({})
      .sort({ _id: 1 })
      .toArray(),
    User.collection
      .find({})
      .sort({ _id: 1 })
      .toArray(),
  ]);

  return serialize({ products, users });
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await mongoose.connection.db.dropDatabase();

  customerAgent = await createAuthenticatedAgent({
    phone: CUSTOMER_PHONE,
    name: 'Product Read Customer',
    role: 'customer',
  });
  editorAgent = await createAuthenticatedAgent({
    phone: EDITOR_PHONE,
    name: 'Product Read Editor',
    role: 'staff',
    permissions: ['product.edit'],
  });
  blockedAgent = await createAuthenticatedAgent({
    phone: BLOCKED_PHONE,
    name: 'Product Read Blocked Staff',
    role: 'staff',
    permissions: ['product.view'],
  });
  adminAgent = await createAuthenticatedAgent({
    phone: ADMIN_PHONE,
    name: 'Product Read Admin',
    role: 'admin',
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([
    Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } }),
    User.updateOne({ phone: CUSTOMER_PHONE }, { $set: { permissions: [] } }),
  ]);
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

describe('Product read route precedence', () => {
  it('matches /top-purchased before the generic /:_id route', async () => {
    const response = await request(app).get('/products/top-purchased');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('matches /:_id/admin-detail as the protected admin route', async () => {
    const product = await createProduct('Admin Route Precedence');

    const response = await request(app).get('/products/' + product._id + '/admin-detail');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Access denied, no token provided' });
  });
});

describe('GET /products/top-purchased', () => {
  it('shows guests only visible products in descending purchase order with private pricing removed', async () => {
    const lower = await createProduct('Guest Lower', { purchaseCount: 3 });
    const higher = await createProduct('Guest Higher', { purchaseCount: 9 });
    await createProduct('Guest Hidden', { purchaseCount: 100, display: false });

    const response = await request(app).get('/products/top-purchased');

    expect(response.status).toBe(200);
    expect(response.body.map((product) => product._id)).toEqual([
      higher._id.toString(),
      lower._id.toString(),
    ]);
    response.body.forEach(expectPrivatePricingRedacted);
  });

  it('returns at most the ten highest-purchased visible products', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, index) => (
      createProduct('Limit ' + (index + 1), { purchaseCount: index + 1 })
    )));

    const response = await request(app).get('/products/top-purchased');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(10);
    expect(response.body.map((product) => product.purchaseCount)).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3,
    ]);
  });

  it('applies contact-only pricing presentation to top-purchased results', async () => {
    const product = await createProduct('Top Contact Only', {
      purchaseCount: 12,
      variant: [{
        price: '75000',
        importPrice: '75000',
        earn: 0,
        color: 'Gray',
        quantityForSale: 8,
        quantityInStorage: 10,
      }],
    });

    const response = await request(app).get('/products/top-purchased');

    expect(response.status).toBe(200);
    expect(response.body[0]._id).toBe(product._id.toString());
    expect(response.body[0].variant[0]).toEqual(expect.objectContaining({
      price: '',
      contactForPrice: true,
    }));
    expect(response.body[0].variant[0]).not.toHaveProperty('importPrice');
    expect(response.body[0].variant[0]).not.toHaveProperty('earn');
  });

  it('lets customers read all visible products', async () => {
    const lower = await createProduct('Customer Lower', { purchaseCount: 4 });
    const higher = await createProduct('Customer Higher', { purchaseCount: 11 });
    const hidden = await createProduct('Customer Hidden', { purchaseCount: 80, display: false });
    const outside = await createProduct('Customer Outside', { purchaseCount: 90 });

    const response = await customerAgent.get('/products/top-purchased');

    expect(response.status).toBe(200);
    expect(response.body.map((product) => product._id)).toEqual([
      outside._id.toString(),
      higher._id.toString(),
      lower._id.toString(),
    ]);
    response.body.forEach(expectPrivatePricingRedacted);
  });

  it('lets an admin see hidden products but still removes private pricing', async () => {
    const visible = await createProduct('Admin Visible Top', { purchaseCount: 2 });
    const hidden = await createProduct('Admin Hidden Top', { purchaseCount: 20, display: false });

    const response = await adminAgent.get('/products/top-purchased');

    expect(response.status).toBe(200);
    expect(response.body.map((product) => product._id)).toEqual([
      hidden._id.toString(),
      visible._id.toString(),
    ]);
    response.body.forEach(expectPrivatePricingRedacted);
  });

  it('lets staff see hidden products through public reads while still redacting pricing', async () => {
    const product = await createProduct('Staff Hidden Read', {
      display: false,
      purchaseCount: 14,
    });

    const topResponse = await blockedAgent.get('/products/top-purchased');
    const detailResponse = await blockedAgent.get('/products/' + product._id);

    expect(topResponse.status).toBe(200);
    expect(topResponse.body.map((item) => item._id)).toContain(product._id.toString());
    expectPrivatePricingRedacted(topResponse.body.find((item) => item._id === product._id.toString()));
    expect(detailResponse.status).toBe(200);
    expectPrivatePricingRedacted(detailResponse.body);
  });

  it('rejects a malformed auth cookie instead of falling back to guest access', async () => {
    const product = await createProduct('Invalid Cookie Top', { purchaseCount: 5 });

    const topResponse = await request(app)
      .get('/products/top-purchased')
      .set('Cookie', ['authToken=invalid-token']);
    const detailResponse = await request(app)
      .get('/products/' + product._id)
      .set('Cookie', ['authToken=invalid-token']);

    expect(topResponse.status).toBe(401);
    expect(detailResponse.status).toBe(401);
  });
});

describe('GET /products/:_id/admin-detail', () => {
  it('denies a customer without product.edit on admin detail', async () => {
    const product = await createProduct('Customer Admin Detail');

    const response = await customerAgent.get('/products/' + product._id + '/admin-detail');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      message: 'Access denied, missing permission: product.edit',
    });
  });

  it('allows a customer with product.edit to read raw pricing because access is permission-based', async () => {
    const product = await createProduct('Customer Editor Admin Detail', { display: false });
    await User.updateOne(
      { phone: CUSTOMER_PHONE },
      { $set: { permissions: ['product.edit'] } }
    );

    const response = await customerAgent.get('/products/' + product._id + '/admin-detail');

    expect(response.status).toBe(200);
    expect(response.body._id).toBe(product._id.toString());
    expectRawPricing(response.body);
  });

  it('denies authenticated staff without product.edit', async () => {
    const product = await createProduct('Blocked Admin Detail');

    const response = await blockedAgent.get('/products/' + product._id + '/admin-detail');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      message: 'Access denied, missing permission: product.edit',
    });
  });

  it('lets product.edit staff read hidden products with raw pricing', async () => {
    const product = await createProduct('Editor Raw Detail', { display: false });

    const response = await editorAgent.get('/products/' + product._id + '/admin-detail');

    expect(response.status).toBe(200);
    expect(response.body._id).toBe(product._id.toString());
    expect(response.body.display).toBe(false);
    expectRawPricing(response.body);
  });

  it('lets admins read raw private pricing', async () => {
    const product = await createProduct('Admin Raw Detail');

    const response = await adminAgent.get('/products/' + product._id + '/admin-detail');

    expect(response.status).toBe(200);
    expect(response.body._id).toBe(product._id.toString());
    expectRawPricing(response.body);
  });

  it('returns the legacy 404 response for a missing valid ObjectId', async () => {
    const missingId = new mongoose.Types.ObjectId();

    const response = await editorAgent.get('/products/' + missingId + '/admin-detail');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Product not found' });
  });

  it('returns the legacy 500 response for an invalid ObjectId', async () => {
    const response = await editorAgent.get('/products/not-an-object-id/admin-detail');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'L\u1ed7i server' });
  });
});

describe('GET /products/:_id', () => {
  it('lets a guest read a visible product with private pricing removed', async () => {
    const product = await createProduct('Guest Public Detail');

    const response = await request(app).get('/products/' + product._id);

    expect(response.status).toBe(200);
    expect(response.body._id).toBe(product._id.toString());
    expectPrivatePricingRedacted(response.body);
  });

  it('hides a non-displayed product from guests', async () => {
    const product = await createProduct('Guest Hidden Detail', { display: false });

    const response = await request(app).get('/products/' + product._id);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Product not found' });
  });

  it('lets a customer read any visible product with redaction', async () => {
    const product = await createProduct('Unassigned Customer Detail');

    const response = await customerAgent.get('/products/' + product._id);

    expect(response.status).toBe(200);
    expect(response.body._id).toBe(product._id.toString());
    expectPrivatePricingRedacted(response.body);
  });

  it('lets a customer read any visible product detail', async () => {
    const inside = await createProduct('First Visible Detail');
    const outside = await createProduct('Second Visible Detail');

    const insideResponse = await customerAgent.get('/products/' + inside._id);
    const outsideResponse = await customerAgent.get('/products/' + outside._id);

    expect(insideResponse.status).toBe(200);
    expect(insideResponse.body._id).toBe(inside._id.toString());
    expectPrivatePricingRedacted(insideResponse.body);
    expect(outsideResponse.status).toBe(200);
    expectPrivatePricingRedacted(outsideResponse.body);
  });

  it('lets an admin read hidden products through the public route but still redacts pricing', async () => {
    const product = await createProduct('Admin Hidden Public Detail', { display: false });

    const response = await adminAgent.get('/products/' + product._id);

    expect(response.status).toBe(200);
    expect(response.body._id).toBe(product._id.toString());
    expect(response.body.display).toBe(false);
    expectPrivatePricingRedacted(response.body);
  });

  it('keeps contact-only presentation behavior on public detail', async () => {
    const product = await createProduct('Contact Only Detail', {
      variant: [{
        price: '75000',
        importPrice: '75000',
        earn: 0,
        color: 'Gray',
        quantityForSale: 8,
        quantityInStorage: 10,
      }],
    });

    const response = await request(app).get('/products/' + product._id);

    expect(response.status).toBe(200);
    expect(response.body.variant[0]).toEqual(expect.objectContaining({
      price: '',
      contactForPrice: true,
    }));
    expect(response.body.variant[0]).not.toHaveProperty('importPrice');
    expect(response.body.variant[0]).not.toHaveProperty('earn');
  });

  it('returns the legacy 404 response for a missing valid ObjectId', async () => {
    const missingId = new mongoose.Types.ObjectId();

    const response = await request(app).get('/products/' + missingId);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Product not found' });
  });

  it('returns the legacy 500 response for an invalid ObjectId', async () => {
    const response = await request(app).get('/products/not-an-object-id');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'L\u1ed7i server' });
  });
});

describe('Product read multi-variant pricing boundaries', () => {
  it('redacts every public variant and preserves every admin-detail private field', async () => {
    const product = await createProduct('Multiple Variants', {
      purchaseCount: 18,
      variant: [
        {
          price: '100000',
          importPrice: '75000',
          earn: 25,
          color: 'Gray',
          quantityForSale: 8,
          quantityInStorage: 10,
        },
        {
          price: '220000',
          importPrice: '165000',
          earn: 25,
          color: 'Black',
          quantityForSale: 6,
          quantityInStorage: 9,
        },
      ],
    });

    const topResponse = await request(app).get('/products/top-purchased');
    const publicResponse = await request(app).get('/products/' + product._id);
    const adminResponse = await adminAgent.get('/products/' + product._id + '/admin-detail');

    expect(topResponse.status).toBe(200);
    expect(topResponse.body[0].variant).toHaveLength(2);
    expectPrivatePricingRedacted(topResponse.body[0]);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.variant).toHaveLength(2);
    expectPrivatePricingRedacted(publicResponse.body);
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.variant).toHaveLength(2);
    expectRawPricing(adminResponse.body);
    expect(adminResponse.body.variant[1]).toEqual(expect.objectContaining({
      importPrice: '165000',
      earn: 25,
    }));
  });
});

describe('Product read server errors', () => {
  it('preserves the legacy response body for database failures', async () => {
    const product = await createProduct('Database Failure');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Product, 'find').mockImplementationOnce(() => ({
      sort: () => ({
        limit: () => Promise.reject(new Error('top read failed')),
      }),
    }));

    const topResponse = await request(app).get('/products/top-purchased');
    jest.spyOn(Product, 'findById').mockRejectedValueOnce(new Error('admin detail failed'));
    const adminResponse = await adminAgent.get('/products/' + product._id + '/admin-detail');
    jest.spyOn(Product, 'findOne').mockRejectedValueOnce(new Error('public detail failed'));
    const detailResponse = await request(app).get('/products/' + product._id);

    expect(topResponse.status).toBe(500);
    expect(topResponse.body).toEqual({ message: 'Lỗi server khi lấy sản phẩm mua nhiều' });
    expect(adminResponse.status).toBe(500);
    expect(adminResponse.body).toEqual({ message: 'Lỗi server' });
    expect(detailResponse.status).toBe(500);
    expect(detailResponse.body).toEqual({ message: 'Lỗi server' });
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error fetching top purchased products:',
      expect.any(Error)
    );
  });
});

describe('Product read database invariants', () => {
  it('does not mutate products or users through any read endpoint', async () => {
    const product = await createProduct('No Mutation', { purchaseCount: 7 });

    const beforeTopPurchased = await readDatabaseSnapshot();
    const topPurchasedResponse = await customerAgent.get('/products/top-purchased');
    expect(topPurchasedResponse.status).toBe(200);
    expect(await readDatabaseSnapshot()).toEqual(beforeTopPurchased);

    const beforePublicDetail = await readDatabaseSnapshot();
    const publicDetailResponse = await customerAgent.get('/products/' + product._id);
    expect(publicDetailResponse.status).toBe(200);
    expect(await readDatabaseSnapshot()).toEqual(beforePublicDetail);

    const beforeAdminDetail = await readDatabaseSnapshot();
    const adminDetailResponse = await adminAgent.get('/products/' + product._id + '/admin-detail');
    expect(adminDetailResponse.status).toBe(200);
    expect(await readDatabaseSnapshot()).toEqual(beforeAdminDetail);
  });
});
