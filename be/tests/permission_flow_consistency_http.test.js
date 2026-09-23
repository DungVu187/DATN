// Bao phủ nhóm lỗi "bước trước cho làm, bước sau lại chặn":
// một vai trò/quyền được phép bắt đầu một luồng thì phải đi hết được luồng đó,
// còn quyền không đủ thì phải bị chặn ngay từ bước đầu (không sinh dữ liệu mồ côi).
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Order } = require('../models/order');
const { IpOrder } = require('../models/iporder');
const { EpOrder } = require('../models/eporder');
const { Product } = require('../models/product');
const { User } = require('../models/user');
const { defaultPermissionsFor } = require('./fixtures/adminPermissions');

const OWN_DRAFT_MESSAGE = 'Bạn chỉ có quyền Thêm nên chỉ được sửa đơn nháp do chính mình tạo.';
const sepayEnvKeys = ['SEPAY_BANK_CODE', 'SEPAY_ACCOUNT_NUMBER', 'SEPAY_ACCOUNT_NAME'];
const originalSepayEnv = Object.fromEntries(sepayEnvKeys.map((key) => [key, process.env[key]]));
let phoneSequence = 0;

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
  process.env.SEPAY_BANK_CODE = 'MB';
  process.env.SEPAY_ACCOUNT_NUMBER = '0000111122223333';
  process.env.SEPAY_ACCOUNT_NAME = 'NOVA TEST';
});

