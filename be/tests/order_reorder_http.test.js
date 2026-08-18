const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const PRODUCT_CODE_PREFIX = 'REORDER-HTTP-PRODUCT-';
const ORDER_CODE_PREFIX = 'REORDER-HTTP-ORDER-';
const PASSWORD = 'password123';
const USER_FIXTURES = {
  editor: {
    phone: '0984200001',
    name: 'Reorder HTTP Editor',
    permissions: ['order.edit'],
  },
  missingPermission: {
    phone: '0984200002',
    name: 'Reorder HTTP Missing Permission',
    permissions: [],
  },
  wrongPermission: {
    phone: '0984200003',
    name: 'Reorder HTTP Wrong Permission',
    permissions: ['order.create'],
  },
};
const USER_PHONES = Object.values(USER_FIXTURES).map((fixture) => fixture.phone);
const REORDER_ONLY_MESSAGE =
  'API sắp xếp chỉ được thay đổi thứ tự, không được đổi sản phẩm hoặc số lượng.';
const LOCKED_MESSAGE = 'Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.';
const VERSION_CONFLICT_MESSAGE =
  'Đơn hàng vừa được thay đổi bởi thao tác khác, vui lòng tải lại.';

let editorAgent;
let missingPermissionAgent;
let wrongPermissionAgent;
let fixtureSequence = 0;
const originalAddress = process.env.ADDRESS;

const nextFixtureSuffix = () => `${Date.now()}-${++fixtureSequence}`;

const cleanupTestData = async ({ includeUsers = false } = {}) => {
  await Promise.all([
    Order.deleteMany({ orderCode: new RegExp(`^${ORDER_CODE_PREFIX}`) }),
    Product.deleteMany({ code: new RegExp(`^${PRODUCT_CODE_PREFIX}`) }),
    ...(includeUsers ? [User.deleteMany({ phone: { $in: USER_PHONES } })] : []),
  ]);
};

const restoreAddress = () => {
  if (originalAddress === undefined) {
    delete process.env.ADDRESS;
  } else {
    process.env.ADDRESS = originalAddress;
  }
};

const createStaffAgent = async ({ phone, name, permissions }) => {
  await User.create({
    phone,
    password: PASSWORD,
    name,
    role: 'staff',
    functions: ['order_management'],
    permissions,
  });

  const agent = request.agent(app);
  const loginResponse = await agent
    .post('/users/admin/login')
    .send({ phone, password: PASSWORD });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.headers['set-cookie']).toBeDefined();
  return agent;
};

const createProduct = async ({
  name = 'Reorder HTTP Product',
  brand = 'Test Brand',
  price = '100.000',
  imgUrl = '',
} = {}) => {
  const suffix = nextFixtureSuffix();
  return Product.create({
    type: 'PLC',
    name,
    code: `${PRODUCT_CODE_PREFIX}${suffix}`,
    brand,
    section: 'Automation',
    value: 'PLC',
    warranty: '12 months',
    variant: [{
      price,
      imgUrl,
      color: 'Gray',
      quantityForSale: 20,
      quantityInStorage: 20,
    }],
  });
};

const toLine = (product, quantity = 1, variantIndex = 0) => ({
  productId: product._id.toString(),
  variantIndex,
  quantity,
});

const createOrder = async ({
  cartItems = [],
  total = 0,
  status = 'Processing',
  state = 'Processing',
} = {}) => {
  return Order.create({
    orderCode: `${ORDER_CODE_PREFIX}${nextFixtureSuffix()}`,
    userPhone: '0984299999',
    userName: 'Reorder HTTP Customer',
    cartItems,
    total,
    status,
    state,
  });
};

const readStoredLines = async (orderId) => {
  const order = await Order.findById(orderId).lean();
  return order.cartItems.map(({ productId, variantIndex, quantity }) => ({
    productId,
    variantIndex,
    quantity,
  }));
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupTestData({ includeUsers: true });
  editorAgent = await createStaffAgent(USER_FIXTURES.editor);
  missingPermissionAgent = await createStaffAgent(USER_FIXTURES.missingPermission);
  wrongPermissionAgent = await createStaffAgent(USER_FIXTURES.wrongPermission);
});

afterEach(async () => {
  jest.restoreAllMocks();
  restoreAddress();
  await cleanupTestData();
});

afterAll(async () => {
  jest.restoreAllMocks();
  restoreAddress();
  await cleanupTestData({ includeUsers: true });
  await mongoose.disconnect();
});

