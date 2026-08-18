const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order, Counter } = require('../models/order');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const EDITOR_PHONE = '0984600001';
const VIEWER_PHONE = '0984600002';
const USER_PHONES = [EDITOR_PHONE, VIEWER_PHONE];
const PASSWORD = 'password123';

let editorAgent;
let viewerAgent;
const createdOrderIds = [];

const cleanupOrders = async () => {
  if (createdOrderIds.length > 0) {
    await Order.deleteMany({ _id: { $in: createdOrderIds } });
    createdOrderIds.splice(0, createdOrderIds.length);
  }
};

const createStaffAgent = async (phone, permissions) => {
  await User.create({
    phone,
    password: PASSWORD,
    name: 'Order Draft Staff ' + phone,
    role: 'staff',
    functions: ['order_management'],
    permissions,
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/users/admin/login')
    .send({ phone, password: PASSWORD });
  expect(login.status).toBe(200);
  return agent;
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await User.deleteMany({ phone: { $in: USER_PHONES } });
  editorAgent = await createStaffAgent(EDITOR_PHONE, ['order.create']);
  viewerAgent = await createStaffAgent(VIEWER_PHONE, ['order.view']);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupOrders();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await cleanupOrders();
  await User.deleteMany({ phone: { $in: USER_PHONES } });
  await mongoose.disconnect();
});

describe('POST /orders/admin-draft HTTP characterization', () => {
  it('requires order.create permission', async () => {
    const response = await viewerAgent.post('/orders/admin-draft').send({ arbitrary: true });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: order.create');
  });

  it('creates the legacy empty Processing draft and ignores request body fields', async () => {
    const response = await editorAgent
      .post('/orders/admin-draft')
      .send({ userPhone: '0984609999', items: [{ forged: true }] });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.order.orderCode).toMatch(/^NOVA-\d+$/);
    expect(response.body.order.userPhone).toBe('');
    expect(response.body.order.userName).toBe('');
    expect(response.body.order.cartItems).toEqual([]);
    expect(response.body.order.total).toBe(0);
    expect(response.body.order.status).toBe('Processing');
    expect(response.body.order.state).toBe('Processing');
    createdOrderIds.push(response.body.order._id);
  });

  it('maps Counter failures to the legacy 500 response', async () => {
    jest.spyOn(Counter, 'findOneAndUpdate').mockRejectedValueOnce(new Error('forced Counter failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent.post('/orders/admin-draft').send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: 'Lỗi khi tạo đơn nháp' });
  });

  it('maps draft Order save failures to the legacy 500 response', async () => {
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(new Error('forced draft save failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent.post('/orders/admin-draft').send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: 'Lỗi khi tạo đơn nháp' });
  });
});
