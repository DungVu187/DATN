const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const EDITOR_PHONE = '0984900001';
const VIEWER_PHONE = '0984900002';
const USER_PHONES = [EDITOR_PHONE, VIEWER_PHONE];
const ORDER_CODE_PREFIX = 'ORDER-CUSTOMER-UPDATE-';
const PASSWORD = 'password123';

let editorAgent;
let viewerAgent;
let fixtureSequence = 0;

const nextOrderCode = () => ORDER_CODE_PREFIX + Date.now() + '-' + String(++fixtureSequence);

const cleanupFixtures = async (includeUsers = false) => {
  await Promise.all([
    Order.deleteMany({ orderCode: new RegExp('^' + ORDER_CODE_PREFIX) }),
    ...(includeUsers ? [User.deleteMany({ phone: { $in: USER_PHONES } })] : []),
  ]);
};

const createStaffAgent = async (phone, permissions) => {
  await User.create({
    phone,
    password: PASSWORD,
    name: 'Customer Update Staff ' + phone,
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

const createOrder = async ({ status = 'Processing', state = 'Processing' } = {}) => {
  return Order.create({
    orderCode: nextOrderCode(),
    userPhone: '0984999999',
    userName: 'Existing Customer',
    cartItems: [],
    total: 0,
    status,
    state,
  });
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupFixtures(true);
  editorAgent = await createStaffAgent(EDITOR_PHONE, ['order.edit']);
  viewerAgent = await createStaffAgent(VIEWER_PHONE, ['order.view']);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupFixtures();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await cleanupFixtures(true);
  await mongoose.disconnect();
});

describe('PUT /orders/:id/customer HTTP characterization', () => {
  it('requires order.edit permission', async () => {
    const order = await createOrder();
    const response = await viewerAgent
      .put('/orders/' + order._id + '/customer')
      .send({ userName: 'Blocked Update' });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: order.edit');
  });

  it('validates phone before looking up the Order', async () => {
    const findById = jest.spyOn(Order, 'findById');

    const response = await editorAgent
      .put('/orders/507f1f77bcf86cd799439011/customer')
      .send({ userPhone: '123' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: 'Số điện thoại không hợp lệ' });
    expect(findById).not.toHaveBeenCalled();
  });

  it('updates customer fields and preserves nullish values', async () => {
    const order = await createOrder();
    const response = await editorAgent
      .put('/orders/' + order._id + '/customer')
      .send({ userName: 'Updated Customer', userPhone: '0984912345' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.order).toMatchObject({
      _id: order._id.toString(),
      userName: 'Updated Customer',
      userPhone: '0984912345',
    });

    const preserved = await editorAgent
      .put('/orders/' + order._id + '/customer')
      .send({ userName: null, userPhone: null });
    expect(preserved.status).toBe(200);
    expect(preserved.body.order.userName).toBe('Updated Customer');
    expect(preserved.body.order.userPhone).toBe('0984912345');
  });

  it('maps missing and locked orders to their legacy responses', async () => {
    const missing = await editorAgent
      .put('/orders/507f1f77bcf86cd799439011/customer')
      .send({ userName: 'Missing' });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, message: 'Không tìm thấy đơn hàng' });

    for (const state of [{ status: 'Completed', state: 'Processing' }, { status: 'Processing', state: 'Cancelled' }]) {
      const order = await createOrder(state);
      const response = await editorAgent
        .put('/orders/' + order._id + '/customer')
        .send({ userName: 'Locked Update' });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        message: 'Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.',
      });
    }
  });

  it('maps Order save failures to the legacy 500 response', async () => {
    const order = await createOrder();
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(new Error('forced customer update failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent
      .put('/orders/' + order._id + '/customer')
      .send({ userName: 'Save Failure' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: 'Lỗi khi lưu thông tin khách hàng' });
  });
});
