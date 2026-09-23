const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Product } = require('../components/product');
const { User } = require('../components/user');
const { Order } = require('../components/order');
const { ADMIN_TEST_PERMISSIONS } = require('./fixtures/adminPermissions');

let Counter;

beforeAll(async () => {
  const url = 'mongodb://localhost:27017/EcomTest';
  await mongoose.connect(url);
  Counter = mongoose.model('Counter');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await Product.deleteMany({});
  await User.deleteMany({});
  await Order.deleteMany({});
  await Counter.deleteMany({});
});

const createAdminAgent = async () => {
  await new User({
    phone: '0912345678',
    password: 'password123',
    name: 'Admin Test',
    role: 'admin',
    permissions: [...ADMIN_TEST_PERMISSIONS],
  }).save();

  const agent = request.agent(app);
  const response = await agent
    .post('/users/admin/login')
    .send({ phone: '0912345678', password: 'password123' });

  expect(response.status).toBe(200);
  expect(response.headers['set-cookie']).toBeDefined();
  expect(response.headers['set-cookie'].join(';')).toContain('authToken=');
  return agent;
};

const createStaffAgent = async ({ phone = '0912345688', permissions = [] } = {}) => {
  await new User({
    phone,
    password: 'password123',
    name: 'Staff Test',
    role: 'staff',
    functions: ['order_management'],
    permissions,
  }).save();

  const agent = request.agent(app);
  const response = await agent
    .post('/users/admin/login')
    .send({ phone, password: 'password123' });

  expect(response.status).toBe(200);
  expect(response.headers['set-cookie']).toBeDefined();
  expect(response.headers['set-cookie'].join(';')).toContain('authToken=');
  return agent;
};

const createProduct = async ({ quantityForSale = 10, price = '100.000' } = {}) => {
  return Product.create({
    type: 'PLC',
    name: 'Sales Detail Product',
    code: `SDP-${Date.now()}-${Math.random()}`,
    brand: 'Test Brand',
    section: 'Thiết bị tự động hóa',
    value: 'PLC',
    warranty: '12 tháng',
    variant: [{
      price,
      color: 'Xám',
      quantityForSale,
      quantityInStorage: 20,
    }],
  });
};

const createDraftOrder = async (agent) => {
  const response = await agent.post('/orders/admin-draft').send({});
  expect(response.status).toBe(201);
  return response.body.order;
};

