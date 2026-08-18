const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order, Counter } = require('../models/order');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const PRODUCT_CODE_PREFIX = 'ORDER-ADMIN-CREATE-PRODUCT-';
const ORDER_CODE_PREFIX = 'ORDER-ADMIN-CREATE-ORDER-';
const EDITOR_PHONE = '0984700001';
const VIEWER_PHONE = '0984700002';
const USER_PHONES = [EDITOR_PHONE, VIEWER_PHONE];
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
    name: 'Order Admin Create Staff ' + phone,
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

const createProduct = async ({ name = 'Admin Create Product', price = '100.000', quantityForSale = 10 } = {}) => {
  return Product.create({
    type: 'PLC',
    name,
    code: PRODUCT_CODE_PREFIX + nextSuffix(),
    brand: 'Admin Create Brand',
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

const orderPayload = (product, quantity = 1) => ({
  userPhone: '0984711111',
  userName: 'Manual Admin Customer',
  items: [{
    productId: product._id.toString(),
    variantIndex: 0,
    quantity,
  }],
});

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupFixtures(true);
  editorAgent = await createStaffAgent(EDITOR_PHONE, ['order.create']);
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

describe('POST /orders/admin-create-order HTTP characterization', () => {
  it('requires order.create permission', async () => {
    const response = await viewerAgent
      .post('/orders/admin-create-order')
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: order.create');
  });

  it('validates phone and items before touching stock', async () => {
    const product = await createProduct();
    const missingPhone = await editorAgent
      .post('/orders/admin-create-order')
      .send({ items: [{ productId: product._id.toString(), variantIndex: 0, quantity: 1 }] });
    expect(missingPhone.status).toBe(400);

    const emptyItems = await editorAgent
      .post('/orders/admin-create-order')
      .send({ userPhone: '0984711111', items: [] });
    expect(emptyItems.status).toBe(400);

    const invalidQuantity = await editorAgent
      .post('/orders/admin-create-order')
      .send({ userPhone: '0984711111', items: [{ productId: product._id.toString(), variantIndex: 0, quantity: 0 }] });
    expect(invalidQuantity.status).toBe(400);
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(10);
  });

  it('creates an admin order using DB price, reserves stock and keeps defaults', async () => {
    const product = await createProduct({ price: '125.500' });
    const response = await editorAgent
      .post('/orders/admin-create-order')
      .send(orderPayload(product, 2));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Tạo đơn hàng thành công',
    });
    expect(response.body.order.orderCode).toMatch(/^NOVA-\d+$/);
    expect(response.body.order.userPhone).toBe('0984711111');
    expect(response.body.order.total).toBe(251000);
    expect(response.body.order.status).toBe('Processing');
    expect(response.body.order.state).toBe('Processing');
    expect(response.body.order.cartItems[0]).toMatchObject({
      productId: product._id.toString(),
      variantIndex: 0,
      quantity: 2,
    });
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
  });

  it('reserves duplicate lines cumulatively', async () => {
    const product = await createProduct({ quantityForSale: 3, price: '100.000' });
    const response = await editorAgent
      .post('/orders/admin-create-order')
      .send({
        userPhone: '0984711111',
        items: [
          { productId: product._id.toString(), variantIndex: 0, quantity: 1 },
          { productId: product._id.toString(), variantIndex: 0, quantity: 2 },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.order.cartItems).toHaveLength(2);
    expect(response.body.order.total).toBe(300000);
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(0);
  });

  it('rejects insufficient stock without creating an Order', async () => {
    const product = await createProduct({ quantityForSale: 1 });
    const response = await editorAgent
      .post('/orders/admin-create-order')
      .send(orderPayload(product, 2));

    expect(response.status).toBe(400);
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(1);
    expect(await Order.countDocuments({ orderCode: new RegExp('^' + ORDER_CODE_PREFIX) })).toBe(0);
  });

  it.each([
    ['Counter', 'Counter.findOneAndUpdate'],
    ['Order save', 'Order.prototype.save'],
  ])('rolls stock back when %s fails', async (_caseName, target) => {
    const product = await createProduct({ quantityForSale: 8 });
    if (target === 'Counter.findOneAndUpdate') {
      jest.spyOn(Counter, 'findOneAndUpdate').mockRejectedValueOnce(new Error('forced Counter failure'));
    } else {
      jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(new Error('forced admin save failure'));
    }
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent
      .post('/orders/admin-create-order')
      .send(orderPayload(product, 2));

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Lỗi khi tạo đơn hàng');
    expect((await Product.findById(product._id)).variant[0].quantityForSale).toBe(8);
    expect(await Order.countDocuments({ orderCode: new RegExp('^' + ORDER_CODE_PREFIX) })).toBe(0);
  });
});
