const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User } = require('../components/user');
const { Product } = require('../components/product');
const { EpOrder } = require('../components/eporder');
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
  await EpOrder.deleteMany({});
  await StorageHistory.deleteMany({});
});

const createAdminAgent = async ({
  phone = '0933000001',
  role = 'admin',
  permissions = [],
  functions = []
} = {}) => {
  const user = new User({
    phone,
    password: 'password123',
    name: `EP ${phone}`,
    role,
    permissions,
    functions
  });
  await user.save();

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/users/admin/login')
    .send({ phone: user.phone, password: 'password123' });

  expect(loginRes.status).toBe(200);
  return agent;
};

const createEpOrder = async ({ orderName = 'Export order', productList = [] } = {}) => {
  return EpOrder.create({
    orderName,
    userName: 'Seeder',
    productList,
  });
};

const createProduct = async ({
  quantityInStorage = 10,
  quantityForSale = 10,
  importPrice = '',
  earn = 25,
  price = '100000'
} = {}) => {
  return Product.create({
    type: 'PLC',
    name: 'EP Test Product',
    brand: 'Siemens',
    section: 'Thiet bi tu dong hoa',
    value: 'PLC',
    warranty: '12 thang',
    variant: [{
      price,
      importPrice,
      earn,
      color: 'Xam',
      quantityForSale,
      quantityInStorage
    }]
  });
};

