const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User } = require('../components/user');
const { Product } = require('../components/product');
const { IpOrder } = require('../components/iporder');
const { StorageHistory } = require('../components/storagehistory');

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
  await StorageHistory.deleteMany({});
});

const createAdminAgent = async ({
  phone = '0922000001',
  role = 'admin',
  permissions = [],
  functions = []
} = {}) => {
  const user = new User({
    phone,
    password: 'password123',
    name: `Admin ${phone}`,
    role,
    permissions,
    functions
  });
  await user.save();

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/users/admin/login')
    .send({ phone, password: 'password123' });

  expect(loginRes.status).toBe(200);
  return agent;
};

const createIpOrder = async ({ orderName = 'Import order', productList = [] } = {}) => {
  return IpOrder.create({
    orderName,
    userName: 'Seeder',
    productList,
  });
};

const createProduct = async ({ quantityInStorage = 10, quantityForSale = 10 } = {}) => {
  return Product.create({
    type: 'PLC',
    name: 'IP Test Product',
    brand: 'Siemens',
    section: 'Thiet bi tu dong hoa',
    value: 'PLC',
    warranty: '12 thang',
    variant: [{
      price: '100000',
      color: 'Xam',
      quantityForSale,
      quantityInStorage
    }]
  });
};

describe('IpOrder API', () => {
  it('ticks one import order line and adds storage and sale quantities', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 10, quantityForSale: 8 });
    const order = await createIpOrder({
      orderName: 'Line complete',
      productList: [{
        productId: product._id.toString(),
        price: '10000',
        unit: 'cai',
        quantity: 3,
        quantityRe: 0,
        status: false
      }]
    });

    const res = await agent
      .put(`/iporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });

    expect(res.status).toBe(200);
    expect(res.body.productList[0].status).toBe(true);
    expect(res.body.productList[0].quantityRe).toBe(3);

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.variant[0].quantityInStorage).toBe(13);
    expect(updatedProduct.variant[0].quantityForSale).toBe(11);
  });

  it('keeps a completed import order line unchanged when status false is sent', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 10, quantityForSale: 8 });
    const order = await createIpOrder({
      orderName: 'Locked complete',
      productList: [{
        productId: product._id.toString(),
        price: '10000',
        unit: 'cai',
        quantity: 3,
        quantityRe: 0,
        status: false
      }]
    });

    await agent
      .put(`/iporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });
    const res = await agent
      .put(`/iporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: false });

    expect(res.status).toBe(200);
    expect(res.body.productList[0].status).toBe(true);
    expect(res.body.productList[0].quantityRe).toBe(3);

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.variant[0].quantityInStorage).toBe(13);
    expect(updatedProduct.variant[0].quantityForSale).toBe(11);
  });

  it('completes an import order and adds all remaining quantities to stock', async () => {
    const agent = await createAdminAgent();
    const firstProduct = await createProduct({ quantityInStorage: 10, quantityForSale: 8 });
    const secondProduct = await Product.create({
      type: 'PLC',
      name: 'Second IP Product',
      brand: 'Siemens',
      section: 'Thiet bi tu dong hoa',
      value: 'PLC',
      warranty: '12 thang',
      variant: [{ price: '100000', color: 'Xam', quantityForSale: 5, quantityInStorage: 7 }]
    });
    const order = await createIpOrder({
      orderName: 'Bulk complete',
      productList: [
        { productId: firstProduct._id.toString(), price: '10000', unit: 'cai', quantity: 3, quantityRe: 1, status: false },
        { productId: secondProduct._id.toString(), price: '10000', unit: 'cai', quantity: 4, quantityRe: 0, status: false }
      ]
    });

    const res = await agent
      .put(`/iporders/orders/${order._id}/setStatusAndQuantity`)
      .send({ status: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.productList[0].quantityRe).toBe(3);
    expect(res.body.productList[1].quantityRe).toBe(4);

    const updatedFirstProduct = await Product.findById(firstProduct._id);
    const updatedSecondProduct = await Product.findById(secondProduct._id);
    expect(updatedFirstProduct.variant[0].quantityInStorage).toBe(12);
    expect(updatedFirstProduct.variant[0].quantityForSale).toBe(10);
    expect(updatedSecondProduct.variant[0].quantityInStorage).toBe(11);
    expect(updatedSecondProduct.variant[0].quantityForSale).toBe(9);
  });

  it('creates import order with calculated total and fetches detail with product information', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct();

    const createRes = await agent
      .post('/iporders/orders')
      .send({
        orderName: 'Nhap test',
        productList: [{
          productId: product._id.toString(),
          price: '12.500',
          unit: 'cai',
          quantity: 4
        }]
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.total).toBe('50000');

    const detailRes = await agent.get(`/iporders/orders/${createRes.body._id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.productList[0].name).toBe('IP Test Product');
    expect(detailRes.body.productList[0].brand).toBe('Siemens');
  });

  it('allows staff with iporder.view and blocks staff missing iporder.view on list route', async () => {
    await createIpOrder({ orderName: 'Viewable import order' });
    const allowedAgent = await createAdminAgent({
      phone: '0922000002',
      role: 'staff',
      functions: ['iporder_management'],
      permissions: ['iporder.view']
    });
    const blockedAgent = await createAdminAgent({
      phone: '0922000003',
      role: 'staff',
      functions: ['iporder_management'],
      permissions: []
    });

    const allowed = await allowedAgent.get('/iporders/orders');
    expect(allowed.status).toBe(200);
    expect(allowed.body.orders).toHaveLength(1);

    const blocked = await blockedAgent.get('/iporders/orders');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Access denied, missing permission: iporder.view');
  });

  it('allows staff with iporder.create to create import order', async () => {
    const agent = await createAdminAgent({
      phone: '0922000004',
      role: 'staff',
      functions: ['iporder_management'],
      permissions: ['iporder.create']
    });

    const res = await agent
      .post('/iporders/orders')
      .send({ orderName: 'Staff create', productList: [] });

    expect(res.status).toBe(201);
    expect(res.body.orderName).toBe('Staff create');
  });

  it('returns 403 for staff with iporder.view but missing iporder.create on create route', async () => {
    const agent = await createAdminAgent({
      phone: '0922000005',
      role: 'staff',
      functions: ['iporder_management'],
      permissions: ['iporder.view']
    });

    const res = await agent
      .post('/iporders/orders')
      .send({ orderName: 'Missing create', productList: [] });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied, missing permission: iporder.create');
  });

  it('allows staff with iporder.edit to update import order name and note', async () => {
    const order = await createIpOrder({ orderName: 'Old name' });
    const agent = await createAdminAgent({
      phone: '0922000006',
      role: 'staff',
      functions: ['iporder_management'],
      permissions: ['iporder.edit']
    });

    const res = await agent
      .put(`/iporders/orders/${order._id}/name`)
      .send({ orderName: 'New name', note: 'Ghi chú đơn nhập' });

    expect(res.status).toBe(200);
    expect(res.body.orderName).toBe('New name');
    expect(res.body.note).toBe('Ghi chú đơn nhập');
  });

  it('deletes only import lines without received or applied stock progress', async () => {
    const agent = await createAdminAgent();
    const order = await createIpOrder({
      orderName: 'Delete import line',
      productList: [
        {
          productId: new mongoose.Types.ObjectId().toString(),
          price: '100',
          unit: 'cai',
          quantity: 2,
          quantityRe: 0,
          stockAppliedQuantity: 0,
          status: false,
        },
        {
          productId: new mongoose.Types.ObjectId().toString(),
          price: '250',
          unit: 'cai',
          quantity: 3,
          quantityRe: 0,
          stockAppliedQuantity: 0,
          status: false,
        },
      ],
    });

    const deleted = await agent.delete('/iporders/orders/' + order._id + '/products/0');
    expect(deleted.status).toBe(200);
    expect(deleted.body.productList).toHaveLength(1);
    expect(deleted.body.total).toBe('750');

    const protectedOrder = await createIpOrder({
      orderName: 'Protected import line',
      productList: [{
        productId: new mongoose.Types.ObjectId().toString(),
        price: '100',
        unit: 'cai',
        quantity: 2,
        quantityRe: 1,
        stockAppliedQuantity: 1,
        status: false,
      }],
    });
    const blocked = await agent.delete(
      '/iporders/orders/' + protectedOrder._id + '/products/0'
    );
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toBe(
      'Không thể xóa sản phẩm đã phát sinh nhập kho. Hãy điều chỉnh số lượng nhập về 0 trước.'
    );
    expect((await IpOrder.findById(protectedOrder._id)).productList).toHaveLength(1);
  });

  it('returns 403 for staff with iporder.create but missing iporder.edit on edit route', async () => {
    const agent = await createAdminAgent({
      phone: '0922000007',
      role: 'staff',
      functions: ['iporder_management'],
      permissions: ['iporder.create']
    });
    const createRes = await agent
      .post('/iporders/orders')
      .send({ orderName: 'Create only', productList: [] });
    expect(createRes.status).toBe(201);

    const editRes = await agent
      .put(`/iporders/orders/${createRes.body._id}/name`)
      .send({ orderName: 'Should fail' });

    expect(editRes.status).toBe(403);
    expect(editRes.body.message).toBe('Access denied, missing permission: iporder.edit');
  });

  it('allows staff with iporder.delete and blocks staff missing iporder.delete on delete route', async () => {
    const deletable = await createIpOrder({ orderName: 'Delete allowed' });
    const protectedOrder = await createIpOrder({ orderName: 'Delete blocked' });
    const allowedAgent = await createAdminAgent({
      phone: '0922000008',
      role: 'staff',
      functions: ['iporder_management'],
      permissions: ['iporder.delete']
    });
    const blockedAgent = await createAdminAgent({
      phone: '0922000009',
      role: 'staff',
      functions: ['iporder_management'],
      permissions: ['iporder.view']
    });

    const allowed = await allowedAgent.delete(`/iporders/orders/${deletable._id}`);
    expect(allowed.status).toBe(200);
    expect(await IpOrder.findById(deletable._id)).toBeNull();

    const blocked = await blockedAgent.delete(`/iporders/orders/${protectedOrder._id}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Access denied, missing permission: iporder.delete');
    expect(await IpOrder.findById(protectedOrder._id)).toBeDefined();
  });

  it('requires iporder.edit for invoice image routes', async () => {
    const agent = await createAdminAgent({
      phone: '0922000010',
      role: 'staff',
      functions: ['iporder_management'],
      permissions: ['iporder.view']
    });

    const uploadRes = await agent.post('/iporders/upload-image');
    expect(uploadRes.status).toBe(403);
    expect(uploadRes.body.message).toBe('Access denied, missing permission: iporder.edit');

    const deleteRes = await agent
      .delete('/iporders/delete-image')
      .query({ imageUrl: '/invoice-images/sample.webp' });
    expect(deleteRes.status).toBe(403);
    expect(deleteRes.body.message).toBe('Access denied, missing permission: iporder.edit');
  });
});
