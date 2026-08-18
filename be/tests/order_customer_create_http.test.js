const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../mailer', () => ({
  sendNewOrderNotification: jest.fn().mockResolvedValue(undefined),
  sendResetOtpEmail: jest.fn().mockResolvedValue(undefined),
}));

const app = require('../index');
const { Order } = require('../models/order');
const { Product } = require('../models/product');
const { User } = require('../models/user');
const { sendNewOrderNotification } = require('../mailer');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const CUSTOMER_PHONE = '0984800001';
const PRODUCT_CODE_PREFIX = 'ORDER-CUSTOMER-CREATE-PRODUCT-';
const PASSWORD = 'password123';

let fixtureSequence = 0;

const nextSuffix = () => String(Date.now()) + '-' + String(++fixtureSequence);

const cleanupFixtures = async () => {
  await Promise.all([
    Order.deleteMany({ userPhone: CUSTOMER_PHONE }),
    Product.deleteMany({ code: new RegExp('^' + PRODUCT_CODE_PREFIX) }),
    User.deleteMany({ phone: CUSTOMER_PHONE }),
  ]);
};

const createProduct = async ({
  name = 'Customer Create Product',
  price = '125.500',
  quantityForSale = 10,
  importPrice,
  earn,
} = {}) => {
  return Product.create({
    type: 'PLC',
    name,
    code: PRODUCT_CODE_PREFIX + nextSuffix(),
    brand: 'Customer Create Brand',
    section: 'Automation',
    value: 'PLC',
    warranty: '12 months',
    display: true,
    variant: [{
      price,
      importPrice,
      earn,
      color: 'Gray',
      quantityForSale,
      quantityInStorage: 20,
    }],
  });
};

const createCustomerAgent = async ({ cart = [] } = {}) => {
  const user = await User.create({
    phone: CUSTOMER_PHONE,
    password: PASSWORD,
    name: 'Customer Create User',
    role: 'customer',
    cart,
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/users/login')
    .send({ phone: CUSTOMER_PHONE, password: PASSWORD });
  expect(login.status).toBe(200);
  return { agent, user };
};

const orderPayload = (product, quantity = 1) => ({
  cartItems: [{
    productId: product._id.toString(),
    variantIndex: 0,
    quantity,
  }],
  total: 1,
});

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupFixtures();
});

afterEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  await cleanupFixtures();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await cleanupFixtures();
  await mongoose.disconnect();
});

describe('POST /orders/create-order HTTP characterization', () => {
  it('keeps the legacy 404 when the controller user lookup misses', async () => {
    const product = await createProduct();
    const { agent } = await createCustomerAgent();
    const originalFindById = User.findById.bind(User);
    jest.spyOn(User, 'findById')
      .mockImplementationOnce((...args) => originalFindById(...args))
      .mockResolvedValueOnce(null);

    const response = await agent
      .post('/orders/create-order')
      .send(orderPayload(product));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Không tìm thấy người dùng.' });
  });

  it('keeps contact-only rejection outside the reservation path', async () => {
    const product = await createProduct({
      price: '5480000',
      importPrice: '5480000',
      earn: 0,
      quantityForSale: 18,
    });
    const { agent } = await createCustomerAgent();

    const response = await agent
      .post('/orders/create-order')
      .send(orderPayload(product));

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('chỉ nhận liên hệ');
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(18);
    expect(await Order.countDocuments({ userPhone: CUSTOMER_PHONE })).toBe(0);
  });

  it('rolls reserved stock back when saving the Order fails', async () => {
    const product = await createProduct({ quantityForSale: 8 });
    const { agent } = await createCustomerAgent();
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(new Error('forced customer save failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await agent
      .post('/orders/create-order')
      .send(orderPayload(product, 2));

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Lỗi khi tạo đơn hàng');
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
    expect(await Order.countDocuments({ userPhone: CUSTOMER_PHONE })).toBe(0);
  });

  it('keeps a successful response when the email notification rejects', async () => {
    const product = await createProduct();
    const { agent } = await createCustomerAgent();
    sendNewOrderNotification.mockRejectedValueOnce(new Error('forced email failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await agent
      .post('/orders/create-order')
      .send(orderPayload(product));

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Đặt hàng thành công');
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(9);
    expect(await Order.countDocuments({ userPhone: CUSTOMER_PHONE })).toBe(1);
  });
});