describe('EpOrder API', () => {
  it('snapshots import price and profit while keeping product pricing unchanged', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({
      importPrice: '100',
      earn: 20,
      price: '120'
    });

    const createRes = await agent
      .post('/eporders/orders')
      .send({
        orderName: 'Pricing snapshot',
        productList: [{
          productId: product._id.toString(),
          unit: 'cai',
          quantity: 2,
          quantityEx: 0,
          status: false
        }]
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.productList[0]).toMatchObject({
      importPriceSnapshot: '100',
      profitPercent: 20,
      price: '120'
    });
    expect(createRes.body.total).toBe('240');

    product.variant[0].importPrice = '200';
    product.variant[0].earn = 50;
    product.variant[0].price = '300';
    await product.save();

    const getRes = await agent.get(`/eporders/orders/${createRes.body._id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.productList[0]).toMatchObject({
      importPriceSnapshot: '100',
      profitPercent: 20,
      price: '120'
    });

    const updateRes = await agent
      .put(`/eporders/orders/${createRes.body._id}/products/0`)
      .send({ profitPercent: 30 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.productList[0]).toMatchObject({
      importPriceSnapshot: '100',
      profitPercent: 30,
      price: '130'
    });
    expect(updateRes.body.total).toBe('260');

    const unchangedProduct = await Product.findById(product._id).lean();
    expect(unchangedProduct.variant[0]).toMatchObject({
      importPrice: '200',
      earn: 50,
      price: '300'
    });
  });

  it('keeps legacy line pricing visible after adding another product', async () => {
    const agent = await createAdminAgent();
    const legacyProduct = await createProduct({
      importPrice: '5480000',
      earn: 0,
      price: '5480000'
    });
    const addedProduct = await createProduct({
      importPrice: '100000',
      earn: 20,
      price: '120000'
    });
    const order = await createEpOrder({
      orderName: 'Legacy pricing',
      productList: [{
        productId: legacyProduct._id.toString(),
        price: '',
        unit: 'cai',
        quantity: 1,
        quantityEx: 0,
        status: false
      }]
    });

    const addRes = await agent
      .post(`/eporders/orders/${order._id}/products`)
      .send({
        productId: addedProduct._id.toString(),
        unit: 'cai',
        quantity: 1,
        quantityEx: 0,
        status: false
      });

    expect(addRes.status).toBe(200);
    expect(addRes.body.productList[0]).toMatchObject({
      importPriceSnapshot: '5480000',
      profitPercent: 0,
      price: '5480000'
    });
    expect(addRes.body.productList[1]).toMatchObject({
      importPriceSnapshot: '100000',
      profitPercent: 20,
      price: '120000'
    });
    expect(addRes.body.total).toBe('5600000');

    const persistedOrder = await EpOrder.findById(order._id).lean();
    expect(persistedOrder.productList[0]).toMatchObject({
      importPriceSnapshot: '5480000',
      profitPercent: 0,
      price: '5480000'
    });
  });

  it.each([-1, 101])('rejects profit percent outside 0-100: %s', async (profitPercent) => {
    const agent = await createAdminAgent();
    const product = await createProduct({ importPrice: '100', earn: 20 });
    const order = await createEpOrder({
      orderName: 'Invalid profit',
      productList: [{
        productId: product._id.toString(),
        price: '120',
        importPriceSnapshot: '100',
        profitPercent: 20,
        unit: 'cai',
        quantity: 1,
        quantityEx: 0,
        status: false
      }]
    });

    const res = await agent
      .put(`/eporders/orders/${order._id}/products/0`)
      .send({ profitPercent });

    expect(res.status).toBe(400);
    const unchangedOrder = await EpOrder.findById(order._id).lean();
    expect(unchangedOrder.productList[0]).toMatchObject({
      importPriceSnapshot: '100',
      profitPercent: 20,
      price: '120'
    });
  });

  it('ticks one export order line and subtracts storage and sale quantities', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 10, quantityForSale: 8 });
    const order = await createEpOrder({
      orderName: 'Line complete',
      productList: [{
        productId: product._id.toString(),
        price: '20.000',
        unit: 'cai',
        quantity: 3,
        quantityEx: 0,
        status: false
      }]
    });

    const res = await agent
      .put(`/eporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });

    expect(res.status).toBe(200);
    expect(res.body.productList[0].status).toBe(true);
    expect(res.body.productList[0].quantityEx).toBe(3);

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.variant[0].quantityInStorage).toBe(7);
    expect(updatedProduct.variant[0].quantityForSale).toBe(5);
  });

  it('keeps a completed export order line unchanged when status false is sent', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 10, quantityForSale: 8 });
    const order = await createEpOrder({
      orderName: 'Line revert',
      productList: [{
        productId: product._id.toString(),
        price: '20.000',
        unit: 'cai',
        quantity: 3,
        quantityEx: 0,
        status: false
      }]
    });

    const completeRes = await agent
      .put(`/eporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });
    expect(completeRes.status).toBe(200);

    const unchangedRes = await agent
      .put(`/eporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: false });

    expect(unchangedRes.status).toBe(200);
    expect(unchangedRes.body.productList[0].status).toBe(true);
    expect(unchangedRes.body.productList[0].quantityEx).toBe(3);

    const restoredProduct = await Product.findById(product._id);
    expect(restoredProduct.variant[0].quantityInStorage).toBe(7);
    expect(restoredProduct.variant[0].quantityForSale).toBe(5);
  });

  it('returns 400 and keeps stock unchanged when one export order line lacks stock', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 1, quantityForSale: 8 });
    const order = await createEpOrder({
      orderName: 'Line lacks stock',
      productList: [{
        productId: product._id.toString(),
        price: '20.000',
        unit: 'cai',
        quantity: 3,
        quantityEx: 0,
        status: false
      }]
    });

    const res = await agent
      .put(`/eporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });

    expect(res.status).toBe(400);

    const unchangedProduct = await Product.findById(product._id);
    expect(unchangedProduct.variant[0].quantityInStorage).toBe(1);
    expect(unchangedProduct.variant[0].quantityForSale).toBe(8);
  });

  it('creates export order and setStatusAndQuantity subtracts storage and sale quantities', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 10, quantityForSale: 8 });

    const createRes = await agent
      .post('/eporders/orders')
      .send({
        orderName: 'Xuat test',
        productList: [{
          productId: product._id.toString(),
          price: '20.000',
          unit: 'cai',
          quantity: 3,
          quantityEx: 0
        }]
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.total).toBe('60000');

    const statusRes = await agent
      .put(`/eporders/orders/${createRes.body._id}/setStatusAndQuantity`)
      .send({ status: true });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe(true);
    expect(statusRes.body.productList[0].quantityEx).toBe(3);

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.variant[0].quantityInStorage).toBe(7);
    expect(updatedProduct.variant[0].quantityForSale).toBe(5);
  });

  it('returns 400 and keeps stock unchanged when export order lacks stock', async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 1, quantityForSale: 1 });

    const createRes = await agent
      .post('/eporders/orders')
      .send({
        orderName: 'Xuat thieu ton',
        productList: [{
          productId: product._id.toString(),
          price: '20.000',
          unit: 'cai',
          quantity: 3,
          quantityEx: 0
        }]
      });

    expect(createRes.status).toBe(201);

    const statusRes = await agent
      .put(`/eporders/orders/${createRes.body._id}/setStatusAndQuantity`)
      .send({ status: true });

    expect(statusRes.status).toBe(400);

    const unchangedProduct = await Product.findById(product._id);
    expect(unchangedProduct.variant[0].quantityInStorage).toBe(1);
    expect(unchangedProduct.variant[0].quantityForSale).toBe(1);
  });

  it('allows staff with eporder.view and blocks staff missing eporder.view on list route', async () => {
    await createEpOrder({ orderName: 'Viewable export order' });
    const allowedAgent = await createAdminAgent({
      phone: '0933000002',
      role: 'staff',
      functions: ['eporder_management'],
      permissions: ['eporder.view']
    });
    const blockedAgent = await createAdminAgent({
      phone: '0933000003',
      role: 'staff',
      functions: ['eporder_management'],
      permissions: []
    });

    const allowed = await allowedAgent.get('/eporders/orders');
    expect(allowed.status).toBe(200);
    expect(allowed.body.orders).toHaveLength(1);

    const blocked = await blockedAgent.get('/eporders/orders');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Access denied, missing permission: eporder.view');
  });

  it('allows staff with eporder.create to create export order', async () => {
    const agent = await createAdminAgent({
      phone: '0933000004',
      role: 'staff',
      functions: ['eporder_management'],
      permissions: ['eporder.create']
    });

    const res = await agent
      .post('/eporders/orders')
      .send({ orderName: 'Staff create', productList: [] });

    expect(res.status).toBe(201);
    expect(res.body.orderName).toBe('Staff create');
  });

  it('returns 403 for staff with eporder.view but missing eporder.create on create route', async () => {
    const agent = await createAdminAgent({
      phone: '0933000005',
      role: 'staff',
      functions: ['eporder_management'],
      permissions: ['eporder.view']
    });

    const res = await agent
      .post('/eporders/orders')
      .send({ orderName: 'Missing create', productList: [] });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied, missing permission: eporder.create');
  });

  it('allows staff with eporder.edit to update export order name and note', async () => {
    const order = await createEpOrder({ orderName: 'Old name' });
    const agent = await createAdminAgent({
      phone: '0933000006',
      role: 'staff',
      functions: ['eporder_management'],
      permissions: ['eporder.edit']
    });

    const res = await agent
      .put(`/eporders/orders/${order._id}/name`)
      .send({ orderName: 'New name', note: 'Ghi chú đơn xuất' });

    expect(res.status).toBe(200);
    expect(res.body.orderName).toBe('New name');
    expect(res.body.note).toBe('Ghi chú đơn xuất');
  });

  it('deletes only export lines without exported or applied stock progress', async () => {
    const agent = await createAdminAgent();
    const order = await createEpOrder({
      orderName: 'Delete export line',
      productList: [
        {
          productId: new mongoose.Types.ObjectId().toString(),
          price: '120',
          importPriceSnapshot: '100',
          profitPercent: 20,
          unit: 'cai',
          quantity: 2,
          quantityEx: 0,
          stockAppliedQuantity: 0,
          status: false,
        },
        {
          productId: new mongoose.Types.ObjectId().toString(),
          price: '150',
          importPriceSnapshot: '100',
          profitPercent: 50,
          unit: 'cai',
          quantity: 3,
          quantityEx: 0,
          stockAppliedQuantity: 0,
          status: false,
        },
      ],
    });

    const deleted = await agent.delete('/eporders/orders/' + order._id + '/products/0');
    expect(deleted.status).toBe(200);
    expect(deleted.body.productList).toHaveLength(1);
    expect(deleted.body.total).toBe('450');

    const protectedOrder = await createEpOrder({
      orderName: 'Protected export line',
      productList: [{
        productId: new mongoose.Types.ObjectId().toString(),
        price: '120',
        importPriceSnapshot: '100',
        profitPercent: 20,
        unit: 'cai',
        quantity: 2,
        quantityEx: 1,
        stockAppliedQuantity: 1,
        status: false,
      }],
    });
    const blocked = await agent.delete(
      '/eporders/orders/' + protectedOrder._id + '/products/0'
    );
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toBe(
      'Không thể xóa sản phẩm đã phát sinh xuất kho. Hãy hoàn số lượng xuất về 0 trước.'
    );
    expect((await EpOrder.findById(protectedOrder._id)).productList).toHaveLength(1);
  });

  it('returns 403 for staff with eporder.create but missing eporder.edit on edit route', async () => {
    const agent = await createAdminAgent({
      phone: '0933000007',
      role: 'staff',
      functions: ['eporder_management'],
      permissions: ['eporder.create']
    });
    const createRes = await agent
      .post('/eporders/orders')
      .send({ orderName: 'Create only', productList: [] });
    expect(createRes.status).toBe(201);

    const editRes = await agent
      .put(`/eporders/orders/${createRes.body._id}/name`)
      .send({ orderName: 'Should fail' });

    expect(editRes.status).toBe(403);
    expect(editRes.body.message).toBe('Access denied, missing permission: eporder.edit');
  });

  it('allows staff with eporder.delete and blocks staff missing eporder.delete on delete route', async () => {
    const deletable = await createEpOrder({ orderName: 'Delete allowed' });
    const protectedOrder = await createEpOrder({ orderName: 'Delete blocked' });
    const allowedAgent = await createAdminAgent({
      phone: '0933000008',
      role: 'staff',
      functions: ['eporder_management'],
      permissions: ['eporder.delete']
    });
    const blockedAgent = await createAdminAgent({
      phone: '0933000009',
      role: 'staff',
      functions: ['eporder_management'],
      permissions: ['eporder.view']
    });

    const allowed = await allowedAgent.delete(`/eporders/orders/${deletable._id}`);
    expect(allowed.status).toBe(200);
    expect(await EpOrder.findById(deletable._id)).toBeNull();

    const blocked = await blockedAgent.delete(`/eporders/orders/${protectedOrder._id}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Access denied, missing permission: eporder.delete');
    expect(await EpOrder.findById(protectedOrder._id)).toBeDefined();
  });

  it('requires eporder.edit for invoice image routes', async () => {
    const agent = await createAdminAgent({
      phone: '0933000010',
      role: 'staff',
      functions: ['eporder_management'],
      permissions: ['eporder.view']
    });

    const uploadRes = await agent.post('/eporders/upload-image');
    expect(uploadRes.status).toBe(403);
    expect(uploadRes.body.message).toBe('Access denied, missing permission: eporder.edit');

    const deleteRes = await agent
      .delete('/eporders/delete-image')
      .query({ imageUrl: '/invoice-images/sample.webp' });
    expect(deleteRes.status).toBe(403);
    expect(deleteRes.body.message).toBe('Access denied, missing permission: eporder.edit');
  });
});
