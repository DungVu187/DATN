const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../index');
const { User } = require('../components/user');
const { IpOrder } = require('../components/iporder');
const { EpOrder } = require('../components/eporder');

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await User.deleteMany({});
  await IpOrder.deleteMany({});
  await EpOrder.deleteMany({});
});

const createAdminAgent = async () => {
  const user = await User.create({
    phone: '0966000001',
    password: 'password123',
    name: 'Inventory Line Status Admin',
    role: 'admin',
  });
  const agent = request.agent(app);
  const loginRes = await agent
    .post('/users/admin/login')
    .send({ phone: user.phone, password: 'password123' });
  expect(loginRes.status).toBe(200);
  return agent;
};

describe('Inventory order line status routes', () => {
  it('keeps IPOrder completion guard and status mutation unchanged', async () => {
    const agent = await createAdminAgent();
    const order = await IpOrder.create({
      orderName: 'IP line status',
      userName: 'Seeder',
      productList: [{
        productId: new mongoose.Types.ObjectId().toString(),
        price: '100',
        unit: 'cai',
        quantity: 2,
        quantityRe: 0,
        stockAppliedQuantity: 0,
        status: false,
      }],
    });

    const blocked = await agent
      .put('/iporders/orders/' + order._id + '/products/0/status')
      .send({ status: true });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toBe(
      'Hãy dùng thao tác nhập kho để hoàn tất sản phẩm.'
    );
    expect((await IpOrder.findById(order._id)).productList[0].status).toBe(false);

    const unchanged = await agent
      .put('/iporders/orders/' + order._id + '/products/0/status')
      .send({ status: false });
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.productList[0].status).toBe(false);
  });

  it('keeps EPOrder completion guard and pricing persistence unchanged', async () => {
    const agent = await createAdminAgent();
    const order = await EpOrder.create({
      orderName: 'EP line status',
      userName: 'Seeder',
      productList: [{
        productId: new mongoose.Types.ObjectId().toString(),
        price: '120',
        importPriceSnapshot: '100',
        profitPercent: 20,
        unit: 'cai',
        quantity: 2,
        quantityEx: 0,
        stockAppliedQuantity: 0,
        status: false,
      }],
    });

    const blocked = await agent
      .put('/eporders/orders/' + order._id + '/products/0/status')
      .send({ status: true });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toBe(
      'Hãy dùng thao tác xuất kho để hoàn tất sản phẩm.'
    );

    const stored = await EpOrder.findById(order._id);
    stored.productList[0].quantityEx = 2;
    stored.productList[0].stockAppliedQuantity = 2;
    stored.productList[0].status = false;
    await stored.save();

    const completed = await agent
      .put('/eporders/orders/' + order._id + '/products/0/status')
      .send({ status: true });
    expect(completed.status).toBe(200);
    expect(completed.body.productList[0].status).toBe(true);
    expect(completed.body.productList[0].quantityEx).toBe(2);
  });
});
