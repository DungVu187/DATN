const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { Product } = require('../models/product');
const { User } = require('../models/user');
const { defaultPermissionsFor } = require('./fixtures/adminPermissions');

const originalAddress = process.env.ADDRESS;

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterAll(async () => {
  if (originalAddress === undefined) {
    delete process.env.ADDRESS;
  } else {
    process.env.ADDRESS = originalAddress;
  }
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  if (originalAddress === undefined) {
    delete process.env.ADDRESS;
  } else {
    process.env.ADDRESS = originalAddress;
  }
  await Order.deleteMany({});
  await Product.deleteMany({});
  await User.deleteMany({});
});

async function createUser({ phone, role = 'customer', permissions = defaultPermissionsFor(role), name }) {
  return User.create({
    phone,
    password: 'password123',
    name: name || 'Detail ' + phone,
    role,
    functions: role === 'staff' ? ['order_management'] : [],
    permissions,
  });
}

async function loginAgent({ phone, role = 'customer' }) {
  const agent = request.agent(app);
  const endpoint = role === 'customer' ? '/users/login' : '/users/admin/login';
  const response = await agent
    .post(endpoint)
    .send({ phone, password: 'password123' });

  expect(response.status).toBe(200);
  return agent;
}

async function createProduct(overrides = {}) {
  return Product.create({
    type: 'PLC',
    name: 'Order Detail Product',
    code: 'ORDER-DETAIL-' + Date.now() + '-' + Math.random(),
    brand: 'Detail Brand',
    section: 'Thiết bị tự động hóa',
    value: 'PLC',
    warranty: '12 tháng',
    variant: [{
      price: '123.000',
      color: 'Xám',
      shape: 'Tròn',
      imgUrl: 'https://legacy.example/images/detail.webp',
      quantityForSale: 10,
      quantityInStorage: 10,
    }],
    ...overrides,
  });
}

async function createOrder(overrides = {}) {
  return Order.create({
    orderCode: 'NOVA-DETAIL-' + Date.now() + '-' + Math.random(),
    userPhone: '0942000001',
    userName: 'Detail Customer',
    cartItems: [],
    total: 123000,
    ...overrides,
  });
}

