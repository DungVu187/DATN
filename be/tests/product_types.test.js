const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Product } = require('../components/product');
const { Type } = require('../components/producttype');
const { User } = require('../components/user');
const { Manage } = require('../components/manage');

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterEach(async () => {
  await Promise.all([
    Product.deleteMany({}),
    Type.deleteMany({}),
    User.deleteMany({}),
    Manage.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

const createStaffAgent = async (phone, permissions) => {
  await User.create({
    phone,
    password: 'password123',
    name: `Staff ${phone}`,
    role: 'staff',
    functions: ['product_management'],
    permissions,
  });

  const agent = request.agent(app);
  const loginResponse = await agent
    .post('/users/admin/login')
    .send({ phone, password: 'password123' });

  expect(loginResponse.status).toBe(200);
  return agent;
};

const createProduct = (type) => Product.create({
  type,
  name: `Product ${Date.now()} ${Math.random()}`,
  code: `TYPE-${Date.now()}-${Math.random()}`,
  brand: 'Nova',
  section: 'Automation',
  value: type,
  warranty: '12 tháng',
  variant: [{ price: '100000' }],
});

describe('Product type management API', () => {
  test('GET /products/types returns inferred icons for legacy type documents', async () => {
    await Type.collection.insertOne({ Type: 'Van điện từ' });

    const response = await request(app).get('/products/types');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      Type: 'Van điện từ',
      icon: 'ri-gi-valve',
    });
  });

  test('POST /products/types requires product.create and prevents normalized duplicates', async () => {
    const allowedAgent = await createStaffAgent('0911000001', ['product.create']);
    const blockedAgent = await createStaffAgent('0911000002', []);

    const created = await allowedAgent
      .post('/products/types')
      .send({ Type: 'Thiết bị Robot', icon: 'ri-tb-robot' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      Type: 'Thiết bị Robot',
      icon: 'ri-tb-robot',
    });

    const duplicate = await allowedAgent
      .post('/products/types')
      .send({ Type: '  thiet bi   robot  ', icon: 'ri-tb-robot' });
    expect(duplicate.status).toBe(409);

    const blocked = await blockedAgent
      .post('/products/types')
      .send({ Type: 'Không được tạo', icon: 'ri-tb-box-multiple' });
    expect(blocked.status).toBe(403);
  });

  test('PUT /products/types/:id updates the icon and renames existing products', async () => {
    const type = await Type.create({ Type: 'Loại cũ', icon: 'ri-tb-box-multiple' });
    const product = await createProduct('Loại cũ');
    await Manage.create({
      homeCategoryConfig: {
        configured: true,
        items: [{
          id: 'old-type',
          label: 'Loại cũ',
          type: 'Loại cũ',
          icon: 'ri-tb-box-multiple',
        }],
      },
    });
    const editAgent = await createStaffAgent('0911000003', ['product.edit']);
    const createOnlyAgent = await createStaffAgent('0911000004', ['product.create']);

    const updated = await editAgent
      .put(`/products/types/${type._id}`)
      .send({ Type: 'Loại mới', icon: 'ri-tb-circuit-motor' });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      Type: 'Loại mới',
      icon: 'ri-tb-circuit-motor',
      updatedProducts: 1,
      updatedHomeCategories: 1,
    });
    expect((await Product.findById(product._id)).type).toBe('Loại mới');
    const manage = await Manage.findOne();
    expect(manage.homeCategoryConfig.items[0]).toMatchObject({
      label: 'Loại mới',
      type: 'Loại mới',
      icon: 'ri-tb-circuit-motor',
    });

    const blocked = await createOnlyAgent
      .put(`/products/types/${type._id}`)
      .send({ Type: 'Không được sửa', icon: 'ri-tb-box-multiple' });
    expect(blocked.status).toBe(403);
  });

  test('rejects invalid icons and prevents deleting a type still used by products', async () => {
    const type = await Type.create({ Type: 'Đang sử dụng', icon: 'ri-tb-settings' });
    await createProduct(type.Type);
    const createAgent = await createStaffAgent('0911000005', ['product.create']);
    const deleteAgent = await createStaffAgent('0911000006', ['product.delete']);

    const invalidIcon = await createAgent
      .post('/products/types')
      .send({ Type: 'Icon lỗi', icon: '<script>alert(1)</script>' });
    expect(invalidIcon.status).toBe(400);

    const inUse = await deleteAgent.delete(`/products/types/${type._id}`);
    expect(inUse.status).toBe(409);
    expect(await Type.findById(type._id)).not.toBeNull();
  });
});
