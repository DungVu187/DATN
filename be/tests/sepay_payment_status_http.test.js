const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { User } = require('../models/user');
const { defaultPermissionsFor } = require('./fixtures/adminPermissions');

const sepayEnvKeys = ['SEPAY_BANK_CODE', 'SEPAY_ACCOUNT_NUMBER', 'SEPAY_ACCOUNT_NAME'];
const originalSepayEnv = Object.fromEntries(sepayEnvKeys.map((key) => [key, process.env[key]]));

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
  process.env.SEPAY_BANK_CODE = 'MB';
  process.env.SEPAY_ACCOUNT_NUMBER = '0000111122223333';
  process.env.SEPAY_ACCOUNT_NAME = 'NOVA TEST';
});

afterAll(async () => {
  sepayEnvKeys.forEach((key) => {
    if (originalSepayEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalSepayEnv[key];
  });
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await Order.deleteMany({});
  await User.deleteMany({});
});

async function createUser({ phone, role = 'customer' }) {
  return User.create({
    phone,
    password: 'password123',
    name: 'Payment ' + phone,
    role,
    functions: role === 'staff' ? ['order_management'] : [],
    permissions: defaultPermissionsFor(role),
  });
}

async function loginAgent({ phone, role = 'customer' }) {
  const agent = request.agent(app);
  const endpoint = role === 'customer' ? '/users/login' : '/users/admin/login';
  const response = await agent.post(endpoint).send({ phone, password: 'password123' });
  expect(response.status).toBe(200);
  return agent;
}

async function createSepayOrder(userPhone) {
  return Order.create({
    orderCode: 'NOVA-PAY-' + Date.now() + '-' + Math.random(),
    userPhone,
    userName: 'Payment Buyer',
    cartItems: [],
    total: 150000,
    paymentMethod: 'SEPAY',
    paymentStatus: 'PENDING',
    paymentReference: 'NOVAPAY' + Math.floor(Math.random() * 1e6),
    paymentAmount: 150000,
    paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
}

describe('GET /payments/orders/:orderId/status', () => {
  test('admin tự đặt đơn SePay vẫn lấy được QR thanh toán', async () => {
    await createUser({ phone: '0943000001', role: 'admin' });
    const order = await createSepayOrder('0943000001');
    const agent = await loginAgent({ phone: '0943000001', role: 'admin' });

    const response = await agent.get(`/payments/orders/${order._id}/status`);

    expect(response.status).toBe(200);
    expect(response.body.paymentStatus).toBe('PENDING');
    expect(response.body.payment.qrUrl).toContain('https://qr.sepay.vn/img?');
  });

  test('khách hàng chủ đơn lấy được QR thanh toán', async () => {
    await createUser({ phone: '0943000002' });
    const order = await createSepayOrder('0943000002');
    const agent = await loginAgent({ phone: '0943000002' });

    const response = await agent.get(`/payments/orders/${order._id}/status`);

    expect(response.status).toBe(200);
    expect(response.body.payment.reference).toBe(order.paymentReference);
  });

  test('khách hàng khác không xem được giao dịch của người khác', async () => {
    await createUser({ phone: '0943000003' });
    await createUser({ phone: '0943000004' });
    const order = await createSepayOrder('0943000003');
    const agent = await loginAgent({ phone: '0943000004' });

    const response = await agent.get(`/payments/orders/${order._id}/status`);

    expect(response.status).toBe(403);
  });

  test('chưa đăng nhập thì bị từ chối', async () => {
    await createUser({ phone: '0943000005' });
    const order = await createSepayOrder('0943000005');

    const response = await request(app).get(`/payments/orders/${order._id}/status`);

    expect(response.status).toBe(401);
  });
});
