const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const PRODUCT_CODE_PREFIX = 'ORDER-UPDATE-HTTP-PRODUCT-';
const ORDER_CODE_PREFIX = 'ORDER-UPDATE-HTTP-ORDER-';
const PASSWORD = 'password123';
const EDITOR_PHONE = '0984400001';
const VIEWER_PHONE = '0984400002';
const USER_PHONES = [EDITOR_PHONE, VIEWER_PHONE];
const LOCKED_MESSAGE = 'Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.';

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
    name: 'Order Update Staff ' + phone,
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

const createProduct = async ({ name = 'Order Update Product', price = '100.000', quantityForSale = 8 } = {}) => {
  return Product.create({
    type: 'PLC',
    name,
    code: PRODUCT_CODE_PREFIX + nextSuffix(),
    brand: 'Update Test Brand',
    section: 'Automation',
    value: 'PLC',
    warranty: '12 months',
    variant: [{
      price,
      color: 'Gray',
      quantityForSale,
      quantityInStorage: 20,
    }],
  });
};

const createOrder = async ({ product, quantity = 2, total = 200000, status = 'Processing', state = 'Processing' } = {}) => {
  return Order.create({
    orderCode: ORDER_CODE_PREFIX + nextSuffix(),
    userPhone: '0984499999',
    userName: 'Update HTTP Customer',
    cartItems: product ? [{
      productId: product._id.toString(),
      variantIndex: 0,
      quantity,
    }] : [],
    total,
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

describe('PUT /orders/:id/items/:index HTTP characterization', () => {
  it('requires order.edit permission', async () => {
    const response = await viewerAgent
      .put('/orders/' + new mongoose.Types.ObjectId() + '/items/0')
      .send({ quantity: 1 });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: order.edit');
  });

  it('validates quantity before looking up the Order', async () => {
    const response = await editorAgent
      .put('/orders/' + new mongoose.Types.ObjectId() + '/items/0')
      .send({ quantity: 0 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: 'Số lượng không hợp lệ' });
  });

  it('keeps the legacy missing and malformed Order responses', async () => {
    const missing = await editorAgent
      .put('/orders/' + new mongoose.Types.ObjectId() + '/items/0')
      .send({ quantity: 1 });
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('Không tìm thấy đơn hàng');

    jest.spyOn(console, 'error').mockImplementation(() => {});
    const malformed = await editorAgent
      .put('/orders/not-an-id/items/0')
      .send({ quantity: 1 });
    expect(malformed.status).toBe(500);
    expect(malformed.body).toEqual({
      success: false,
      message: 'Lỗi khi cập nhật sản phẩm trong đơn hàng',
    });
  });

  it.each([
    ['Completed', 'Processing'],
    ['Processing', 'Cancelled'],
  ])('rejects a %s/%s locked Order without changing stock', async (status, state) => {
    const product = await createProduct();
    const order = await createOrder({ product, status, state });

    const response = await editorAgent
      .put('/orders/' + order._id + '/items/0')
      .send({ quantity: 3 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: LOCKED_MESSAGE });
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
    expect((await Order.findById(order._id)).cartItems[0].quantity).toBe(2);
  });

  it.each(['bad', '-1', '1.5', '3'])('rejects invalid or missing line index %s', async (index) => {
    const product = await createProduct();
    const order = await createOrder({ product });

    const response = await editorAgent
      .put('/orders/' + order._id + '/items/' + index)
      .send({ quantity: 3 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, message: 'Không tìm thấy dòng sản phẩm' });
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
  });

  it('applies positive and negative quantity deltas to sale stock', async () => {
    const product = await createProduct({ quantityForSale: 8 });
    const order = await createOrder({ product, quantity: 2 });

    const increased = await editorAgent
      .put('/orders/' + order._id + '/items/0')
      .send({ quantity: '5' });
    expect(increased.status).toBe(200);
    expect(increased.body.order.total).toBe(500000);
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(5);

    const decreased = await editorAgent
      .put('/orders/' + order._id + '/items/0')
      .send({ quantity: 3 });
    expect(decreased.status).toBe(200);
    expect(decreased.body.order.total).toBe(300000);
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(7);
  });

  it('reprices and enriches a zero-delta update without changing stock', async () => {
    const product = await createProduct({ name: 'Zero Delta Product', price: '100.000', quantityForSale: 8 });
    const order = await createOrder({ product, quantity: 2, total: 200000 });
    await Product.updateOne({ _id: product._id }, { $set: { 'variant.0.price': '125.500' } });

    const response = await editorAgent
      .put('/orders/' + order._id + '/items/0')
      .send({ quantity: 2 });

    expect(response.status).toBe(200);
    expect(response.body.order.total).toBe(251000);
    expect(response.body.order.cartItems[0]).toMatchObject({
      productId: product._id.toString(),
      quantity: 2,
      name: 'Zero Delta Product',
      price: '125.500',
    });
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
  });

  it('rejects missing Product and insufficient stock without changing the Order', async () => {
    const missingProduct = await createProduct();
    const missingOrder = await createOrder({ product: missingProduct });
    await Product.deleteOne({ _id: missingProduct._id });
    const missingResponse = await editorAgent
      .put('/orders/' + missingOrder._id + '/items/0')
      .send({ quantity: 3 });
    expect(missingResponse.status).toBe(404);
    expect((await Order.findById(missingOrder._id)).cartItems[0].quantity).toBe(2);

    const lowStockProduct = await createProduct({ quantityForSale: 1 });
    const lowStockOrder = await createOrder({ product: lowStockProduct });
    const lowStockResponse = await editorAgent
      .put('/orders/' + lowStockOrder._id + '/items/0')
      .send({ quantity: 4 });
    expect(lowStockResponse.status).toBe(400);
    expect((await Product.findById(lowStockProduct._id)).variant[0].quantityForSale).toBe(1);
    expect((await Order.findById(lowStockOrder._id)).cartItems[0].quantity).toBe(2);
  });

  it('rolls stock back when saving the updated Order fails', async () => {
    const product = await createProduct({ quantityForSale: 8 });
    const order = await createOrder({ product, quantity: 2 });
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(new Error('forced update save failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent
      .put('/orders/' + order._id + '/items/0')
      .send({ quantity: 5 });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Lỗi khi cập nhật sản phẩm trong đơn hàng');
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
    expect((await Order.findById(order._id)).cartItems[0].quantity).toBe(2);
  });
});
