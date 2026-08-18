const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User } = require('../components/user');
const { StorageHistory } = require('../components/storagehistory');
const { ActivityLog } = require('../components/activitylog');

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await User.deleteMany({});
  await StorageHistory.deleteMany({});
  await ActivityLog.deleteMany({});
  await mongoose.connection.collection('brands').deleteMany({});
});

const createUser = async ({ phone, role = 'staff', permissions = [] }) => {
  const user = new User({
    phone,
    password: 'password123',
    name: `${role} ${phone}`,
    role,
    permissions,
  });
  await user.save();
  return user;
};

const loginAdminAgent = async (phone) => {
  const agent = request.agent(app);
  await agent
    .post('/users/admin/login')
    .send({ phone, password: 'password123' })
    .expect(200);
  return agent;
};

const createStaffAgent = async ({ phone, permissions = [] }) => {
  await createUser({ phone, role: 'staff', permissions });
  return loginAdminAgent(phone);
};

const expectMissingPermission = (res, permission) => {
  expect(res.status).toBe(403);
  expect(res.body.message).toContain(permission);
};

describe('B4f remaining authorization sweep', () => {
  describe('customer permissions', () => {
    it('allows staff with customer.view to list customers and blocks staff without it', async () => {
      await createUser({ phone: '0931000101', role: 'customer' });
      const allowedAgent = await createStaffAgent({
        phone: '0931000102',
        permissions: ['customer.view'],
      });
      const blockedAgent = await createStaffAgent({
        phone: '0931000103',
        permissions: [],
      });

      await allowedAgent
        .get('/users/customers')
        .expect(200);

      const blocked = await blockedAgent.get('/users/customers');
      expectMissingPermission(blocked, 'customer.view');
    });

    it('blocks staff missing customer.edit from updating a valid customer', async () => {
      const customer = await createUser({ phone: '0931000106', role: 'customer' });
      const blockedAgent = await createStaffAgent({
        phone: '0931000107',
        permissions: [],
      });

      const blocked = await blockedAgent
        .put(`/users/${customer._id}`)
        .send({ name: 'Blocked Customer Edit' });
      expectMissingPermission(blocked, 'customer.edit');
    });

    it('blocks staff missing customer.delete from deleting a valid customer', async () => {
      const customer = await createUser({ phone: '0931000108', role: 'customer' });
      const blockedAgent = await createStaffAgent({
        phone: '0931000109',
        permissions: [],
      });

      const blocked = await blockedAgent.delete(`/users/${customer._id}`);
      expectMissingPermission(blocked, 'customer.delete');
    });
  });

  describe('storage history permissions', () => {
    it('allows only history_import.view to list import histories', async () => {
      const [importHistory] = await StorageHistory.create([
        {
          productId: new mongoose.Types.ObjectId(),
          productName: 'Import history product',
          quantity: 5,
        },
        {
          productId: new mongoose.Types.ObjectId(),
          productName: 'Export history product',
          quantity: -3,
        },
      ]);
      const importAgent = await createStaffAgent({
        phone: '0931000201',
        permissions: ['history_import.view'],
      });
      const blockedAgent = await createStaffAgent({
        phone: '0931000202',
        permissions: [],
      });

      const allowed = await importAgent
        .get('/histories?direction=import')
        .expect(200);
      expect(allowed.body.history).toHaveLength(1);
      expect(allowed.body.history[0].quantity).toBeGreaterThan(0);

      await importAgent
        .get('/histories/filter-options')
        .expect(200);
      await importAgent
        .get(`/histories/${importHistory.productId}`)
        .expect(200);

      const blocked = await blockedAgent.get('/histories?direction=import');
      expectMissingPermission(blocked, 'history_import.view');

      const wrongDirection = await importAgent.get('/histories?direction=export');
      expectMissingPermission(wrongDirection, 'history_export.view');
    });

    it('allows only history_export.view to list export histories', async () => {
      const [, exportHistory] = await StorageHistory.create([
        {
          productId: new mongoose.Types.ObjectId(),
          productName: 'Import history product',
          quantity: 4,
        },
        {
          productId: new mongoose.Types.ObjectId(),
          productName: 'Export history product',
          quantity: -2,
        },
      ]);
      const exportAgent = await createStaffAgent({
        phone: '0931000203',
        permissions: ['history_export.view'],
      });
      const blockedAgent = await createStaffAgent({
        phone: '0931000204',
        permissions: [],
      });

      const allowed = await exportAgent
        .get('/histories?direction=export')
        .expect(200);
      expect(allowed.body.history).toHaveLength(1);
      expect(allowed.body.history[0].quantity).toBeLessThan(0);

      await exportAgent
        .get('/histories/filter-options')
        .expect(200);
      await exportAgent
        .get(`/histories/${exportHistory.productId}`)
        .expect(200);

      const blocked = await blockedAgent.get('/histories?direction=export');
      expectMissingPermission(blocked, 'history_export.view');

      const wrongDirection = await exportAgent.get('/histories?direction=import');
      expectMissingPermission(wrongDirection, 'history_import.view');
    });
  });

  describe('chip product.create permissions', () => {
    it('allows staff with product.create to create brands and blocks staff without it', async () => {
      const allowedAgent = await createStaffAgent({
        phone: '0931000401',
        permissions: ['product.create'],
      });
      const blockedAgent = await createStaffAgent({
        phone: '0931000402',
        permissions: [],
      });

      await allowedAgent
        .post('/chips/brands')
        .send({ Brand: 'B4F Brand' })
        .expect(201);

      const blocked = await blockedAgent
        .post('/chips/brands')
        .send({ Brand: 'Blocked Brand' });
      expectMissingPermission(blocked, 'product.create');
    });

    it('returns the existing brand for a normalized duplicate without writing another log', async () => {
      const allowedAgent = await createStaffAgent({
        phone: '0931000403',
        permissions: ['product.create'],
      });

      const created = await allowedAgent
        .post('/chips/brands')
        .send({ Brand: '  Ơ Rôn  ' })
        .expect(201);

      const duplicate = await allowedAgent
        .post('/chips/brands')
        .send({ Brand: 'oron' })
        .expect(200);

      expect(duplicate.body).toEqual(expect.objectContaining({
        _id: created.body._id,
        Brand: 'Ơ Rôn',
      }));
      expect(await mongoose.connection.collection('brands').countDocuments()).toBe(1);
      expect(await ActivityLog.countDocuments({ action: 'create_brand' })).toBe(1);

      const missingName = await allowedAgent
        .post('/chips/brands')
        .send({ Brand: '   ' })
        .expect(400);
      expect(missingName.body.message).toBe('Thiếu tên thương hiệu');
    });
  });
});
