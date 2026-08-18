const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User } = require('../components/user');
const { Product } = require('../components/product');
const { StorageHistory } = require('../components/storagehistory');
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
  await StorageHistory.deleteMany({});
  await IpOrder.deleteMany({});
  await EpOrder.deleteMany({});
});

const createAdminAgent = async () => {
  const user = new User({
    phone: '0944000001',
    password: 'password123',
    name: 'History Admin',
    role: 'admin'
  });
  await user.save();

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/users/admin/login')
    .send({ phone: user.phone, password: 'password123' });

  expect(loginRes.status).toBe(200);
  return agent;
};

const seedHistory = async () => {
  const product = await Product.create({
    type: 'PLC',
    name: 'History Product',
    brand: 'Siemens',
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

  await StorageHistory.create([
    {
      productId: product._id,
      productName: product.name,
      quantity: -2,
      userName: 'Admin',
      orderId: 'EP-001',
      orderName: 'EP-001'
    },
    {
      productId: product._id,
      productName: product.name,
      quantity: 5,
      userName: 'Admin'
    },
    {
      productId: product._id,
      productName: product.name,
      quantity: -1,
      userName: 'Admin',
      orderId: 'ONLINE-001',
      orderName: 'ONLINE-001',
      note: 'Đơn hàng bán online'
    },
    {
      productId: product._id,
      productName: product.name,
      quantity: 1,
      userName: 'Admin',
      orderId: 'ONLINE-001',
      orderName: 'ONLINE-001',
      note: 'Hoàn tác đơn bán online'
    }
  ]);
};

describe('StorageHistory API', () => {
  it('stores and filters sources for manual, line-complete and bulk-complete order actions', async () => {
    const agent = await createAdminAgent();
    const product = await Product.create({
      type: 'PLC',
      name: 'Source History Product',
      brand: 'Siemens',
      section: 'Thiet bi tu dong hoa',
      value: 'PLC',
      warranty: '12 thang',
      variant: [{
        price: '100000',
        color: 'Xam',
        quantityForSale: 10,
        quantityInStorage: 10
      }]
    });
    const importOrder = await IpOrder.create({
      orderName: 'Nguon don nhap',
      userName: 'Seeder',
      productList: [{
        productId: product._id.toString(),
        price: '10000',
        unit: 'cai',
        quantity: 5,
        quantityRe: 0,
        status: false
      }]
    });

    const manualRes = await agent
      .put(`/iporders/orders/${importOrder._id}/products/0`)
      .send({
        productId: product._id.toString(),
        price: '10000',
        unit: 'cai',
        quantity: 5,
        quantityRe: 2,
        note: '',
        vat: '',
        status: false
      });
    expect(manualRes.status).toBe(200);
    expect(await StorageHistory.countDocuments({ source: 'order_line_manual' })).toBe(1);

    const lineCompleteRes = await agent
      .put(`/iporders/orders/${importOrder._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });
    expect(lineCompleteRes.status).toBe(200);
    expect(await StorageHistory.countDocuments({ source: 'order_line_complete' })).toBe(1);

    const exportOrder = await EpOrder.create({
      orderName: 'Nguon don xuat',
      userName: 'Seeder',
      productList: [{
        productId: product._id.toString(),
        price: '10000',
        unit: 'cai',
        quantity: 2,
        quantityEx: 0,
        status: false
      }]
    });
    const bulkCompleteRes = await agent
      .put(`/eporders/orders/${exportOrder._id}/setStatusAndQuantity`)
      .send({ status: true });
    expect(bulkCompleteRes.status).toBe(200);
    expect(await StorageHistory.countDocuments({ source: 'order_bulk_complete' })).toBe(1);

    const sourceFilterRes = await agent.get('/histories?noteType=order_line_complete');
    expect(sourceFilterRes.status).toBe(200);
    expect(sourceFilterRes.body.history).toHaveLength(1);
    expect(sourceFilterRes.body.history[0].source).toBe('order_line_complete');
  });

  it('filters by xuat_don, nhap_thu_cong and ban_online noteType', async () => {
    const agent = await createAdminAgent();
    await seedHistory();

    const xuatDon = await agent.get('/histories?noteType=xuat_don');
    expect(xuatDon.status).toBe(200);
    expect(xuatDon.body.history).toHaveLength(1);
    expect(xuatDon.body.history[0].orderName).toBe('EP-001');

    const nhapThuCong = await agent.get('/histories?noteType=nhap_thu_cong');
    expect(nhapThuCong.status).toBe(200);
    expect(nhapThuCong.body.history).toHaveLength(1);
    expect(nhapThuCong.body.history[0].quantity).toBe(5);

    const banOnline = await agent.get('/histories?noteType=ban_online');
    expect(banOnline.status).toBe(200);
    expect(banOnline.body.history).toHaveLength(2);
    expect(banOnline.body.history.map((item) => item.note).sort()).toEqual([
      'Hoàn tác đơn bán online',
      'Đơn hàng bán online'
    ].sort());
  });

  it('paginates history results with allowed limit values', async () => {
    const agent = await createAdminAgent();
    await seedHistory();

    const res = await agent.get('/histories?page=1&limit=20');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(res.body.total).toBe(4);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.history).toHaveLength(4);
  });

  it('returns filter suggestions from all storage history records', async () => {
    const agent = await createAdminAgent();
    await seedHistory();

    const product = await Product.findOne({ name: 'History Product' });
    await StorageHistory.create({
      productId: product._id,
      productName: product.name,
      quantity: 3,
      userName: 'Another User',
      orderId: 'IP-002',
      orderName: 'Nhap hang thang 7'
    });

    const res = await agent.get('/histories/filter-options');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.userNames).toEqual(expect.arrayContaining(['Admin', 'Another User']));
    expect(res.body.orderNames).toEqual(expect.arrayContaining([
      'EP-001',
      'ONLINE-001',
      'Nhap hang thang 7'
    ]));
    expect(res.body.userNames).not.toContain('');
    expect(res.body.orderNames).not.toContain('');
  });
});
