const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { User } = require('../models/user');

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await Order.deleteMany({});
  await User.deleteMany({});
});

async function createUser({ phone, role = 'customer', permissions = [], name }) {
  return User.create({
    phone,
    password: 'password123',
    name: name || 'Read ' + phone,
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

async function createOrder(overrides = {}) {
  return Order.create({
    orderCode: 'NOVA-READ-' + Date.now() + '-' + Math.random(),
    userPhone: '0932000001',
    userName: 'Order Read Customer',
    cartItems: [],
    total: 100000,
    ...overrides,
  });
}

describe('Order read query HTTP contract', () => {
  it('keeps payment filtering, descending creation sort and pagination envelope', async () => {
    await createUser({ phone: '0931000001', role: 'admin' });
    const agent = await loginAgent({ phone: '0931000001', role: 'admin' });
    const older = await createOrder({ orderCode: 'NOVA-READ-PAGE-OLD', payment: false });
    const newer = await createOrder({ orderCode: 'NOVA-READ-PAGE-NEW', payment: false });
    await createOrder({ orderCode: 'NOVA-READ-PAGE-PAID', payment: true });

    await Order.collection.updateOne(
      { _id: older._id },
      { $set: { createdAt: new Date('2026-07-20T01:00:00.000Z') } }
    );
    await Order.collection.updateOne(
      { _id: newer._id },
      { $set: { createdAt: new Date('2026-07-21T01:00:00.000Z') } }
    );

    const response = await agent
      .get('/orders')
      .query({ payment: 'false', page: '2', limit: '1' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 2, currentPage: 2, totalPages: 2 });
    expect(response.body.orders).toHaveLength(1);
    expect(response.body.orders[0]._id).toBe(older._id.toString());
  });

  it('keeps customer suggestions protected by order.view and returns only customers', async () => {
    await createUser({
      phone: '0931000002',
      role: 'staff',
      permissions: ['order.view'],
    });
    await createUser({ phone: '0931000003', role: 'staff' });
    await createUser({
      phone: '0932000002',
      role: 'customer',
      name: 'Suggested Customer',
    });
    const allowedAgent = await loginAgent({ phone: '0931000002', role: 'staff' });
    const blockedAgent = await loginAgent({ phone: '0931000003', role: 'staff' });

    const allowed = await allowedAgent.get('/orders/customer-suggestions');
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({
      success: true,
      customers: [{ name: 'Suggested Customer', phone: '0932000002' }],
    });

    const blocked = await blockedAgent.get('/orders/customer-suggestions');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Access denied, missing permission: order.view');
  });

  it('keeps userOrders ahead of the catch-all route and sorts newest first', async () => {
    await createUser({ phone: '0932000003', role: 'customer' });
    const agent = await loginAgent({ phone: '0932000003', role: 'customer' });
    const older = await createOrder({
      orderCode: 'NOVA-READ-USER-OLD',
      userPhone: '0932000003',
    });
    const newer = await createOrder({
      orderCode: 'NOVA-READ-USER-NEW',
      userPhone: '0932000003',
    });

    await Order.collection.updateOne(
      { _id: older._id },
      { $set: { createdAt: new Date('2026-07-20T01:00:00.000Z') } }
    );
    await Order.collection.updateOne(
      { _id: newer._id },
      { $set: { createdAt: new Date('2026-07-21T01:00:00.000Z') } }
    );

    const response = await agent.get('/orders/userOrders');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Danh sách đơn hàng');
    expect(response.body.orders.map((order) => order._id)).toEqual([
      newer._id.toString(),
      older._id.toString(),
    ]);
  });

  it('rejects an admin session on the customer order history endpoint', async () => {
    await createUser({ phone: '0931000004', role: 'admin' });
    await createOrder({
      orderCode: 'NOVA-READ-ADMIN-PHONE',
      userPhone: '0931000004',
    });
    const agent = await loginAgent({ phone: '0931000004', role: 'admin' });

    const response = await agent.get('/orders/userOrders');

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, customer account required');
  });

  it('keeps processing count public and requires both processing fields', async () => {
    await createOrder({ orderCode: 'NOVA-READ-COUNT-1' });
    await createOrder({ orderCode: 'NOVA-READ-COUNT-2' });
    await createOrder({ orderCode: 'NOVA-READ-COUNT-DELIVERING', status: 'Delivering' });
    await createOrder({ orderCode: 'NOVA-READ-COUNT-CANCELLED', state: 'Cancelled' });

    const response = await request(app).get('/orders/processing-count');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, count: 2 });
  });
});
