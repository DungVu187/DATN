const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { User } = require('../models/user');
const { Product } = require('../models/product');

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await Order.deleteMany({});
  await User.deleteMany({});
  await Product.deleteMany({});
});

async function createUser({ phone, role = 'admin', name = 'Test User' }) {
  return User.create({
    phone,
    password: 'password123',
    name,
    role,
  });
}

async function loginAgent({ phone, role = 'admin' }) {
  const agent = request.agent(app);
  const endpoint = role === 'customer' ? '/users/login' : '/users/admin/login';
  const response = await agent
    .post(endpoint)
    .send({ phone, password: 'password123' });

  expect(response.status).toBe(200);
  return agent;
}

describe('Dashboard Backend API HTTP Contract', () => {
  it('blocks unauthenticated requests with 401', async () => {
    const response = await request(app).get('/dashboard');
    expect(response.status).toBe(401);
  });

  it('blocks customer role users with 403', async () => {
    await createUser({ phone: '0935000001', role: 'customer' });
    const agent = await loginAgent({ phone: '0935000001', role: 'customer' });

    const response = await agent.get('/dashboard');
    expect(response.status).toBe(403);
  });

  it('returns valid dashboard aggregate data for admin with default 30-day period', async () => {
    await createUser({ phone: '0935000002', role: 'admin' });
    const agent = await loginAgent({ phone: '0935000002', role: 'admin' });

    // Create customers
    const cust1 = await createUser({ phone: '0935000003', role: 'customer', name: 'Customer 1' });
    const cust2 = await createUser({ phone: '0935000004', role: 'customer', name: 'Customer 2' });

    // Create orders: 1 paid, 1 completed unpaid, 1 unpaid processing, 1 cancelled paid
    await Order.create({
      orderCode: 'SO-TEST-01',
      userPhone: cust1.phone,
      userName: cust1.name,
      total: 500000,
      payment: true,
      status: 'Processing',
      state: 'Processing',
      cartItems: [],
    });

    await Order.create({
      orderCode: 'SO-TEST-02',
      userPhone: cust2.phone,
      userName: cust2.name,
      total: 300000,
      payment: false,
      status: 'Completed',
      state: 'Processing',
      cartItems: [],
    });

    await Order.create({
      orderCode: 'SO-TEST-03',
      userPhone: cust1.phone,
      userName: cust1.name,
      total: 200000,
      payment: false,
      status: 'Processing',
      state: 'Processing',
      cartItems: [],
    });

    await Order.create({
      orderCode: 'SO-TEST-CANCELLED',
      userPhone: cust1.phone,
      userName: cust1.name,
      total: 1000000,
      payment: true,
      status: 'Processing',
      state: 'Cancelled',
      cartItems: [],
    });

    // Create products with different stock levels
    await Product.create({
      name: 'Product Low Stock',
      brand: 'Brand A',
      section: 'Section A',
      value: 'Val A',
      type: 'Type A',
      warranty: '12m',
      variant: [
        { price: '100.000', quantityForSale: 2, quantityInStorage: 2 },
        { price: '120.000', quantityForSale: 3, quantityInStorage: 3 },
      ], // total 5 -> Low stock (< 20)
    });

    await Product.create({
      name: 'Product Out Of Stock',
      brand: 'Brand B',
      section: 'Section B',
      value: 'Val B',
      type: 'Type B',
      warranty: '12m',
      variant: [
        { price: '200.000', quantityForSale: 0, quantityInStorage: 0 },
      ], // total 0 -> Out of stock
    });

    await Product.create({
      name: 'Product Healthy Stock',
      brand: 'Brand C',
      section: 'Section C',
      value: 'Val C',
      type: 'Type C',
      warranty: '12m',
      variant: [
        { price: '300.000', quantityForSale: 25, quantityInStorage: 25 },
      ],
    });

    const response = await agent.get('/dashboard');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const { summary, comparison, revenueByDate, ordersByStatus, recentOrders, lowStockProducts } = response.body.data;

    // Revenue: 500k (paid) + 300k (completed) = 800k. Cancelled order (1m) & unpaid processing (200k) excluded from revenue.
    expect(summary.revenue).toBe(800000);
    // Order count (not cancelled): 3 orders (SO-TEST-01, 02, 03)
    expect(summary.orderCount).toBe(3);
    // New customers: cust1 and cust2
    expect(summary.newCustomerCount).toBe(2);
    // Pending orders: SO-TEST-01 and SO-TEST-03
    expect(summary.pendingOrderCount).toBe(2);

    // Revenue by date should have 30 days
    expect(revenueByDate.length).toBe(30);
    // Comparison should not be NaN or Infinity
    expect(typeof comparison.revenuePercent).toBe('number');
    expect(isNaN(comparison.revenuePercent)).toBe(false);
    expect(isFinite(comparison.revenuePercent)).toBe(true);

    // Orders by status
    const processingStatus = ordersByStatus.find((s) => s.key === 'Processing');
    const completedStatus = ordersByStatus.find((s) => s.key === 'Completed');
    const cancelledStatus = ordersByStatus.find((s) => s.key === 'Cancelled');
    expect(processingStatus.count).toBe(2);
    expect(completedStatus.count).toBe(1);
    expect(cancelledStatus.count).toBe(1);

    // Recent orders: up to 4 orders returned, newest first
    expect(recentOrders.length).toBe(4);

    // Low stock products: 2 products
    expect(lowStockProducts.length).toBe(2);
    expect(lowStockProducts[0].status).toBe('Hết hàng');
    expect(lowStockProducts[0].currentStock).toBe(0);
    expect(lowStockProducts[1].status).toBe('Sắp hết');
    expect(lowStockProducts[1].currentStock).toBe(5);
    expect(lowStockProducts.some((product) => product.name === 'Product Healthy Stock')).toBe(false);
  });

  it('filters by custom date range correctly and calculates zero-previous period without NaN', async () => {
    await createUser({ phone: '0935000005', role: 'admin' });
    const agent = await loginAgent({ phone: '0935000005', role: 'admin' });

    const orderOld = await Order.create({
      orderCode: 'SO-OLD-DATE',
      userPhone: '0935000006',
      total: 100000,
      payment: true,
      status: 'Completed',
      state: 'Processing',
      cartItems: [],
    });
    // Set to 2026-06-01
    await Order.collection.updateOne(
      { _id: orderOld._id },
      { $set: { createdAt: new Date('2026-06-01T10:00:00.000Z') } }
    );

    const orderInPeriod = await Order.create({
      orderCode: 'SO-IN-PERIOD',
      userPhone: '0935000006',
      total: 450000,
      payment: true,
      status: 'Completed',
      state: 'Processing',
      cartItems: [],
    });
    // Set to 2026-08-10
    await Order.collection.updateOne(
      { _id: orderInPeriod._id },
      { $set: { createdAt: new Date('2026-08-10T10:00:00.000Z') } }
    );

    const orderAfterVietnamMidnight = await Order.create({
      orderCode: 'SO-VIETNAM-MIDNIGHT',
      userPhone: '0935000006',
      total: 150000,
      payment: true,
      status: 'Processing',
      state: 'Processing',
      cartItems: [],
    });
    await Order.collection.updateOne(
      { _id: orderAfterVietnamMidnight._id },
      { $set: { createdAt: new Date('2026-08-09T18:00:00.000Z') } }
    );

    const response = await agent
      .get('/dashboard')
      .query({ startDate: '2026-08-01', endDate: '2026-08-15' });

    expect(response.status).toBe(200);
    const { summary, comparison, revenueByDate, ordersByStatus } = response.body.data;

    expect(summary.revenue).toBe(600000);
    expect(summary.orderCount).toBe(2);
    // Period has 15 days
    expect(revenueByDate.length).toBe(15);
    // Check specific date in revenueByDate
    const aug10 = revenueByDate.find((d) => d.date === '2026-08-10');
    expect(aug10).toBeDefined();
    expect(aug10.revenue).toBe(600000);
    expect(aug10.orderCount).toBe(2);

    expect(ordersByStatus.find((status) => status.key === 'Completed').count).toBe(2);
    expect(ordersByStatus.find((status) => status.key === 'Processing').count).toBe(1);

    // Empty date
    const aug05 = revenueByDate.find((d) => d.date === '2026-08-05');
    expect(aug05).toBeDefined();
    expect(aug05.revenue).toBe(0);
    expect(aug05.orderCount).toBe(0);

    // Previous period (2026-07-17 to 2026-07-31) had 0 revenue -> +100%
    expect(comparison.revenuePercent).toBe(100);
  });

  it('records revenue on completion date, falling back to paid date, instead of creation date', async () => {
    await createUser({ phone: '0935000007', role: 'admin' });
    const agent = await loginAgent({ phone: '0935000007', role: 'admin' });

    // Đơn tạo tháng 6 nhưng hoàn thành ngày 10/08 -> doanh thu thuộc 10/08
    const completedLate = await Order.create({
      orderCode: 'SO-COMPLETED-LATE',
      userPhone: '0935000008',
      total: 200000,
      payment: true,
      status: 'Completed',
      state: 'Processing',
      cartItems: [],
    });
    await Order.collection.updateOne(
      { _id: completedLate._id },
      {
        $set: {
          createdAt: new Date('2026-06-01T10:00:00.000Z'),
          paidAt: new Date('2026-06-01T10:05:00.000Z'),
          completedAt: new Date('2026-08-10T03:00:00.000Z'),
        },
      }
    );

    // Đơn tạo trong kỳ nhưng hoàn thành sau kỳ -> không tính vào kỳ này
    const completedAfter = await Order.create({
      orderCode: 'SO-COMPLETED-AFTER',
      userPhone: '0935000008',
      total: 70000,
      payment: true,
      status: 'Completed',
      state: 'Processing',
      cartItems: [],
    });
    await Order.collection.updateOne(
      { _id: completedAfter._id },
      {
        $set: {
          createdAt: new Date('2026-08-12T03:00:00.000Z'),
          completedAt: new Date('2026-08-20T03:00:00.000Z'),
        },
      }
    );

    // Đơn tạo tháng 7, thanh toán 12/08, chưa hoàn thành -> theo ngày thanh toán
    const paidLate = await Order.create({
      orderCode: 'SO-PAID-LATE',
      userPhone: '0935000008',
      total: 50000,
      payment: true,
      status: 'Delivering',
      state: 'Processing',
      cartItems: [],
    });
    await Order.collection.updateOne(
      { _id: paidLate._id },
      {
        $set: {
          createdAt: new Date('2026-07-20T03:00:00.000Z'),
          paidAt: new Date('2026-08-12T03:00:00.000Z'),
        },
      }
    );

    const response = await agent
      .get('/dashboard')
      .query({ startDate: '2026-08-01', endDate: '2026-08-15' });

    expect(response.status).toBe(200);
    const { summary, revenueByDate } = response.body.data;

    expect(summary.revenue).toBe(250000);
    expect(revenueByDate.find((d) => d.date === '2026-08-10').revenue).toBe(200000);
    expect(revenueByDate.find((d) => d.date === '2026-08-12').revenue).toBe(50000);
    // Số đơn trong kỳ vẫn đếm theo ngày tạo: chỉ SO-COMPLETED-AFTER
    expect(summary.orderCount).toBe(1);
  });
});
