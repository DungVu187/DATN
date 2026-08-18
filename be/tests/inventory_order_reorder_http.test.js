const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../index');
const { User } = require('../components/user');
const { Product } = require('../components/product');
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
  await Product.deleteMany({});
  await IpOrder.deleteMany({});
  await EpOrder.deleteMany({});
});

const createAdminAgent = async () => {
  const user = new User({
    phone: '0944000001',
    password: 'password123',
    name: 'Inventory Reorder Admin',
    role: 'admin',
  });
  await user.save();

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/users/admin/login')
    .send({ phone: user.phone, password: 'password123' });

  expect(loginRes.status).toBe(200);
  return agent;
};

const toPayloadLine = (line) => {
  const plainLine = typeof line.toObject === 'function' ? line.toObject() : line;
  return JSON.parse(JSON.stringify(plainLine));
};

describe('Inventory order reorder routes', () => {
  it('reorders IPOrder lines, keeps duplicates and server-owned stock fields, and rejects edits', async () => {
    const agent = await createAdminAgent();
    const duplicateProductId = new mongoose.Types.ObjectId().toString();
    const otherProductId = new mongoose.Types.ObjectId().toString();
    const order = await IpOrder.create({
      orderName: 'IP reorder',
      userName: 'Seeder',
      status: true,
      productList: [
        {
          productId: duplicateProductId,
          price: '100',
          unit: 'cai',
          quantity: 2,
          quantityRe: 1,
          stockAppliedQuantity: 1,
          status: false,
          note: 'duplicate',
        },
        {
          productId: duplicateProductId,
          price: '100',
          unit: 'cai',
          quantity: 2,
          quantityRe: 1,
          stockAppliedQuantity: 1,
          status: false,
          note: 'duplicate',
        },
        {
          productId: otherProductId,
          price: '250',
          unit: 'cai',
          quantity: 0,
          quantityRe: 0,
          stockAppliedQuantity: 0,
          status: false,
          note: 'other',
        },
      ],
    });
    const originalIds = order.productList.map((line) => line._id.toString());
    const reorderedPayload = [
      toPayloadLine(order.productList[2]),
      toPayloadLine(order.productList[1]),
      toPayloadLine(order.productList[0]),
    ];

    const reordered = await agent
      .put('/iporders/orders/' + order._id + '/reorder')
      .send({ productList: reorderedPayload });

    expect(reordered.status).toBe(200);
    expect(reordered.body.productList.map((line) => line.productId)).toEqual([
      otherProductId,
      duplicateProductId,
      duplicateProductId,
    ]);
    expect(reordered.body.productList[0]._id).toBe(originalIds[2]);
    expect(reordered.body.productList.slice(1).map((line) => line._id)).toEqual(
      expect.arrayContaining(originalIds.slice(0, 2))
    );
    expect(reordered.body.productList.map((line) => line.stockAppliedQuantity)).toEqual([0, 1, 1]);
    expect(reordered.body.total).toBe('400');
    expect(reordered.body.status).toBe(true);

    const editedPayload = reordered.body.productList.map((line) => ({ ...line }));
    editedPayload[0].quantity = 4;
    const rejected = await agent
      .put('/iporders/orders/' + order._id + '/reorder')
      .send({ productList: editedPayload });
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toBe(
      'API sắp xếp chỉ được thay đổi thứ tự sản phẩm.'
    );
  });

  it('normalizes legacy EPOrder pricing before reorder and preserves stock tracking', async () => {
    const agent = await createAdminAgent();
    const pricedProduct = await Product.create({
      type: 'PLC',
      name: 'Legacy pricing product',
      brand: 'Siemens',
      section: 'Thiet bi tu dong hoa',
      value: 'PLC',
      warranty: '12 thang',
      variant: [{
        price: '120',
        importPrice: '100',
        earn: 20,
        color: 'Xam',
        quantityForSale: 10,
        quantityInStorage: 10,
      }],
    });
    const stableProductId = new mongoose.Types.ObjectId().toString();
    const order = await EpOrder.create({
      orderName: 'EP reorder',
      userName: 'Seeder',
      productList: [
        {
          productId: pricedProduct._id.toString(),
          price: '120',
          unit: 'cai',
          quantity: 2,
          quantityEx: 0,
          stockAppliedQuantity: 0,
          stockUpdateSkipped: true,
          status: false,
          note: 'legacy',
        },
        {
          productId: stableProductId,
          price: '150',
          importPriceSnapshot: '100',
          profitPercent: 50,
          unit: 'cai',
          quantity: 1,
          quantityEx: 0,
          stockAppliedQuantity: 0,
          stockUpdateSkipped: false,
          status: false,
          note: 'stable',
        },
      ],
    });
    const legacyId = order.productList[0]._id.toString();
    const stableId = order.productList[1]._id.toString();
    const normalizedLegacy = {
      ...toPayloadLine(order.productList[0]),
      importPriceSnapshot: '100',
      profitPercent: 20,
    };

    const reordered = await agent
      .put('/eporders/orders/' + order._id + '/reorder')
      .send({
        productList: [
          toPayloadLine(order.productList[1]),
          normalizedLegacy,
        ],
      });

    expect(reordered.status).toBe(200);
    expect(reordered.body.productList.map((line) => line._id)).toEqual([
      stableId,
      legacyId,
    ]);
    expect(reordered.body.productList[1]).toMatchObject({
      importPriceSnapshot: '100',
      profitPercent: 20,
      price: '120',
      stockAppliedQuantity: 0,
      stockUpdateSkipped: true,
    });
    expect(reordered.body.total).toBe('390');

    const editedPayload = reordered.body.productList.map((line) => ({ ...line }));
    editedPayload[0].price = '151';
    const rejected = await agent
      .put('/eporders/orders/' + order._id + '/reorder')
      .send({ productList: editedPayload });
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toBe(
      'API sắp xếp chỉ được thay đổi thứ tự sản phẩm.'
    );

    const productAfter = await Product.findById(pricedProduct._id).lean();
    expect(productAfter.variant[0]).toMatchObject({
      price: '120',
      importPrice: '100',
      earn: 20,
    });
  });
});