describe('Order detail read HTTP contract', () => {
  it('keeps admin detail auth and order.view permission', async () => {
    const order = await createOrder();
    await createUser({ phone: '0941000001', role: 'customer' });
    await createUser({ phone: '0941000002', role: 'staff' });
    await createUser({
      phone: '0941000003',
      role: 'staff',
      permissions: ['order.view'],
    });
    const customerAgent = await loginAgent({ phone: '0941000001' });
    const blockedStaffAgent = await loginAgent({ phone: '0941000002', role: 'staff' });
    const allowedStaffAgent = await loginAgent({ phone: '0941000003', role: 'staff' });

    expect((await request(app).get('/orders/admin-detail/' + order._id)).status).toBe(401);
    expect((await customerAgent.get('/orders/admin-detail/' + order._id)).status).toBe(403);

    const blocked = await blockedStaffAgent.get('/orders/admin-detail/' + order._id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Access denied, missing permission: order.view');

    const allowed = await allowedStaffAgent.get('/orders/admin-detail/' + order._id);
    expect(allowed.status).toBe(200);
    expect(allowed.body.success).toBe(true);
  });

  it('keeps admin detail selected fields, enrichment and image rewriting', async () => {
    process.env.ADDRESS = 'https://detail.example/base/';
    await createUser({ phone: '0941000004', role: 'admin' });
    const agent = await loginAgent({ phone: '0941000004', role: 'admin' });
    const product = await createProduct();
    const order = await createOrder({
      orderCode: 'NOVA-DETAIL-ADMIN',
      userPhone: '0942000002',
      userName: 'Admin Detail Customer',
      cartItems: [{ productId: product._id.toString(), variantIndex: 0, quantity: 2 }],
      total: 246000,
      images: ['/invoice-images/detail.webp'],
    });

    const response = await agent.get('/orders/admin-detail/' + order._id);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.order).sort()).toEqual([
      '_id',
      'cartItems',
      'completedAt',
      'images',
      'orderCode',
      'payment',
      'state',
      'status',
      'total',
      'userName',
      'userPhone',
    ].sort());
    expect(response.body.order.cartItems).toEqual([{
      productId: product._id.toString(),
      variantIndex: 0,
      quantity: 2,
      name: 'Order Detail Product',
      code: product.code,
      brand: 'Detail Brand',
      imgUrl: 'https://detail.example/base/images/detail.webp',
      price: '123.000',
    }]);
  });

  it('keeps admin detail missing-product and error envelopes', async () => {
    await createUser({ phone: '0941000005', role: 'admin' });
    const agent = await loginAgent({ phone: '0941000005', role: 'admin' });
    const missingProductId = new mongoose.Types.ObjectId().toString();
    const order = await createOrder({
      cartItems: [{ productId: missingProductId, variantIndex: 4, quantity: 3 }],
    });

    const response = await agent.get('/orders/admin-detail/' + order._id);
    expect(response.status).toBe(200);
    expect(response.body.order.cartItems).toEqual([{
      productId: missingProductId,
      variantIndex: 4,
      quantity: 3,
      name: '',
      code: '',
      brand: '',
      imgUrl: '',
      price: '0',
    }]);

    const missing = await agent.get('/orders/admin-detail/' + new mongoose.Types.ObjectId());
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, message: 'Không tìm thấy đơn hàng' });

    const invalid = await agent.get('/orders/admin-detail/not-an-object-id');
    expect(invalid.status).toBe(500);
    expect(invalid.body).toEqual({ success: false, message: 'Lỗi khi lấy chi tiết đơn hàng' });
  });

  it('keeps customer detail owner response shape and product presentation', async () => {
    process.env.ADDRESS = 'https://detail.example/base/';
    await createUser({ phone: '0942000003', role: 'customer' });
    const agent = await loginAgent({ phone: '0942000003' });
    const product = await createProduct();
    const order = await createOrder({
      userPhone: '0942000003',
      cartItems: [{ productId: product._id.toString(), variantIndex: 0, quantity: 2 }],
      total: 246000,
      payment: true,
    });

    const response = await agent.get('/orders/' + order._id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userPhone: '0942000003',
      total: 246000,
      cartItems: [{
        name: 'Order Detail Product',
        brand: 'Detail Brand',
        variant: {
          color: 'Xám',
          shape: 'Tròn',
          price: '123.000',
          imgUrl: 'https://detail.example/base/images/detail.webp',
        },
        quantity: 2,
      }],
      status: 'Processing',
      payment: true,
    });
  });

  it('filters missing products and preserves an empty variant object', async () => {
    await createUser({ phone: '0942000004', role: 'customer' });
    const agent = await loginAgent({ phone: '0942000004' });
    const product = await createProduct();
    const order = await createOrder({
      userPhone: '0942000004',
      cartItems: [
        { productId: new mongoose.Types.ObjectId().toString(), variantIndex: 0, quantity: 1 },
        { productId: product._id.toString(), variantIndex: 99, quantity: 2 },
      ],
    });

    const response = await agent.get('/orders/' + order._id);

    expect(response.status).toBe(200);
    expect(response.body.cartItems).toEqual([{
      name: 'Order Detail Product',
      brand: 'Detail Brand',
      variant: {},
      quantity: 2,
    }]);
  });

  it('keeps owner isolation while privileged staff can read without order.view', async () => {
    await createUser({ phone: '0942000005', role: 'customer' });
    await createUser({ phone: '0942000006', role: 'customer' });
    await createUser({ phone: '0941000006', role: 'staff' });
    const attackerAgent = await loginAgent({ phone: '0942000005' });
    const staffAgent = await loginAgent({ phone: '0941000006', role: 'staff' });
    const order = await createOrder({ userPhone: '0942000006' });

    const blocked = await attackerAgent.get('/orders/' + order._id);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ message: 'Bạn không có quyền xem đơn hàng này.' });

    const allowed = await staffAgent.get('/orders/' + order._id);
    expect(allowed.status).toBe(200);
    expect(allowed.body.userPhone).toBe('0942000006');
  });

  it('keeps customer detail not-found and invalid-id envelopes', async () => {
    await createUser({ phone: '0942000007', role: 'customer' });
    const agent = await loginAgent({ phone: '0942000007' });

    const missing = await agent.get('/orders/' + new mongoose.Types.ObjectId());
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: 'Order not found' });

    const invalid = await agent.get('/orders/not-an-object-id');
    expect(invalid.status).toBe(500);
    expect(invalid.body).toEqual({ message: 'Lỗi server' });
  });
});
