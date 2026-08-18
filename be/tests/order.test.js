const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../index');
const { Product } = require('../components/product');
const { User } = require('../components/user');
const { StorageHistory } = require('../components/storagehistory');
const Order = mongoose.model('Order');

beforeAll(async () => {
  const url = 'mongodb://localhost:27017/EcomTest';
  await mongoose.connect(url);
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await Product.deleteMany({});
  await User.deleteMany({});
  await Order.deleteMany({});
  await StorageHistory.deleteMany({});
});

const createUser = async ({ phone, role = 'customer', functions = [], permissions = [] }) => {
  const user = new User({
    phone,
    password: 'password123',
    name: `Test ${phone}`,
    role,
    functions,
    permissions,
  });
  await user.save();
  return user;
};

const loginAgent = async ({ phone, role = 'customer' }) => {
  const agent = request.agent(app);
  const endpoint = role === 'customer' ? '/users/login' : '/users/admin/login';
  const response = await agent
    .post(endpoint)
    .send({ phone, password: 'password123' });

  expect(response.status).toBe(200);
  expect(response.headers['set-cookie']).toBeDefined();
  return agent;
};

const createProduct = async () => {
  return Product.create({
    type: 'PLC',
    name: 'Test Product',
    brand: 'Test Brand',
    section: 'Thiết bị tự động hóa',
    value: 'PLC',
    warranty: '12 tháng',
    variant: [{
      price: '100000',
      color: 'Xám',
      quantityForSale: 10,
      quantityInStorage: 10
    }]
  });
};

const createOrder = async ({ userPhone, product, orderCode, quantity = 1 }) => {
  return Order.create({
    orderCode,
    userPhone,
    userName: `Customer ${userPhone}`,
    cartItems: [{
      productId: product._id.toString(),
      variantIndex: 0,
      quantity
    }],
    total: 100000 * quantity
  });
};