describe('Sales order detail admin API', () => {
  it('POST /orders/admin-draft tao don rong voi orderCode va total 0', async () => {
    const agent = await createAdminAgent();

    const response = await agent.post('/orders/admin-draft').send({});

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.order.orderCode).toMatch(/^NOVA-\d+$/);
    expect(response.body.order.cartItems).toHaveLength(0);
    expect(response.body.order.total).toBe(0);
  });

  it('POST /orders/:id/items tru quantityForSale va tinh total theo gia variant', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityForSale: 10, price: '100.000' });
    const order = await createDraftOrder(agent);

    const response = await agent
      .post(`/orders/${order._id}/items`)
      .send({ productId: product._id.toString(), variantIndex: 0, quantity: 2 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.order.cartItems).toHaveLength(1);
    expect(response.body.order.total).toBe(200000);

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.variant[0].quantityForSale).toBe(8);
  });

  it('POST /orders/:id/items cho staff co order.edit sua chi tiet don', async () => {
    const adminAgent = await createAdminAgent();
    const staffAgent = await createStaffAgent({ permissions: ['order.edit'] });
    const product = await createProduct({ quantityForSale: 10, price: '100.000' });
    const order = await createDraftOrder(adminAgent);

    const response = await staffAgent
      .post(`/orders/${order._id}/items`)
      .send({ productId: product._id.toString(), variantIndex: 0, quantity: 2 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.order.cartItems).toHaveLength(1);
  });

  it('POST /orders/:id/items cho staff chi co order.create soan tiep don nhap cua chinh minh', async () => {
    const staffAgent = await createStaffAgent({ permissions: ['order.create'] });
    const product = await createProduct({ quantityForSale: 10, price: '100.000' });
    const order = await createDraftOrder(staffAgent);

    const response = await staffAgent
      .post(`/orders/${order._id}/items`)
      .send({ productId: product._id.toString(), variantIndex: 0, quantity: 1 });

    expect(response.status).toBe(200);
    expect(response.body.order.cartItems).toHaveLength(1);
  });

  it('POST /orders/:id/items chan staff chi co order.create sua don nhap cua nguoi khac', async () => {
    const adminAgent = await createAdminAgent();
    const staffAgent = await createStaffAgent({ permissions: ['order.create'] });
    const product = await createProduct({ quantityForSale: 10, price: '100.000' });
    const order = await createDraftOrder(adminAgent);

    const response = await staffAgent
      .post(`/orders/${order._id}/items`)
      .send({ productId: product._id.toString(), variantIndex: 0, quantity: 1 });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Bạn chỉ có quyền Thêm nên chỉ được sửa đơn nháp do chính mình tạo.');
  });

  it('PUT /orders/:id/items/:index tang va giam so luong dieu chinh ton theo delta', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityForSale: 10, price: '100.000' });
    const order = await createDraftOrder(agent);

    await agent
      .post(`/orders/${order._id}/items`)
      .send({ productId: product._id.toString(), variantIndex: 0, quantity: 2 });

    const increase = await agent
      .put(`/orders/${order._id}/items/0`)
      .send({ quantity: 5 });

    expect(increase.status).toBe(200);
    expect(increase.body.order.total).toBe(500000);
    let updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.variant[0].quantityForSale).toBe(5);

    const decrease = await agent
      .put(`/orders/${order._id}/items/0`)
      .send({ quantity: 3 });

    expect(decrease.status).toBe(200);
    expect(decrease.body.order.total).toBe(300000);
    updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.variant[0].quantityForSale).toBe(7);
  });

  it('POST va PUT items voi quantity vuot ton tra 400 va khong doi DB', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityForSale: 3, price: '100.000' });
    const order = await createDraftOrder(agent);

    const tooMuchAdd = await agent
      .post(`/orders/${order._id}/items`)
      .send({ productId: product._id.toString(), variantIndex: 0, quantity: 4 });

    expect(tooMuchAdd.status).toBe(400);
    let unchangedProduct = await Product.findById(product._id);
    expect(unchangedProduct.variant[0].quantityForSale).toBe(3);

    await agent
      .post(`/orders/${order._id}/items`)
      .send({ productId: product._id.toString(), variantIndex: 0, quantity: 2 });

    const tooMuchUpdate = await agent
      .put(`/orders/${order._id}/items/0`)
      .send({ quantity: 4 });

    expect(tooMuchUpdate.status).toBe(400);
    unchangedProduct = await Product.findById(product._id);
    expect(unchangedProduct.variant[0].quantityForSale).toBe(1);
    const unchangedOrder = await Order.findById(order._id);
    expect(unchangedOrder.cartItems[0].quantity).toBe(2);
    expect(unchangedOrder.total).toBe(200000);
  });

  it('DELETE /orders/:id/items/:index hoan quantityForSale va dua total ve 0', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityForSale: 10, price: '100.000' });
    const order = await createDraftOrder(agent);

    await agent
      .post(`/orders/${order._id}/items`)
      .send({ productId: product._id.toString(), variantIndex: 0, quantity: 2 });

    const response = await agent.delete(`/orders/${order._id}/items/0`);

    expect(response.status).toBe(200);
    expect(response.body.order.cartItems).toHaveLength(0);
    expect(response.body.order.total).toBe(0);
    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.variant[0].quantityForSale).toBe(10);
  });

  it('PUT /orders/:id/customer validate phone va luu phone hop le', async () => {
    const agent = await createAdminAgent();
    const order = await createDraftOrder(agent);

    const invalidPhone = await agent
      .put(`/orders/${order._id}/customer`)
      .send({ userName: 'Customer A', userPhone: '12345' });

    expect(invalidPhone.status).toBe(400);

    const validPhone = await agent
      .put(`/orders/${order._id}/customer`)
      .send({ userName: 'Customer A', userPhone: '0911111111' });

    expect(validPhone.status).toBe(200);
    expect(validPhone.body.success).toBe(true);
    expect(validPhone.body.order.userName).toBe('Customer A');
    expect(validPhone.body.order.userPhone).toBe('0911111111');
  });

  it('PUT /orders/update-order chan hoan thanh khi don thieu so dien thoai', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityForSale: 10, price: '100.000' });
    const order = await createDraftOrder(agent);

    await agent
      .post(`/orders/${order._id}/items`)
      .send({ productId: product._id.toString(), variantIndex: 0, quantity: 2 });

    const blocked = await agent
      .put(`/orders/update-order/${order._id}`)
      .send({ field: 'status', value: 'Completed' });

    expect(blocked.status).toBe(400);
    let notCompleted = await Order.findById(order._id);
    expect(notCompleted.status).toBe('Processing');

    await agent
      .put(`/orders/${order._id}/customer`)
      .send({ userName: 'Customer A', userPhone: '0911111111' });

    const completed = await agent
      .put(`/orders/update-order/${order._id}`)
      .send({ field: 'status', value: 'Completed' });

    expect(completed.status).toBe(200);
    expect(completed.body.success).toBe(true);
    const doneOrder = await Order.findById(order._id);
    expect(doneOrder.status).toBe('Completed');
  });

  it('PUT /orders/:id/images luu danh sach anh hop le va validate input', async () => {
    const agent = await createAdminAgent();
    const order = await createDraftOrder(agent);

    const invalid = await agent
      .put(`/orders/${order._id}/images`)
      .send({ images: 'not-an-array' });

    expect(invalid.status).toBe(400);

    const valid = await agent
      .put(`/orders/${order._id}/images`)
      .send({ images: ['/invoice-images/a.webp', '/invoice-images/b.webp'] });

    expect(valid.status).toBe(200);
    expect(valid.body.success).toBe(true);
    expect(valid.body.order.images).toEqual(['/invoice-images/a.webp', '/invoice-images/b.webp']);

    const detail = await agent.get(`/orders/admin-detail/${order._id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.order.images).toEqual(['/invoice-images/a.webp', '/invoice-images/b.webp']);
  });

  it('PUT /orders/:id/images chan don Completed va Cancelled', async () => {
    const agent = await createAdminAgent();
    const completedOrder = await createDraftOrder(agent);
    await Order.findByIdAndUpdate(completedOrder._id, {
      status: 'Completed',
      userPhone: '0911111111',
    });

    const completedResponse = await agent
      .put(`/orders/${completedOrder._id}/images`)
      .send({ images: ['/invoice-images/a.webp'] });

    expect(completedResponse.status).toBe(400);

    const cancelledOrder = await createDraftOrder(agent);
    await Order.findByIdAndUpdate(cancelledOrder._id, { state: 'Cancelled' });

    const cancelledResponse = await agent
      .put(`/orders/${cancelledOrder._id}/images`)
      .send({ images: ['/invoice-images/a.webp'] });

    expect(cancelledResponse.status).toBe(400);
  });

  it('giu enriched item contract qua nam write response', async () => {
    const originalAddress = process.env.ADDRESS;
    process.env.ADDRESS = 'https://write-detail.example/base/';

    try {
      const agent = await createAdminAgent();
      const firstProduct = await createProduct({ quantityForSale: 10, price: '100.000' });
      const secondProduct = await createProduct({ quantityForSale: 10, price: '200.000' });
      const order = await createDraftOrder(agent);

      const expectedItem = (product, quantity, price) => ({
        productId: product._id.toString(),
        variantIndex: 0,
        quantity,
        name: 'Sales Detail Product',
        code: product.code,
        brand: 'Test Brand',
        imgUrl: '',
        price,
      });

      const addedFirst = await agent
        .post('/orders/' + order._id + '/items')
        .send({ productId: firstProduct._id.toString(), variantIndex: 0, quantity: 1 });
      expect(addedFirst.status).toBe(200);
      expect(addedFirst.body.order.cartItems).toEqual([
        expectedItem(firstProduct, 1, '100.000'),
      ]);

      const addedSecond = await agent
        .post('/orders/' + order._id + '/items')
        .send({ productId: secondProduct._id.toString(), variantIndex: 0, quantity: 1 });
      expect(addedSecond.status).toBe(200);
      expect(addedSecond.body.order.cartItems).toEqual([
        expectedItem(firstProduct, 1, '100.000'),
        expectedItem(secondProduct, 1, '200.000'),
      ]);

      const updated = await agent
        .put('/orders/' + order._id + '/items/0')
        .send({ quantity: 2 });
      expect(updated.status).toBe(200);
      expect(updated.body.order.cartItems[0]).toEqual(
        expectedItem(firstProduct, 2, '100.000')
      );

      const reordered = await agent
        .put('/orders/' + order._id + '/reorder')
        .send({
          cartItems: [
            { productId: secondProduct._id.toString(), variantIndex: 0, quantity: 1 },
            { productId: firstProduct._id.toString(), variantIndex: 0, quantity: 2 },
          ],
        });
      expect(reordered.status).toBe(200);
      expect(reordered.body.order.cartItems).toEqual([
        expectedItem(secondProduct, 1, '200.000'),
        expectedItem(firstProduct, 2, '100.000'),
      ]);

      const images = await agent
        .put('/orders/' + order._id + '/images')
        .send({ images: ['/invoice-images/write-detail.webp'] });
      expect(images.status).toBe(200);
      expect(images.body.order.images).toEqual(['/invoice-images/write-detail.webp']);
      expect(images.body.order.cartItems.map((item) => item.productId)).toEqual([
        secondProduct._id.toString(),
        firstProduct._id.toString(),
      ]);

      const deleted = await agent.delete('/orders/' + order._id + '/items/0');
      expect(deleted.status).toBe(200);
      expect(deleted.body.order.cartItems).toEqual([
        expectedItem(firstProduct, 2, '100.000'),
      ]);
    } finally {
      if (originalAddress === undefined) {
        delete process.env.ADDRESS;
      } else {
        process.env.ADDRESS = originalAddress;
      }
    }
  });

  it('POST /orders/upload-image thieu file tra 400', async () => {
    const agent = await createAdminAgent();

    const response = await agent.post('/orders/upload-image');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(0);
  });

  it('DELETE /orders/delete-image validate imageUrl va idempotent voi file khong ton tai', async () => {
    const agent = await createAdminAgent();

    const missing = await agent.delete('/orders/delete-image');

    expect(missing.status).toBe(400);

    const nonExisting = await agent
      .delete('/orders/delete-image')
      .query({ imageUrl: '/invoice-images/file-khong-ton-tai.webp' });

    expect(nonExisting.status).toBe(200);
    expect(nonExisting.body.success).toBe(1);

    const traversal = await agent
      .delete('/orders/delete-image')
      .query({ imageUrl: '../../outside.webp' });

    expect(traversal.status).toBe(200);
    expect(traversal.body.success).toBe(1);
  });
});
