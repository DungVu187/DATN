const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const EDITOR_PHONE = '0985000001';
const VIEWER_PHONE = '0985000002';
const USER_PHONES = [EDITOR_PHONE, VIEWER_PHONE];
const ORDER_CODE_PREFIX = 'ORDER-IMAGES-UPDATE-';
const PRODUCT_CODE_PREFIX = 'ORDER-IMAGES-PRODUCT-';
const PASSWORD = 'password123';

let editorAgent;
let viewerAgent;
let fixtureSequence = 0;

const nextSuffix = () => String(Date.now()) + '-' + String(++fixtureSequence);

const cleanupFixtures = async (includeUsers = false) => {
  await Promise.all([
    Order.deleteMany({ orderCode: new RegExp('^' + ORDER_CODE_PREFIX) }),
    Product.deleteMany({ code: new RegExp('^' + PRODUCT_CODE_PREFIX) }),
    ...(includeUsers ? [User.deleteMany({ phone: { $in: USER_PHONES } })] : []),
  ]);
};

const createStaffAgent = async (phone, permissions) => {
  await User.create({
    phone,
    password: PASSWORD,
    name: 'Order Images Staff ' + phone,
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

const createProduct = async () => Product.create({
  type: 'PLC',
  name: 'Order Images Product',
  code: PRODUCT_CODE_PREFIX + nextSuffix(),
  brand: 'Order Images Brand',
  section: 'Automation',
  value: 'PLC',
  warranty: '12 months',
  variant: [{
    price: '100000',
    imgUrl: '/images/order-images.webp',
    quantityForSale: 10,
    quantityInStorage: 10,
  }],
});

const createOrder = async ({ images = ['/invoice-images/original.webp'], cartItems = [] } = {}) => {
  return Order.create({
    orderCode: ORDER_CODE_PREFIX + nextSuffix(),
    userPhone: '0985099999',
    userName: 'Order Images Customer',
    cartItems,
    images,
    total: 0,
    status: 'Processing',
    state: 'Processing',
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

describe('PUT /orders/:id/images HTTP gap characterization', () => {
  it('requires order.edit permission', async () => {
    const order = await createOrder();
    const response = await viewerAgent
      .put('/orders/' + order._id + '/images')
      .send({ images: [] });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: order.edit');
  });

  it('validates the complete array before looking up the Order', async () => {
    const findById = jest.spyOn(Order, 'findById');

    const missingImages = await editorAgent
      .put('/orders/not-an-id/images')
      .send({});
    const mixedImages = await editorAgent
      .put('/orders/not-an-id/images')
      .send({ images: ['/invoice-images/a.webp', 42] });

    for (const response of [missingImages, mixedImages]) {
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Danh sách ảnh không hợp lệ' });
    }
    expect(findById).not.toHaveBeenCalled();
  });

  it('keeps legacy not-found and malformed-id responses', async () => {
    const missing = await editorAgent
      .put('/orders/507f1f77bcf86cd799439011/images')
      .send({ images: [] });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, message: 'Không tìm thấy đơn hàng' });

    jest.spyOn(console, 'error').mockImplementation(() => {});
    const malformed = await editorAgent
      .put('/orders/not-an-id/images')
      .send({ images: [] });
    expect(malformed.status).toBe(500);
    expect(malformed.body).toEqual({ success: false, message: 'Lỗi khi lưu danh sách ảnh' });
  });

  it('does not persist images when Order save fails', async () => {
    const order = await createOrder();
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(new Error('forced images save failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent
      .put('/orders/' + order._id + '/images')
      .send({ images: ['/invoice-images/new.webp'] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: 'Lỗi khi lưu danh sách ảnh' });
    const persisted = await Order.findById(order._id);
    expect(persisted.images).toEqual(['/invoice-images/original.webp']);
  });

  it('keeps the legacy committed mutation when presentation fails after save', async () => {
    const product = await createProduct();
    const order = await createOrder({
      cartItems: [{
        productId: product._id.toString(),
        variantIndex: 0,
        quantity: 1,
      }],
    });
    jest.spyOn(Product, 'findById').mockRejectedValueOnce(new Error('forced presentation failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent
      .put('/orders/' + order._id + '/images')
      .send({ images: ['/invoice-images/committed.webp'] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: 'Lỗi khi lưu danh sách ảnh' });
    const persisted = await Order.findById(order._id);
    expect(persisted.images).toEqual(['/invoice-images/committed.webp']);
  });
});
