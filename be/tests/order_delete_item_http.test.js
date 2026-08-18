const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const PRODUCT_CODE_PREFIX = 'ORDER-DELETE-HTTP-PRODUCT-';
const ORDER_CODE_PREFIX = 'ORDER-DELETE-HTTP-ORDER-';
const PASSWORD = 'password123';
const EDITOR_PHONE = '0984500001';
const VIEWER_PHONE = '0984500002';
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
    name: 'Order Delete Staff ' + phone,
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

const createProduct = async ({ name = 'Order Delete Product', price = '100.000', quantityForSale = 8 } = {}) => {
  return Product.create({
    type: 'PLC',
    name,
    code: PRODUCT_CODE_PREFIX + nextSuffix(),
    brand: 'Delete Test Brand',
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

const toLine = (productId, quantity = 2, variantIndex = 0) => ({
  productId: String(productId),
  variantIndex,
  quantity,
});

const createOrder = async ({ cartItems = [], total = 0, status = 'Processing', state = 'Processing' } = {}) => {
  return Order.create({
    orderCode: ORDER_CODE_PREFIX + nextSuffix(),
    userPhone: '0984599999',
    userName: 'Delete HTTP Customer',
    cartItems,
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

describe('DELETE /orders/:id/items/:index HTTP characterization', () => {
  it('requires order.edit permission', async () => {
    const response = await viewerAgent
      .delete('/orders/' + new mongoose.Types.ObjectId() + '/items/0');

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: order.edit');
  });

  it('keeps missing and malformed Order responses', async () => {
    const missing = await editorAgent
      .delete('/orders/' + new mongoose.Types.ObjectId() + '/items/0');
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('Không tìm thấy đơn hàng');

    jest.spyOn(console, 'error').mockImplementation(() => {});
    const malformed = await editorAgent.delete('/orders/not-an-id/items/0');
    expect(malformed.status).toBe(500);
    expect(malformed.body).toEqual({
      success: false,
      message: 'Lỗi khi xóa sản phẩm khỏi đơn hàng',
    });
  });

  it.each([
    ['Completed', 'Processing'],
    ['Processing', 'Cancelled'],
  ])('rejects a %s/%s locked Order before restoring stock', async (status, state) => {
    const product = await createProduct();
    const order = await createOrder({
      cartItems: [toLine(product._id)],
      total: 200000,
      status,
      state,
    });

    const response = await editorAgent.delete('/orders/' + order._id + '/items/0');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: LOCKED_MESSAGE });
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
    expect((await Order.findById(order._id)).cartItems).toHaveLength(1);
  });

  it.each(['bad', '-1', '1.5', '4'])('rejects invalid or missing line index %s', async (index) => {
    const product = await createProduct();
    const order = await createOrder({ cartItems: [toLine(product._id)], total: 200000 });

    const response = await editorAgent.delete('/orders/' + order._id + '/items/' + index);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, message: 'Không tìm thấy dòng sản phẩm' });
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
  });

  it('restores sale stock and removes the selected line', async () => {
    const product = await createProduct({ quantityForSale: 8 });
    const order = await createOrder({ cartItems: [toLine(product._id, 2)], total: 200000 });

    const response = await editorAgent.delete('/orders/' + order._id + '/items/0');

    expect(response.status).toBe(200);
    expect(response.body.order.cartItems).toEqual([]);
    expect(response.body.order.total).toBe(0);
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(10);
    expect((await Order.findById(order._id)).cartItems).toHaveLength(0);
  });

  it('reprices and enriches remaining lines in their preserved order', async () => {
    const deletedProduct = await createProduct({ name: 'Deleted Product', price: '100.000', quantityForSale: 8 });
    const remainingProduct = await createProduct({ name: 'Remaining Product', price: '200.000', quantityForSale: 9 });
    const order = await createOrder({
      cartItems: [
        toLine(deletedProduct._id, 2),
        toLine(remainingProduct._id, 1),
      ],
      total: 400000,
    });
    await Product.updateOne(
      { _id: remainingProduct._id },
      { $set: { 'variant.0.price': '210.000' } }
    );

    const response = await editorAgent.delete('/orders/' + order._id + '/items/0');

    expect(response.status).toBe(200);
    expect(response.body.order.total).toBe(210000);
    expect(response.body.order.cartItems).toEqual([{
      productId: remainingProduct._id.toString(),
      variantIndex: 0,
      quantity: 1,
      name: 'Remaining Product',
      code: remainingProduct.code,
      brand: 'Delete Test Brand',
      imgUrl: '',
      price: '210.000',
    }]);
    expect((await Product.findById(deletedProduct._id)).variant[0].quantityForSale).toBe(10);
  });

  it.each([
    ['missing Product', new mongoose.Types.ObjectId().toString(), 0],
    ['missing variant', null, 9],
  ])('deletes a line with %s because stock planning uses skipMissing', async (_caseName, productId, variantIndex) => {
    let product;
    if (!productId) {
      product = await createProduct();
      productId = product._id.toString();
    }
    const order = await createOrder({
      cartItems: [toLine(productId, 2, variantIndex)],
      total: 200000,
    });

    const response = await editorAgent.delete('/orders/' + order._id + '/items/0');

    expect(response.status).toBe(200);
    expect(response.body.order.cartItems).toEqual([]);
    expect((await Order.findById(order._id)).cartItems).toHaveLength(0);
    if (product) {
      expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
    }
  });

  it('rolls restored stock back when saving the Order fails', async () => {
    const product = await createProduct({ quantityForSale: 8 });
    const order = await createOrder({ cartItems: [toLine(product._id, 2)], total: 200000 });
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(new Error('forced delete save failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent.delete('/orders/' + order._id + '/items/0');

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Lỗi khi xóa sản phẩm khỏi đơn hàng');
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
    expect((await Order.findById(order._id)).cartItems).toHaveLength(1);
  });
});
