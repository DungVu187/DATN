const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User, hasPermission } = require('../components/user');
const { ActivityLog } = require('../components/activitylog');

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
  await ActivityLog.deleteMany({});
});

const createUser = async ({ phone, role, permissions = [], functions = [] }) => {
  const user = new User({
    phone,
    password: 'password123',
    name: `${role} ${phone}`,
    role,
    permissions,
    functions,
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

describe('Permission core authorization', () => {
  describe('hasPermission', () => {
    it('allows superadmin for every permission', () => {
      expect(hasPermission({ role: 'superadmin', permissions: [] }, 'any.permission')).toBe(true);
    });

    it('keeps admin full access while ADMIN_FULL_ACCESS is true', () => {
      expect(hasPermission({ role: 'admin', permissions: [] }, 'order.view')).toBe(true);
      expect(hasPermission({ role: 'admin', permissions: [] }, 'account.manage')).toBe(true);
    });

    it('checks staff permissions directly', () => {
      const staff = { role: 'staff', permissions: ['customer.create'] };

      expect(hasPermission(staff, 'customer.create')).toBe(true);
      expect(hasPermission(staff, 'customer.delete')).toBe(false);
    });

    it('checks customer permissions directly', () => {
      const customer = { role: 'customer', permissions: ['customer.create'] };

      expect(hasPermission(customer, 'customer.create')).toBe(true);
      expect(hasPermission(customer, 'order.view')).toBe(false);
    });
  });

  describe('POST /users/admin-create hierarchy', () => {
    it('allows staff with customer.create to create a customer', async () => {
      await createUser({
        phone: '0920000001',
        role: 'staff',
        permissions: ['customer.create'],
      });
      const staffAgent = await loginAgent('0920000001');

      const res = await staffAgent
        .post('/users/admin-create')
        .send({
          phone: '0920000101',
          password: 'password123',
          name: 'Created Customer',
          role: 'customer',
        })
        .expect(201);

      expect(res.body.user.role).toBe('customer');
      expect(res.body.user.permissions).toEqual([]);
    });

    it('blocks staff without customer.create from creating a customer', async () => {
      await createUser({
        phone: '0920000002',
        role: 'staff',
        permissions: [],
      });
      const staffAgent = await loginAgent('0920000002');

      const res = await staffAgent
        .post('/users/admin-create')
        .send({
          phone: '0920000102',
          password: 'password123',
          name: 'Blocked Customer',
          role: 'customer',
        })
        .expect(403);

      expect(res.body.message).toBe('Access denied, missing permission: customer.create');
    });

    it('blocks staff from creating another staff even with customer.create', async () => {
      await createUser({
        phone: '0920000003',
        role: 'staff',
        permissions: ['customer.create'],
      });
      const staffAgent = await loginAgent('0920000003');

      const res = await staffAgent
        .post('/users/admin-create')
        .send({
          phone: '0920000103',
          password: 'password123',
          name: 'Blocked Staff',
          role: 'staff',
        })
        .expect(403);

      expect(res.body.message).toBe('Nhân viên chỉ được tạo tài khoản khách hàng');
    });

    it('keeps admin allowed to create staff', async () => {
      await createUser({
        phone: '0920000004',
        role: 'admin',
      });
      const adminAgent = await loginAgent('0920000004');

      const res = await adminAgent
        .post('/users/admin-create')
        .send({
          phone: '0920000104',
          password: 'password123',
          name: 'Created Staff',
          role: 'staff',
          permissions: ['order.view'],
        })
        .expect(201);

      expect(res.body.user.role).toBe('staff');
      expect(res.body.user.permissions).toEqual(['order.view']);
      expect(res.body.user.functions).toEqual([]);
    });

    it('keeps admin blocked from creating admin', async () => {
      await createUser({
        phone: '0920000005',
        role: 'admin',
      });
      const adminAgent = await loginAgent('0920000005');

      const res = await adminAgent
        .post('/users/admin-create')
        .send({
          phone: '0920000105',
          password: 'password123',
          name: 'Blocked Admin',
          role: 'admin',
        })
        .expect(403);

      expect(res.body.message).toContain('Admin chỉ được phép tạo tài khoản Staff hoặc Customer');
    });
  });

  describe('order route permission regression', () => {
    it('uses order.view for GET /orders staff access', async () => {
      await createUser({
        phone: '0920000006',
        role: 'admin',
        permissions: [],
      });
      await createUser({
        phone: '0920000007',
        role: 'staff',
        permissions: ['order.view'],
      });
      await createUser({
        phone: '0920000008',
        role: 'staff',
        permissions: [],
      });
      const adminAgent = await loginAgent('0920000006');
      const staffAgent = await loginAgent('0920000007');
      const blockedStaffAgent = await loginAgent('0920000008');

      await adminAgent
        .get('/orders')
        .expect(200);

      await staffAgent
        .get('/orders')
        .expect(200);

      const blocked = await blockedStaffAgent
        .get('/orders')
        .expect(403);

      expect(blocked.body.message).toBe('Access denied, missing permission: order.view');
    });
  });
});
