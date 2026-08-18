const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const PRODUCT_CODE_PREFIX = 'ORDER-ADD-HTTP-PRODUCT-';
const ORDER_CODE_PREFIX = 'ORDER-ADD-HTTP-ORDER-';
const STAFF_PHONE = '0984300001';
const PASSWORD = 'password123';
const LOCKED_MESSAGE = 'Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.';

let staffAgent;
let fixtureSequence = 0;

const nextSuffix = () => String(Date.now()) + '-' + String(++fixtureSequence);

const cleanupFixtures = async (includeUser = false) => {
  await Promise.all([
    Order.deleteMany({ orderCode: new RegExp('^' + ORDER_CODE_PREFIX) }),
    Product.deleteMany({ code: new RegExp('^' + PRODUCT_CODE_PREFIX) }),
    ...(includeUser ? [User.deleteMany({ phone: STAFF_PHONE })] : []),
  ]);
};

const createProduct = async ({ name = 'Order Add Product', price = '100.000', quantityForSale = 10 } = {}) => {
  return Product.create({
    type: 'PLC',
    name,
    code: PRODUCT_CODE_PREFIX + nextSuffix(),
    brand: 'Add Test Brand',
    section: 'Automation',
    value: 'PLC',
    warranty: '12 months',
    variant: [{
      price,
      color: 'Gray',
      quantityForSale,
      quantityInStorage: quantityForSale,
    }],
  });
};

const createOrder = async ({ cartItems = [], total = 0, status = 'Processing', state = 'Processing' } = {}) => {
  return Order.create({
    orderCode: ORDER_CODE_PREFIX + nextSuffix(),
    userPhone: '0984399999',
    userName: 'Add HTTP Customer',
    cartItems,
    total,
    status,
    state,
  });
};

const line = (product, quantity = 1, variantIndex = 0) => ({
  productId: product._id.toString(),
  variantIndex,
  quantity,
});

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupFixtures(true);
  await User.create({
    phone: STAFF_PHONE,
    password: PASSWORD,
    name: 'Order Add Staff',
    role: 'staff',
    functions: ['order_management'],
    permissions: ['order.edit'],
  });
  staffAgent = request.agent(app);
  const login = await staffAgent
    .post('/users/admin/login')
    .send({ phone: STAFF_PHONE, password: PASSWORD });
  expect(login.status).toBe(200);
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

describe('POST /orders/:id/items HTTP characterization', () => {
  it('validates the item before looking up a missing order', async () => {
    const response = await staffAgent
      .post('/orders/' + new mongoose.Types.ObjectId() + '/items')
      .send({ productId: 'invalid', variantIndex: 0, quantity: 1 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: 'Sản phẩm không hợp lệ' });
  });

  it('returns the legacy missing-order response for a valid item', async () => {
    const product = await createProduct();
    const response = await staffAgent
      .post('/orders/' + new mongoose.Types.ObjectId() + '/items')
      .send(line(product));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, message: 'Không tìm thấy đơn hàng' });
  });

  it.each([
    ['Completed', 'Processing'],
    ['Processing', 'Cancelled'],
  ])('rejects a %s/%s locked order before stock changes', async (status, state) => {
    const product = await createProduct();
    const order = await createOrder({ status, state });

    const response = await staffAgent
      .post('/orders/' + order._id + '/items')
      .send(line(product));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: LOCKED_MESSAGE });
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(10);
    expect((await Order.findById(order._id)).cartItems).toHaveLength(0);
  });

  it('keeps stock and order unchanged when the Product is missing', async () => {
    const order = await createOrder();
    const response = await staffAgent
      .post('/orders/' + order._id + '/items')
      .send({ productId: new mongoose.Types.ObjectId().toString(), variantIndex: 0, quantity: 1 });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Không tìm thấy sản phẩm trong đơn hàng.');
    expect((await Order.findById(order._id)).cartItems).toHaveLength(0);
  });

  it('rejects insufficient stock without changing either document', async () => {
    const product = await createProduct({ quantityForSale: 2 });
    const order = await createOrder();
    const response = await staffAgent
      .post('/orders/' + order._id + '/items')
      .send(line(product, 3));

    expect(response.status).toBe(400);
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(2);
    expect((await Order.findById(order._id)).cartItems).toHaveLength(0);
  });

  it('appends duplicate lines and returns the enriched current-price response', async () => {
    const product = await createProduct({ name: 'Enriched Add Product', price: '125.500' });
    const order = await createOrder({ cartItems: [line(product)], total: 125500 });

    const response = await staffAgent
      .post('/orders/' + order._id + '/items')
      .send(line(product, 2));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.order.total).toBe(376500);
    expect(response.body.order.cartItems).toEqual([
      {
        productId: product._id.toString(),
        variantIndex: 0,
        quantity: 1,
        name: 'Enriched Add Product',
        code: product.code,
        brand: 'Add Test Brand',
        imgUrl: '',
        price: '125.500',
      },
      {
        productId: product._id.toString(),
        variantIndex: 0,
        quantity: 2,
        name: 'Enriched Add Product',
        code: product.code,
        brand: 'Add Test Brand',
        imgUrl: '',
        price: '125.500',
      },
    ]);
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
  });

  it('rolls inventory back when saving the order fails', async () => {
    const product = await createProduct({ quantityForSale: 5 });
    const order = await createOrder();
    const saveError = new Error('forced add save failure');
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(saveError);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await staffAgent
      .post('/orders/' + order._id + '/items')
      .send(line(product, 2));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: 'Lỗi khi thêm sản phẩm vào đơn hàng',
    });
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(5);
    expect((await Order.findById(order._id)).cartItems).toHaveLength(0);
  });
});
