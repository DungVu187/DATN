const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User } = require('../components/user');
const { Product } = require('../components/product');
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
  await EpOrder.deleteMany({});
});

const createUser = async ({
  phone,
  email,
  role = 'customer',
  password = 'password123',
  functions = [],
  permissions = []
}) => {
  const user = new User({
    phone,
    email,
    password,
    name: `Test ${phone}`,
    role,
    functions,
    permissions
  });
  await user.save();
  return user;
};

const loginAgent = async ({ phone, role = 'customer', password = 'password123' }) => {
  const agent = request.agent(app);
  const endpoint = role === 'customer' ? '/users/login' : '/users/admin/login';
  const response = await agent
    .post(endpoint)
    .send({ phone, password });

  expect(response.status).toBe(200);
  return agent;
};

const createProduct = async () => {
  return Product.create({
    type: 'PLC',
    name: 'Security Test Product',
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
};

describe('Backend security hardening regression tests', () => {
  it('does not expose sensitive user fields through all-users', async () => {
    await createUser({
      phone: '0920000002',
      email: 'admin@example.com',
      role: 'admin'
    });
    await createUser({
      phone: '0920000003',
      email: 'customer@example.com'
    });
    await User.updateOne(
      { phone: '0920000003' },
      {
        $set: {
          resetOtpExpires: new Date()
        }
      }
    );

    const adminAgent = await loginAgent({ phone: '0920000002', role: 'admin' });
    const response = await adminAgent.get('/users/all-users');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    for (const user of response.body) {
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('resetOtp');
      expect(user).not.toHaveProperty('resetOtpExpires');
    }
  });

  it('does not expose sensitive user fields through profile and customers', async () => {
    await createUser({
      phone: '0920000010',
      email: 'admin-customers@example.com',
      role: 'admin'
    });
    const customer = await createUser({
      phone: '0920000011',
      email: 'sensitive-customer@example.com'
    });
    await User.updateOne(
      { _id: customer._id },
      {
        $set: {
          resetOtp: '123456',
          resetOtpExpires: new Date()
        }
      }
    );

    const customerAgent = await loginAgent({ phone: '0920000011' });
    const profileResponse = await customerAgent.get('/users/profile');
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body).not.toHaveProperty('password');
    expect(profileResponse.body).not.toHaveProperty('resetOtp');
    expect(profileResponse.body).not.toHaveProperty('resetOtpExpires');

    const adminAgent = await loginAgent({ phone: '0920000010', role: 'admin' });
    const customersResponse = await adminAgent.get('/users/customers');
    expect(customersResponse.status).toBe(200);
    expect(customersResponse.body[0]).not.toHaveProperty('password');
    expect(customersResponse.body[0]).not.toHaveProperty('resetOtp');
    expect(customersResponse.body[0]).not.toHaveProperty('resetOtpExpires');
  });

  it('rejects object query fields on auth recovery routes', async () => {
    await createUser({
      phone: '0920000014',
      email: 'nosql@example.com',
      role: 'admin'
    });
    const adminAgent = await loginAgent({ phone: '0920000014', role: 'admin' });

    await request(app)
      .post('/users/login')
      .send({ phone: { $ne: null }, password: 'password123' })
      .expect(400);

    await request(app)
      .post('/users/admin/login')
      .send({ phone: { $ne: null }, password: 'password123' })
      .expect(400);

    await adminAgent
      .post('/users/register')
      .send({ phone: { $ne: null }, password: 'password123', name: 'Bad Register' })
      .expect(400);

    await request(app)
      .post('/users/forgot-password')
      .send({ identifier: { $ne: null } })
      .expect(400);

    await request(app)
      .post('/users/reset-password')
      .send({ identifier: { $ne: null }, otp: '123456', newPassword: 'newpass123' })
      .expect(400);
  });

  it('strips importPrice and earn from public product responses', async () => {
    const product = await Product.create({
      type: 'PLC',
      name: 'Private Variant Product',
      brand: 'Siemens',
      section: 'Automation',
      value: 'PLC',
      warranty: '12 months',
      variant: [{
        price: '100000',
        importPrice: '70000',
        earn: 20,
        quantityForSale: 10,
        quantityInStorage: 10
      }]
    });

    const detailResponse = await request(app).get(`/products/${product._id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.variant[0]).not.toHaveProperty('importPrice');
    expect(detailResponse.body.variant[0]).not.toHaveProperty('earn');

    const fetchResponse = await request(app)
      .post('/products/fetch-by-ids')
      .send({ ids: [product._id.toString()] });
    expect(fetchResponse.status).toBe(200);
    expect(fetchResponse.body.products[0].variant[0]).not.toHaveProperty('importPrice');
    expect(fetchResponse.body.products[0].variant[0]).not.toHaveProperty('earn');
  });

  it('does not allow product.edit users to set purchaseCount through product update', async () => {
    const product = await createProduct();
    await createUser({
      phone: '0920000017',
      email: 'product-editor@example.com',
      role: 'staff',
      permissions: ['product.edit']
    });
    const staffAgent = await loginAgent({ phone: '0920000017', role: 'staff' });

    const response = await staffAgent
      .put(`/products/${product._id}`)
      .send({ name: 'Allowed Rename', purchaseCount: 999 });

    expect(response.status).toBe(200);
    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.name).toBe('Allowed Rename');
    expect(updatedProduct.purchaseCount).toBe(0);
  });

  it('rejects an old JWT after password change', async () => {
    await createUser({
      phone: '0920000018',
      email: 'session-expiry@example.com'
    });

    const loginResponse = await request(app)
      .post('/users/login')
      .send({ phone: '0920000018', password: 'password123' });
    expect(loginResponse.status).toBe(200);
    const oldCookie = loginResponse.headers['set-cookie'][0].split(';')[0];

    const changeResponse = await request(app)
      .put('/users/change-password')
      .set('Cookie', oldCookie)
      .send({ currentPassword: 'password123', newPassword: 'newpassword123' });
    expect(changeResponse.status).toBe(200);

    const oldSessionResponse = await request(app)
      .get('/users/profile')
      .set('Cookie', oldCookie);

    expect(oldSessionResponse.status).toBe(401);
  });

  it('requires authentication for purchase count updates', async () => {
    const product = await createProduct();

    const response = await request(app)
      .put(`/products/purchase/${product._id}`)
      .send({ action: 'increase', amount: 1 });

    expect(response.status).toBe(401);
  });

  it('prevents review IDOR while allowing owner and moderators to update', async () => {
    const product = await createProduct();
    await createUser({ phone: '0920000004', email: 'owner@example.com' });
    await createUser({ phone: '0920000005', email: 'other@example.com' });
    await createUser({ phone: '0920000006', email: 'staff@example.com', role: 'staff' });
    await createUser({ phone: '0920000007', email: 'admin2@example.com', role: 'admin' });

    const ownerAgent = await loginAgent({ phone: '0920000004' });
    const otherAgent = await loginAgent({ phone: '0920000005' });
    const staffAgent = await loginAgent({ phone: '0920000006', role: 'staff' });
    const adminAgent = await loginAgent({ phone: '0920000007', role: 'admin' });

    const createReviewResponse = await ownerAgent
      .post(`/products/${product._id}/review/create`)
      .send({ comment: 'Initial review', rating: 4 });

    expect(createReviewResponse.status).toBe(201);
    const reviewId = createReviewResponse.body.review._id;

    await otherAgent
      .put(`/products/${product._id}/review/${reviewId}`)
      .send({ comment: 'Illegal edit', rating: 1 })
      .expect(403);

    await otherAgent
      .delete(`/products/${product._id}/review/${reviewId}`)
      .expect(403);

    await ownerAgent
      .put(`/products/${product._id}/review/${reviewId}`)
      .send({ comment: 'Owner edit', rating: 5 })
      .expect(200);

    await staffAgent
      .put(`/products/${product._id}/review/${reviewId}`)
      .send({ comment: 'Staff moderation', rating: 4 })
      .expect(200);

    await adminAgent
      .put(`/products/${product._id}/review/${reviewId}`)
      .send({ comment: 'Admin moderation', rating: 3 })
      .expect(200);
  });

  it('allows eporder.edit permission on product setStatusAndQuantity route', async () => {
    const staff = await createUser({
      phone: '0920000008',
      email: 'ep-staff@example.com',
      role: 'staff',
      functions: ['eporder_management'],
      permissions: ['eporder.edit']
    });
    const staffAgent = await loginAgent({ phone: staff.phone, role: 'staff' });
    const order = await EpOrder.create({
      userName: 'EP Staff',
      productList: [{
        productId: new mongoose.Types.ObjectId().toString(),
        price: '10000',
        unit: 'cái',
        quantity: 2,
        quantityEx: 0
      }]
    });

    const response = await staffAgent
      .put(`/eporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });

    expect(response.status).not.toBe(403);
  });
});