describe('PUT /orders/:id/reorder HTTP characterization', () => {
  it('rejects staff missing order.edit with the exact permission response', async () => {
    const response = await missingPermissionAgent
      .put(`/orders/${new mongoose.Types.ObjectId()}/reorder`)
      .send({ cartItems: [] });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      message: 'Access denied, missing permission: order.edit',
    });
  });

  it('rejects staff holding the wrong permission instead of order.edit', async () => {
    const response = await wrongPermissionAgent
      .put(`/orders/${new mongoose.Types.ObjectId()}/reorder`)
      .send({ cartItems: [] });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      message: 'Access denied, missing permission: order.edit',
    });
  });

  it('returns exact 404 for a missing valid order id before validating the body', async () => {
    const response = await editorAgent
      .put(`/orders/${new mongoose.Types.ObjectId()}/reorder`)
      .send({ cartItems: 'not-an-array' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: 'Không tìm thấy đơn hàng',
    });
  });

  it('characterizes a malformed order id as the exact generic 500 response', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent
      .put('/orders/not-an-object-id/reorder')
      .send({ cartItems: [] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: 'Lỗi khi lưu thứ tự sản phẩm',
    });
  });

  it('returns the exact 400 when cartItems is not an array', async () => {
    const order = await createOrder();

    const response = await editorAgent
      .put(`/orders/${order._id}/reorder`)
      .send({ cartItems: { productId: 'unexpected-object' } });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: 'Danh sách sản phẩm không hợp lệ',
    });
  });

  it.each([
    ['invalid product id', { productId: 'invalid', variantIndex: 0, quantity: 1 }, 'Sản phẩm không hợp lệ'],
    ['invalid variant index', { productId: new mongoose.Types.ObjectId().toString(), variantIndex: -1, quantity: 1 }, 'Phiên bản sản phẩm không hợp lệ'],
    ['invalid quantity', { productId: new mongoose.Types.ObjectId().toString(), variantIndex: 0, quantity: 0 }, 'Số lượng không hợp lệ'],
  ])('returns the exact item validation response for %s', async (_label, item, message) => {
    const order = await createOrder();

    const response = await editorAgent
      .put(`/orders/${order._id}/reorder`)
      .send({ cartItems: [item] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message });
  });

  it.each([
    ['Completed', { status: 'Completed', state: 'Processing' }],
    ['Cancelled', { status: 'Processing', state: 'Cancelled' }],
  ])('locks %s orders before applying a valid reorder', async (_label, orderState) => {
    const product = await createProduct();
    const originalLines = [toLine(product)];
    const order = await createOrder({
      cartItems: originalLines,
      total: 100000,
      ...orderState,
    });

    const response = await editorAgent
      .put(`/orders/${order._id}/reorder`)
      .send({ cartItems: originalLines });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: LOCKED_MESSAGE });
    expect(await readStoredLines(order._id)).toEqual(originalLines);
  });

  it.each(['add', 'remove', 'change quantity'])(
    'rejects tampering that tries to %s with the exact 400 response',
    async (tamperKind) => {
      const firstProduct = await createProduct({ price: '100.000' });
      const secondProduct = await createProduct({ price: '200.000' });
      const originalLines = [toLine(firstProduct, 1), toLine(secondProduct, 2)];
      const order = await createOrder({ cartItems: originalLines, total: 500000 });
      const tamperedLines = {
        add: [...originalLines, toLine(firstProduct, 1)],
        remove: [originalLines[0]],
        'change quantity': [toLine(firstProduct, 2), originalLines[1]],
      }[tamperKind];

      const response = await editorAgent
        .put(`/orders/${order._id}/reorder`)
        .send({ cartItems: tamperedLines });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        message: REORDER_ONLY_MESSAGE,
      });
      expect(await readStoredLines(order._id)).toEqual(originalLines);
    }
  );

  it('accepts reordered duplicate identical lines when exact multiset counts remain equal', async () => {
    const duplicateProduct = await createProduct({ price: '75.000' });
    const otherProduct = await createProduct({ price: '40.000' });
    const duplicateLine = toLine(duplicateProduct, 1);
    const otherLine = toLine(otherProduct, 2);
    const order = await createOrder({
      cartItems: [duplicateLine, duplicateLine, otherLine],
      total: 230000,
    });
    const reorderedLines = [duplicateLine, otherLine, duplicateLine];

    const response = await editorAgent
      .put(`/orders/${order._id}/reorder`)
      .send({ cartItems: reorderedLines });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.order.cartItems.map(({ productId, variantIndex, quantity }) => ({
      productId,
      variantIndex,
      quantity,
    }))).toEqual(reorderedLines);
    expect(await readStoredLines(order._id)).toEqual(reorderedLines);
  });

  it('accepts an empty reorder for an empty order and recomputes total to zero', async () => {
    const order = await createOrder({ cartItems: [], total: 12345 });

    const response = await editorAgent
      .put(`/orders/${order._id}/reorder`)
      .send({ cartItems: [] });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.order.cartItems).toEqual([]);
    expect(response.body.order.total).toBe(0);
    expect((await Order.findById(order._id).lean()).total).toBe(0);
  });

  it('reprices from current Product data and returns enriched items in requested order', async () => {
    process.env.ADDRESS = 'https://reorder-http.example/base/';
    const firstProduct = await createProduct({
      name: 'First Repriced Product',
      brand: 'First Brand',
      price: '100.000',
      imgUrl: '/images/reorder-first.webp',
    });
    const secondProduct = await createProduct({
      name: 'Second Repriced Product',
      brand: 'Second Brand',
      price: '200.000',
      imgUrl: '/images/reorder-second.webp',
    });
    const order = await createOrder({
      cartItems: [toLine(firstProduct, 1), toLine(secondProduct, 2)],
      total: 500000,
    });
    await Product.updateOne(
      { _id: firstProduct._id },
      { $set: { 'variant.0.price': '125.500' } }
    );
    await Product.updateOne(
      { _id: secondProduct._id },
      { $set: { 'variant.0.price': '210.000' } }
    );

    const response = await editorAgent
      .put(`/orders/${order._id}/reorder`)
      .send({
        cartItems: [toLine(secondProduct, 2), toLine(firstProduct, 1)],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.order.total).toBe(545500);
    expect(response.body.order.cartItems).toEqual([
      {
        productId: secondProduct._id.toString(),
        variantIndex: 0,
        quantity: 2,
        name: 'Second Repriced Product',
        code: secondProduct.code,
        brand: 'Second Brand',
        imgUrl: 'https://reorder-http.example/base/images/reorder-second.webp',
        price: '210.000',
      },
      {
        productId: firstProduct._id.toString(),
        variantIndex: 0,
        quantity: 1,
        name: 'First Repriced Product',
        code: firstProduct.code,
        brand: 'First Brand',
        imgUrl: 'https://reorder-http.example/base/images/reorder-first.webp',
        price: '125.500',
      },
    ]);

    const storedOrder = await Order.findById(order._id).lean();
    expect(storedOrder.total).toBe(545500);
    expect(storedOrder.cartItems.map((item) => item.productId)).toEqual([
      secondProduct._id.toString(),
      firstProduct._id.toString(),
    ]);
  });

  it('strips supplied subdocument _id and extra fields before save and response enrichment', async () => {
    const product = await createProduct({
      name: 'Sanitized Reorder Product',
      brand: 'Sanitized Brand',
      price: '99.000',
    });
    const order = await createOrder({ cartItems: [toLine(product)], total: 99000 });
    const suppliedSubdocumentId = new mongoose.Types.ObjectId().toString();

    const response = await editorAgent
      .put(`/orders/${order._id}/reorder`)
      .send({
        cartItems: [{
          _id: suppliedSubdocumentId,
          productId: product._id.toString(),
          variantIndex: '0',
          quantity: '1',
          name: 'Forged Name',
          price: '1',
          unexpected: { nested: true },
        }],
      });

    expect(response.status).toBe(200);
    expect(response.body.order.cartItems).toEqual([{
      productId: product._id.toString(),
      variantIndex: 0,
      quantity: 1,
      name: 'Sanitized Reorder Product',
      code: product.code,
      brand: 'Sanitized Brand',
      imgUrl: '',
      price: '99.000',
    }]);
    expect(response.body.order.cartItems[0]).not.toHaveProperty('_id');
    expect(response.body.order.cartItems[0]).not.toHaveProperty('unexpected');

    const storedOrder = await Order.findById(order._id).lean();
    expect(storedOrder.cartItems[0]).toMatchObject(toLine(product));
    expect(storedOrder.cartItems[0]).not.toHaveProperty('name');
    expect(storedOrder.cartItems[0]).not.toHaveProperty('price');
    expect(storedOrder.cartItems[0]).not.toHaveProperty('unexpected');
    expect(storedOrder.cartItems[0]._id.toString()).not.toBe(suppliedSubdocumentId);
  });

  it('maps a stable mocked optimistic version conflict to the exact 409 response', async () => {
    const product = await createProduct({ price: '100.000' });
    const order = await createOrder({ cartItems: [toLine(product)], total: 123 });
    const versionError = Object.assign(
      new Error('forced optimistic concurrency conflict'),
      { name: 'VersionError' }
    );
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(versionError);

    const response = await editorAgent
      .put(`/orders/${order._id}/reorder`)
      .send({ cartItems: [toLine(product)] });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      message: VERSION_CONFLICT_MESSAGE,
    });
    expect((await Order.findById(order._id).lean()).total).toBe(123);
  });
});
