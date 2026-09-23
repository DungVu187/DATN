const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User } = require('../components/user');

beforeAll(async () => {
  const url = 'mongodb://localhost:27017/EcomTest';
  await mongoose.connect(url);
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await User.deleteMany({});
});

const createUser = async ({ phone, role }) => {
  const user = new User({
    phone,
    password: 'password123',
    name: `${role} Permission Catalog`,
    role,
  });
  await user.save();
  return user;
};

const loginAgent = async (phone) => {
  const agent = request.agent(app);
  await agent
    .post('/users/login')
    .send({ phone, password: 'password123' })
    .expect(200);
  return agent;
};

const countActions = (catalog) =>
  catalog.reduce((total, moduleItem) => total + moduleItem.actions.length, 0);

const findAction = (catalog, permissionKey) => {
  for (const moduleItem of catalog) {
    const action = moduleItem.actions.find((item) => item.key === permissionKey);
    if (action) return action;
  }
  return null;
};

describe('GET /users/permission-catalog', () => {
  it('allows superadmin and returns the permission catalog payload', async () => {
    await createUser({ phone: '0930000001', role: 'superadmin' });
    const superadminAgent = await loginAgent('0930000001');

    const res = await superadminAgent
      .get('/users/permission-catalog')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.catalog)).toBe(true);
    expect(res.body.catalog.length).toBeGreaterThan(0);
    expect(countActions(res.body.catalog)).toBe(30);
    // Đơn bán không còn quét hóa đơn AI; đơn nhập/xuất vẫn giữ
    expect(findAction(res.body.catalog, 'order.scan_ai')).toBeNull();
    expect(findAction(res.body.catalog, 'iporder.scan_ai')).not.toBeNull();
    expect(findAction(res.body.catalog, 'eporder.scan_ai')).not.toBeNull();
    expect(res.body.adminFixed).toEqual(['account.manage']);
    expect(findAction(res.body.catalog, 'order.excel')).toMatchObject({
      key: 'order.excel',
      dependsOn: 'order.edit',
    });
    expect(findAction(res.body.catalog, 'history_import.view')).toMatchObject({
      key: 'history_import.view',
    });
    expect(findAction(res.body.catalog, 'history_export.view')).toMatchObject({
      key: 'history_export.view',
    });
    expect(res.body.catalog.find((moduleItem) => moduleItem.key === 'activitylog')).toMatchObject({
      scope: 'grantable',
      actions: [{ key: 'activitylog.view', label: 'Xem' }],
    });
    const grantableModuleKeys = res.body.catalog
      .filter((moduleItem) => moduleItem.scope === 'grantable')
      .map((moduleItem) => moduleItem.key);
    expect(grantableModuleKeys.slice(-4)).toEqual([
      'storefront',
      'history_import',
      'history_export',
      'activitylog',
    ]);
  });

  it('allows admin', async () => {
    await createUser({ phone: '0930000002', role: 'admin' });
    const adminAgent = await loginAgent('0930000002');

    const res = await adminAgent
      .get('/users/permission-catalog')
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('blocks staff', async () => {
    await createUser({ phone: '0930000003', role: 'staff' });
    const staffAgent = await loginAgent('0930000003');

    await staffAgent
      .get('/users/permission-catalog')
      .expect(403);
  });

  it('blocks customer', async () => {
    await createUser({ phone: '0930000004', role: 'customer' });
    const customerAgent = await loginAgent('0930000004');

    await customerAgent
      .get('/users/permission-catalog')
      .expect(403);
  });

  it('requires auth cookie', async () => {
    await request(app)
      .get('/users/permission-catalog')
      .expect(401);
  });
});