afterAll(async () => {
  sepayEnvKeys.forEach((key) => {
    if (originalSepayEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalSepayEnv[key];
  });
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await Promise.all([
    Order.deleteMany({}),
    IpOrder.deleteMany({}),
    EpOrder.deleteMany({}),
    Product.deleteMany({}),
    User.deleteMany({}),
  ]);
});

const nextPhone = () => `0955${String(++phoneSequence).padStart(6, '0')}`;

async function createAgent({ role = 'staff', permissions } = {}) {
  const phone = nextPhone();
  const user = await User.create({
    phone,
    password: 'password123',
    name: `Flow ${role} ${phone}`,
    role,
    functions: role === 'staff' ? ['order_management', 'iporder_management', 'eporder_management'] : [],
    permissions: permissions ?? defaultPermissionsFor(role),
    addresses: [{
      label: 'Nhà',
      receiverName: 'Người nhận',
      receiverPhone: phone,
      provinceCode: '01',
      provinceName: 'Hà Nội',
      wardCode: '001',
      wardName: 'Phường A',
      addressLine: '1 Đường B',
      isDefault: true,
    }],
  });
  const agent = request.agent(app);
  const endpoint = role === 'customer' ? '/users/login' : '/users/admin/login';
  const login = await agent.post(endpoint).send({ phone, password: 'password123' });
  expect(login.status).toBe(200);
  return { agent, user };
}

async function createProduct() {
  return Product.create({
    type: 'PLC',
    name: 'Flow Product',
    code: `FLOW-${Date.now()}-${Math.random()}`,
    brand: 'Flow Brand',
    section: 'Thiết bị tự động hóa',
    value: 'PLC',
    warranty: '12 tháng',
    display: true,
    variant: [{
      price: '100.000',
      importPrice: '80000',
      color: 'Xám',
      quantityForSale: 20,
      quantityInStorage: 20,
    }],
  });
}

// Mô tả 3 loại đơn quản trị theo cùng một "hợp đồng" để chạy chung một bộ test
const ADMIN_ORDER_MODULES = [
  {
    name: 'đơn bán',
    perm: 'order',
    Model: Order,
    create: (agent) => agent.post('/orders/admin-draft').send({}),
    createdId: (res) => res.body.order._id,
    addLine: (agent, id, product) => agent
      .post(`/orders/${id}/items`)
      .send({ productId: product._id.toString(), variantIndex: 0, quantity: 1 }),
    finalize: (agent, id) => agent
      .put(`/orders/update-order/${id}`)
      .send({ field: 'status', value: 'Delivering' }),
    markFinalized: (id) => Order.updateOne({ _id: id }, { status: 'Delivering' }),
    createForeign: (createdBy = null) => Order.create({
      orderCode: `NOVA-FLOW-${Date.now()}-${Math.random()}`,
      userPhone: '',
      userName: '',
      cartItems: [],
      total: 0,
      createdBy,
    }),
  },
  {
    name: 'đơn nhập',
    perm: 'iporder',
    Model: IpOrder,
    create: (agent) => agent.post('/iporders/orders').send({ orderName: 'Flow import', productList: [] }),
    createdId: (res) => res.body._id,
    addLine: (agent, id, product) => agent
      .post(`/iporders/orders/${id}/products`)
      .send({ productId: product._id.toString(), unit: 'cái', quantity: 1, price: '80.000' }),
    finalize: (agent, id) => agent.put(`/iporders/orders/${id}/status`).send({ status: true }),
    markFinalized: (id) => IpOrder.updateOne({ _id: id }, { status: true }),
    createForeign: (createdBy = null) => IpOrder.create({ orderName: 'Foreign', userName: 'Khác', createdBy }),
  },
  {
    name: 'đơn xuất',
    perm: 'eporder',
    Model: EpOrder,
    create: (agent) => agent.post('/eporders/orders').send({ orderName: 'Flow export', productList: [] }),
    createdId: (res) => res.body._id,
    addLine: (agent, id, product) => agent
      .post(`/eporders/orders/${id}/products`)
      .send({ productId: product._id.toString(), unit: 'cái', quantity: 1, quantityEx: 0, status: false }),
    finalize: (agent, id) => agent.put(`/eporders/orders/${id}/status`).send({ status: true }),
    markFinalized: (id) => EpOrder.updateOne({ _id: id }, { status: true }),
    createForeign: (createdBy = null) => EpOrder.create({ orderName: 'Foreign', userName: 'Khác', createdBy }),
  },
];

describe.each(ADMIN_ORDER_MODULES)('Luồng tạo → soạn $name nhất quán quyền', (mod) => {
  const perm = (action) => `${mod.perm}.${action}`;

  test('quyền Thêm tạo được đơn thì soạn tiếp được chính đơn đó (không tạo đơn rỗng vô dụng)', async () => {
    const { agent, user } = await createAgent({ permissions: [perm('view'), perm('create')] });
    const product = await createProduct();

    const created = await mod.create(agent);
    expect(created.status).toBe(201);
    const id = mod.createdId(created);

    const stored = await mod.Model.findById(id).lean();
    expect(String(stored.createdBy)).toBe(String(user._id));

    const added = await mod.addLine(agent, id, product);
    expect(added.status).toBe(200);
  });

  test('quyền Thêm không được sửa đơn của người khác', async () => {
    const { agent: owner } = await createAgent({ role: 'admin' });
    const { agent } = await createAgent({ permissions: [perm('view'), perm('create')] });
    const product = await createProduct();

    const created = await mod.create(owner);
    expect(created.status).toBe(201);

    const res = await mod.addLine(agent, mod.createdId(created), product);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(OWN_DRAFT_MESSAGE);
  });

  test('quyền Thêm không sửa được đơn cũ chưa ghi người tạo (dữ liệu trước khi có createdBy)', async () => {
    const { agent } = await createAgent({ permissions: [perm('view'), perm('create')] });
    const product = await createProduct();
    const legacy = await mod.createForeign(null);

    const res = await mod.addLine(agent, legacy._id, product);
    expect(res.status).toBe(403);
  });

  test('đơn của mình đã chốt thì quyền Thêm không sửa tiếp được nữa', async () => {
    const { agent } = await createAgent({ permissions: [perm('view'), perm('create')] });
    const product = await createProduct();
    const created = await mod.create(agent);
    const id = mod.createdId(created);
    await mod.markFinalized(id);

    const res = await mod.addLine(agent, id, product);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(OWN_DRAFT_MESSAGE);
  });

  test('quyền Thêm không tự chốt/đổi trạng thái đơn (việc của quyền Sửa)', async () => {
    const { agent } = await createAgent({ permissions: [perm('view'), perm('create')] });
    const created = await mod.create(agent);

    const res = await mod.finalize(agent, mod.createdId(created));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(`Access denied, missing permission: ${perm('edit')}`);
  });

  test('chỉ có quyền Xem thì bị chặn ngay từ bước tạo, không sinh đơn mồ côi', async () => {
    const { agent } = await createAgent({ permissions: [perm('view')] });
    const before = await mod.Model.countDocuments();

    const res = await mod.create(agent);
    expect(res.status).toBe(403);
    expect(await mod.Model.countDocuments()).toBe(before);
  });

  test('quyền Sửa (không có Thêm) vẫn sửa được đơn của người khác', async () => {
    const { user: other } = await createAgent({ role: 'admin' });
    const { agent } = await createAgent({ permissions: [perm('view'), perm('edit')] });
    const product = await createProduct();
    const foreign = await mod.createForeign(other._id);

    const res = await mod.addLine(agent, foreign._id, product);
    expect(res.status).toBe(200);
  });

  test('id không tồn tại: người thiếu quyền Sửa nhận 403, không lộ việc đơn có tồn tại', async () => {
    const { agent } = await createAgent({ permissions: [perm('view'), perm('create')] });
    const product = await createProduct();

    const res = await mod.addLine(agent, new mongoose.Types.ObjectId(), product);
    expect(res.status).toBe(403);
  });
});

describe('Luồng mua hàng trên storefront nhất quán cho mọi vai trò', () => {
  test.each(['customer', 'staff', 'admin', 'superadmin'])(
    '%s đặt đơn SePay thành công thì cũng xem được QR thanh toán',
    async (role) => {
      const { agent, user } = await createAgent({ role });
      const product = await createProduct();

      const created = await agent.post('/orders/create-order').send({
        cartItems: [{ productId: product._id.toString(), variantIndex: 0, quantity: 1 }],
        addressId: user.addresses[0]._id.toString(),
        paymentMethod: 'SEPAY',
      });
      expect(created.status).toBe(201);

      const status = await agent.get(`/payments/orders/${created.body.order._id}/status`);
      expect(status.status).toBe(200);
      expect(status.body.payment.qrUrl).toContain('https://qr.sepay.vn/img?');
    }
  );

  test.each(['customer', 'staff', 'admin'])(
    '%s đặt đơn COD thì thấy đơn trong "Đơn của tôi" và xem được chi tiết',
    async (role) => {
      const { agent, user } = await createAgent({ role });
      const product = await createProduct();

      const created = await agent.post('/orders/create-order').send({
        cartItems: [{ productId: product._id.toString(), variantIndex: 0, quantity: 1 }],
        addressId: user.addresses[0]._id.toString(),
        paymentMethod: 'COD',
      });
      expect(created.status).toBe(201);
      const orderId = String(created.body.order._id);

      const mine = await agent.get('/orders/userOrders');
      expect(mine.status).toBe(200);
      const listed = JSON.stringify(mine.body);
      expect(listed).toContain(orderId);

      const detail = await agent.get(`/orders/${orderId}`);
      expect(detail.status).toBe(200);
    }
  );

  test('khách hàng không xem được QR thanh toán của người khác', async () => {
    const { agent: owner, user } = await createAgent({ role: 'customer' });
    const { agent: stranger } = await createAgent({ role: 'customer' });
    const product = await createProduct();

    const created = await owner.post('/orders/create-order').send({
      cartItems: [{ productId: product._id.toString(), variantIndex: 0, quantity: 1 }],
      addressId: user.addresses[0]._id.toString(),
      paymentMethod: 'SEPAY',
    });
    expect(created.status).toBe(201);

    const res = await stranger.get(`/payments/orders/${created.body.order._id}/status`);
    expect(res.status).toBe(403);
  });
});