describe('Orders API Tests (Phase 5)', () => {
  it('Test Case 9: POST /orders/create-order lưu đơn hàng và giảm số lượng tồn kho mở bán tương ứng', async () => {
    // 1. Tạo và lưu sản phẩm mẫu có tồn kho mở bán = 10
    const product = new Product({
      type: 'PLC',
      name: 'Siemens S7-1200 CPU',
      brand: 'Siemens',
      section: 'Thiết bị tự động hóa',
      value: 'PLC',
      warranty: '12 tháng',
      variant: [{
        price: '4500000',
        color: 'Xám',
        quantityForSale: 10,
        quantityInStorage: 10
      }]
    });
    const savedProduct = await product.save();

    // 2. Tạo và lưu người dùng mua hàng
    const customerUser = new User({
      phone: '0987654326',
      password: 'password123',
      name: 'Test Customer',
      role: 'customer'
    });
    await customerUser.save();

    const customerToken = jwt.sign(
      { userId: customerUser._id, phone: customerUser.phone, name: customerUser.name, role: customerUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    // 3. Gửi request đặt hàng (mua 2 sản phẩm)
    const response = await request(app)
      .post('/orders/create-order')
      .set('Cookie', [`authToken=${customerToken}`])
      .send({
        cartItems: [{
          productId: savedProduct._id.toString(),
          variantIndex: 0,
          quantity: 2
        }],
        total: 9000000
      });

    // Khẳng định đặt hàng thành công
    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Đặt hàng thành công');

    // 4. Kiểm tra: Số lượng tồn kho mở bán (quantityForSale) giảm từ 10 xuống còn 8
    const updatedProduct = await Product.findById(savedProduct._id);
    expect(updatedProduct.variant[0].quantityForSale).toBe(8);

    // Đảm bảo đơn hàng được lưu chính xác trong database
    const savedOrder = await Order.findOne({ userPhone: '0987654326' });
    expect(savedOrder).toBeDefined();
    expect(savedOrder.total).toBe(9000000);
    expect(savedOrder.cartItems[0].productId).toBe(savedProduct._id.toString());
  });

  it('không tạo đơn hoặc trừ kho với sản phẩm đang ẩn', async () => {
    const hiddenProduct = await Product.create({
      type: 'PLC',
      name: 'Hidden Order Product',
      brand: 'Test Brand',
      section: 'Thiết bị tự động hóa',
      value: 'PLC',
      warranty: '12 tháng',
      display: false,
      variant: [{
        price: '100000',
        color: 'Xám',
        quantityForSale: 10,
        quantityInStorage: 10,
      }],
    });
    await createUser({ phone: '0987654332' });
    const agent = await loginAgent({ phone: '0987654332' });

    const response = await agent
      .post('/orders/create-order')
      .send({
        cartItems: [{
          productId: hiddenProduct._id.toString(),
          variantIndex: 0,
          quantity: 2,
        }],
      });

    expect(response.status).toBe(403);
    const unchangedProduct = await Product.findById(hiddenProduct._id);
    expect(unchangedProduct.variant[0].quantityForSale).toBe(10);
    expect(await Order.countDocuments({ userPhone: '0987654332' })).toBe(0);
  });

  it('không tạo đơn hoặc trừ kho với sản phẩm chỉ nhận liên hệ', async () => {
    const contactProduct = await Product.create({
      type: 'PLC',
      name: 'Contact Order Product',
      brand: 'Test Brand',
      section: 'Thiết bị tự động hóa',
      value: 'PLC',
      warranty: '12 tháng',
      display: true,
      variant: [{
        price: '5480000',
        importPrice: '5480000',
        earn: 0,
        quantityForSale: 18,
        quantityInStorage: 20,
      }],
    });
    await createUser({ phone: '0987654333' });
    const agent = await loginAgent({ phone: '0987654333' });

    const response = await agent
      .post('/orders/create-order')
      .send({
        cartItems: [{
          productId: contactProduct._id.toString(),
          variantIndex: 0,
          quantity: 1,
        }],
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('chỉ nhận liên hệ');
    const unchangedProduct = await Product.findById(contactProduct._id);
    expect(unchangedProduct.variant[0].quantityForSale).toBe(18);
    expect(await Order.countDocuments({ userPhone: '0987654333' })).toBe(0);
  });

  it('Test Case 10: GET /orders yêu cầu quyền admin', async () => {
    // 1. Thử truy cập không có token
    const resUnauthenticated = await request(app)
      .get('/orders');
    expect(resUnauthenticated.status).toBe(401);

    // 2. Thử truy cập bằng tài khoản customer thường
    const customerUser = new User({
      phone: '0987654327',
      password: 'password123',
      role: 'customer'
    });
    await customerUser.save();

    const customerToken = jwt.sign(
      { userId: customerUser._id, phone: customerUser.phone, role: customerUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    const resForbidden = await request(app)
      .get('/orders')
      .set('Cookie', [`authToken=${customerToken}`]);
    expect(resForbidden.status).toBe(403);

    // 3. Truy cập bằng tài khoản admin hợp lệ
    const adminUser = new User({
      phone: '0987654328',
      password: 'password123',
      role: 'admin'
    });
    await adminUser.save();

    const adminToken = jwt.sign(
      { userId: adminUser._id, phone: adminUser.phone, role: adminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    const resSuccess = await request(app)
      .get('/orders')
      .set('Cookie', [`authToken=${adminToken}`]);

    expect(resSuccess.status).toBe(200);
    expect(resSuccess.body.orders).toBeDefined();
    expect(resSuccess.body.total).toBeDefined();
  });

  it('Test Case 10b: staff can GET /orders only with order.view', async () => {
    await createUser({
      phone: '0987654329',
      role: 'staff',
      functions: ['order_management'],
      permissions: ['order.view']
    });
    await createUser({
      phone: '0987654330',
      role: 'staff',
      functions: ['order_management'],
      permissions: []
    });

    const allowedAgent = await loginAgent({ phone: '0987654329', role: 'staff' });
    const blockedAgent = await loginAgent({ phone: '0987654330', role: 'staff' });

    const allowed = await allowedAgent.get('/orders');
    expect(allowed.status).toBe(200);

    const blocked = await blockedAgent.get('/orders');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Access denied, missing permission: order.view');
  });

  it('Test Case 11: user A không xem, hủy, xóa được đơn của user B', async () => {
    const product = await createProduct();
    await createUser({ phone: '0900000001' });
    await createUser({ phone: '0900000002' });
    const order = await createOrder({
      userPhone: '0900000002',
      product,
      orderCode: 'NOVA-IDOR-01'
    });
    const userAAgent = await loginAgent({ phone: '0900000001' });

    const getResponse = await userAAgent.get(`/orders/${order._id}`);
    expect(getResponse.status).toBe(403);

    const cancelResponse = await userAAgent
      .put(`/orders/${order._id}`)
      .send({ state: 'Cancelled' });
    expect(cancelResponse.status).toBe(403);

    const deleteResponse = await userAAgent.delete(`/orders/${order._id}`);
    expect(deleteResponse.status).toBe(403);

    const unchangedOrder = await Order.findById(order._id);
    expect(unchangedOrder).toBeDefined();
    expect(unchangedOrder.state).toBe('Processing');
  });

  it('Test Case 12: chính chủ vẫn hủy và xóa được đơn của mình', async () => {
    const product = await createProduct();
    await createUser({ phone: '0900000003' });
    const ownerAgent = await loginAgent({ phone: '0900000003' });
    const orderToCancel = await createOrder({
      userPhone: '0900000003',
      product,
      orderCode: 'NOVA-OWNER-01'
    });
    const orderToDelete = await createOrder({
      userPhone: '0900000003',
      product,
      orderCode: 'NOVA-OWNER-02'
    });

    const cancelResponse = await ownerAgent
      .put(`/orders/${orderToCancel._id}`)
      .send({ state: 'Cancelled' });
    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.order.state).toBe('Cancelled');

    const deleteResponse = await ownerAgent.delete(`/orders/${orderToDelete._id}`);
    expect(deleteResponse.status).toBe(200);

    const deletedOrder = await Order.findById(orderToDelete._id);
    expect(deletedOrder).toBeNull();
  });

  it('Test Case 13: admin vẫn xem và hủy được đơn của người khác', async () => {
    const product = await createProduct();
    await createUser({ phone: '0900000004' });
    await createUser({ phone: '0900000005', role: 'admin' });
    const order = await createOrder({
      userPhone: '0900000004',
      product,
      orderCode: 'NOVA-ADMIN-01'
    });
    const adminAgent = await loginAgent({ phone: '0900000005', role: 'admin' });

    const getResponse = await adminAgent.get(`/orders/${order._id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.userPhone).toBe('0900000004');

    const cancelResponse = await adminAgent
      .put(`/orders/${order._id}`)
      .send({ state: 'Cancelled' });
    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.order.state).toBe('Cancelled');
  });

  it('Test Case 14: ghi StorageHistory khi admin hoàn thành và hoàn tác đơn bán online', async () => {
    const product = await createProduct();
    await createUser({ phone: '0900000006' });
    await createUser({ phone: '0900000007', role: 'admin' });
    const order = await createOrder({
      userPhone: '0900000006',
      product,
      orderCode: 'NOVA-ONLINE-01',
      quantity: 2
    });
    const adminAgent = await loginAgent({ phone: '0900000007', role: 'admin' });

    const completeResponse = await adminAgent
      .put(`/orders/update-order/${order._id}`)
      .send({ field: 'status', value: 'Completed' });
    expect(completeResponse.status).toBe(200);

    const completeHistory = await StorageHistory.findOne({
      orderId: order.orderCode,
      note: 'Đơn hàng bán online'
    });
    expect(completeHistory).toBeDefined();
    expect(completeHistory.quantity).toBe(-2);

    const revertResponse = await adminAgent
      .put(`/orders/update-order/${order._id}`)
      .send({ field: 'status', value: 'Processing' });
    expect(revertResponse.status).toBe(200);

    const revertHistory = await StorageHistory.findOne({
      orderId: order.orderCode,
      note: 'Hoàn tác đơn bán online'
    });
    expect(revertHistory).toBeDefined();
    expect(revertHistory.quantity).toBe(2);
  });

  it('Test Case 16: không cho hoàn thành đơn đã bị hủy (Cancelled -> Completed bị chặn)', async () => {
    const product = await createProduct();
    await createUser({ phone: '0900000009' });
    await createUser({ phone: '0900000010', role: 'admin' });

    const cancelledOrder = await Order.create({
      orderCode: 'NOVA-CANCELLED-01',
      userPhone: '0900000009',
      userName: 'Customer 0900000009',
      cartItems: [{
        productId: product._id.toString(),
        variantIndex: 0,
        quantity: 1
      }],
      total: 100000,
      state: 'Cancelled'
    });

    const adminAgent = await loginAgent({ phone: '0900000010', role: 'admin' });

    const response = await adminAgent
      .put(`/orders/update-order/${cancelledOrder._id}`)
      .send({ field: 'status', value: 'Completed' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);

    // Đơn không được chuyển sang Completed và không bị trừ kho
    const unchanged = await Order.findById(cancelledOrder._id);
    expect(unchanged.status).not.toBe('Completed');
    const untouchedProduct = await Product.findById(product._id);
    expect(untouchedProduct.variant[0].quantityInStorage).toBe(10);
  });

  it('Test Case 15: token cũ bị từ chối khi user đã bị xóa khỏi DB', async () => {
    const product = await createProduct();
    const customer = await createUser({ phone: '0900000008' });
    const customerAgent = await loginAgent({ phone: '0900000008' });
    const order = await createOrder({
      userPhone: '0900000008',
      product,
      orderCode: 'NOVA-DELETED-USER-01'
    });

    const beforeDeleteResponse = await customerAgent.get(`/orders/${order._id}`);
    expect(beforeDeleteResponse.status).toBe(200);

    await User.findByIdAndDelete(customer._id);

    const afterDeleteResponse = await customerAgent.get(`/orders/${order._id}`);
    expect(afterDeleteResponse.status).toBe(401);
  });

  it('Test Case 17: admin tao don thu cong dung gia DB, tru quantityForSale va giu status/state mac dinh', async () => {
    const product = await createProduct();
    await createUser({ phone: '0900000011', role: 'admin' });
    const adminAgent = await loginAgent({ phone: '0900000011', role: 'admin' });

    const response = await adminAgent
      .post('/orders/admin-create-order')
      .send({
        userPhone: '0911111111',
        userName: 'Manual Customer',
        total: 1,
        items: [{
          productId: product._id.toString(),
          variantIndex: 0,
          quantity: 2
        }]
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.order.total).toBe(200000);
    expect(response.body.order.status).toBe('Processing');
    expect(response.body.order.state).toBe('Processing');

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.variant[0].quantityForSale).toBe(8);
  });

  it('Test Case 18: admin tao don bi chan khi thieu phone, rong items, quantity sai hoac vuot ton', async () => {
    const product = await createProduct();
    await createUser({ phone: '0900000012', role: 'admin' });
    const adminAgent = await loginAgent({ phone: '0900000012', role: 'admin' });

    const missingPhone = await adminAgent
      .post('/orders/admin-create-order')
      .send({
        items: [{ productId: product._id.toString(), variantIndex: 0, quantity: 1 }]
      });
    expect(missingPhone.status).toBe(400);

    const emptyItems = await adminAgent
      .post('/orders/admin-create-order')
      .send({ userPhone: '0911111112', items: [] });
    expect(emptyItems.status).toBe(400);

    const invalidQuantity = await adminAgent
      .post('/orders/admin-create-order')
      .send({
        userPhone: '0911111112',
        items: [{ productId: product._id.toString(), variantIndex: 0, quantity: 0 }]
      });
    expect(invalidQuantity.status).toBe(400);

    const tooMuch = await adminAgent
      .post('/orders/admin-create-order')
      .send({
        userPhone: '0911111112',
        items: [{ productId: product._id.toString(), variantIndex: 0, quantity: 11 }]
      });
    expect(tooMuch.status).toBe(400);

    const unchangedProduct = await Product.findById(product._id);
    expect(unchangedProduct.variant[0].quantityForSale).toBe(10);
  });

  it('Test Case 19: staff co order.create tao don duoc, customer bi chan', async () => {
    const product = await createProduct();
    await createUser({
      phone: '0900000013',
      role: 'staff',
      functions: ['order_management'],
      permissions: ['order.create']
    });
    await createUser({ phone: '0900000014' });
    const staffAgent = await loginAgent({ phone: '0900000013', role: 'staff' });
    const customerAgent = await loginAgent({ phone: '0900000014' });

    const staffResponse = await staffAgent
      .post('/orders/admin-create-order')
      .send({
        userPhone: '0911111113',
        items: [{ productId: product._id.toString(), variantIndex: 0, quantity: 1 }]
      });
    expect(staffResponse.status).toBe(201);

    const customerResponse = await customerAgent
      .post('/orders/admin-create-order')
      .send({
        userPhone: '0911111114',
        items: [{ productId: product._id.toString(), variantIndex: 0, quantity: 1 }]
      });
    expect(customerResponse.status).toBe(403);
  });

  it('Test Case 19b: staff co order.view nhung thieu order.create bi chan tao don admin', async () => {
    const product = await createProduct();
    await createUser({
      phone: '0900000018',
      role: 'staff',
      functions: ['order_management'],
      permissions: ['order.view']
    });
    const staffAgent = await loginAgent({ phone: '0900000018', role: 'staff' });

    const response = await staffAgent
      .post('/orders/admin-create-order')
      .send({
        userPhone: '0911111118',
        items: [{ productId: product._id.toString(), variantIndex: 0, quantity: 1 }]
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied, missing permission: order.create');
  });

  it('Test Case 20: admin lay goi y khach hang chi tra customer name/phone', async () => {
    await createUser({ phone: '0900000015', role: 'admin' });
    await createUser({ phone: '0900000016', role: 'customer' });
    await createUser({ phone: '0900000017', role: 'staff' });
    const adminAgent = await loginAgent({ phone: '0900000015', role: 'admin' });

    const response = await adminAgent.get('/orders/customer-suggestions');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.customers).toHaveLength(1);
    expect(response.body.customers[0].phone).toBe('0900000016');
    expect(response.body.customers[0]).not.toHaveProperty('password');
  });

  it('recomputes customer order total from DB price and ignores client total', async () => {
    const product = await createProduct();
    await createUser({ phone: '0900000021' });
    const customerAgent = await loginAgent({ phone: '0900000021' });

    const response = await customerAgent
      .post('/orders/create-order')
      .send({
        cartItems: [{ productId: product._id.toString(), variantIndex: 0, quantity: 2 }],
        total: 0
      });

    expect(response.status).toBe(201);
    const savedOrder = await Order.findOne({ userPhone: '0900000021' });
    expect(savedOrder.total).toBe(200000);
  });

  it('rejects invalid customer order quantity before changing stock', async () => {
    const product = await createProduct();
    await createUser({ phone: '0900000022' });
    const customerAgent = await loginAgent({ phone: '0900000022' });

    const response = await customerAgent
      .post('/orders/create-order')
      .send({
        cartItems: [{ productId: product._id.toString(), variantIndex: 0, quantity: -5 }],
        total: 0
      });

    expect(response.status).toBe(400);
    const unchangedProduct = await Product.findById(product._id);
    expect(unchangedProduct.variant[0].quantityForSale).toBe(10);
    expect(await Order.countDocuments({ userPhone: '0900000022' })).toBe(0);
  });

  it('rejects invalid customer order variantIndex', async () => {
    const product = await createProduct();
    await createUser({ phone: '0900000023' });
    const customerAgent = await loginAgent({ phone: '0900000023' });

    const response = await customerAgent
      .post('/orders/create-order')
      .send({
        cartItems: [{ productId: product._id.toString(), variantIndex: 99, quantity: 1 }],
        total: 100000
      });

    expect(response.status).toBe(400);
  });

  it('does not partially subtract inventory when completing order with an out-of-stock item', async () => {
    const firstProduct = await createProduct();
    const secondProduct = await Product.create({
      type: 'PLC',
      name: 'Low Stock Product',
      brand: 'Test Brand',
      section: 'Thiết bị tự động hóa',
      value: 'PLC',
      warranty: '12 tháng',
      variant: [{
        price: '100000',
        color: 'Xám',
        quantityForSale: 10,
        quantityInStorage: 1
      }]
    });
    await createUser({
      phone: '0900000024',
      role: 'admin',
      permissions: ['order.edit']
    });
    const adminAgent = await loginAgent({ phone: '0900000024', role: 'admin' });
    const order = await Order.create({
      orderCode: 'NOVA-PARTIAL',
      userPhone: '0911111124',
      userName: 'Partial Test',
      cartItems: [
        { productId: firstProduct._id.toString(), variantIndex: 0, quantity: 1 },
        { productId: secondProduct._id.toString(), variantIndex: 0, quantity: 2 }
      ],
      total: 300000,
      status: 'Processing'
    });

    const response = await adminAgent
      .put(`/orders/update-order/${order._id}`)
      .send({ field: 'status', value: 'Completed' });

    expect(response.status).toBe(400);
    const unchangedFirstProduct = await Product.findById(firstProduct._id);
    const unchangedSecondProduct = await Product.findById(secondProduct._id);
    expect(unchangedFirstProduct.variant[0].quantityInStorage).toBe(10);
    expect(unchangedSecondProduct.variant[0].quantityInStorage).toBe(1);
  });
});
