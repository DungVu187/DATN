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
  // Restore default env value
  process.env.PUBLIC_SIGNUP_ENABLED = 'false';
});

describe('Registration API Tests (Phase 5 - Admin-only Register)', () => {
  it('Test Case 1: Khi PUBLIC_SIGNUP_ENABLED=false, đăng ký không token phải trả về 401', async () => {
    process.env.PUBLIC_SIGNUP_ENABLED = 'false';
    const res = await request(app)
      .post('/users/register')
      .send({
        phone: '0900000001',
        password: 'password123',
        name: 'Guest User'
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Access denied');
  });

  it('Test Case 2: Khi PUBLIC_SIGNUP_ENABLED=false, tài khoản customer đăng ký phải trả về 403', async () => {
    process.env.PUBLIC_SIGNUP_ENABLED = 'false';
    
    // 1. Tạo customer
    const customer = new User({
      phone: '0900000002',
      password: 'password123',
      role: 'customer'
    });
    await customer.save();

    // 2. Đăng nhập customer để lấy cookie
    const loginRes = await request(app)
      .post('/users/login')
      .send({ phone: '0900000002', password: 'password123' });
    const cookie = loginRes.headers['set-cookie'];

    // 3. Thực hiện đăng ký user mới bằng cookie customer
    const res = await request(app)
      .post('/users/register')
      .set('Cookie', cookie)
      .send({
        phone: '0900000003',
        password: 'password123',
        name: 'New User'
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Access denied');
  });

  it('Test Case 3: Khi PUBLIC_SIGNUP_ENABLED=false, tài khoản admin đăng ký phải thành công (201)', async () => {
    process.env.PUBLIC_SIGNUP_ENABLED = 'false';

    // 1. Tạo admin
    const admin = new User({
      phone: '0900000004',
      password: 'password123',
      role: 'admin'
    });
    await admin.save();

    // 2. Đăng nhập admin để lấy cookie
    const loginRes = await request(app)
      .post('/users/login')
      .send({ phone: '0900000004', password: 'password123' });
    const cookie = loginRes.headers['set-cookie'];

    // 3. Đăng ký user mới bằng cookie admin
    const res = await request(app)
      .post('/users/register')
      .set('Cookie', cookie)
      .send({
        phone: '0900000005',
        password: 'password123',
        name: 'Created by Admin',
        role: 'customer'
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('User created successfully');

    // Kiểm tra xem user đã tồn tại trong db chưa
    const createdUser = await User.findOne({ phone: '0900000005' });
    expect(createdUser).toBeDefined();
    expect(createdUser.name).toBe('Created by Admin');
    expect(createdUser.role).toBe('customer');
  });

  it('Test Case 4: Khi PUBLIC_SIGNUP_ENABLED=true, cho phép đăng ký công khai nhưng ép role=customer', async () => {
    process.env.PUBLIC_SIGNUP_ENABLED = 'true';

    const res = await request(app)
      .post('/users/register')
      .send({
        phone: '0900000006',
        password: 'password123',
        name: 'Public Signup User',
        role: 'admin' // Cố tình gửi role admin để hack quyền
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('User created successfully');

    const createdUser = await User.findOne({ phone: '0900000006' });
    expect(createdUser).toBeDefined();
    expect(createdUser.name).toBe('Public Signup User');
    expect(createdUser.role).toBe('customer'); // Bị ép về customer
  });

  it('Test Case 5: Khi PUBLIC_SIGNUP_ENABLED=false, staff thiếu customer.create không được tạo tài khoản', async () => {
    process.env.PUBLIC_SIGNUP_ENABLED = 'false';

    // 1. Tạo staff
    const staff = new User({
      phone: '0900000007',
      password: 'password123',
      role: 'staff'
    });
    await staff.save();

    // 2. Đăng nhập staff để lấy cookie
    const loginRes = await request(app)
      .post('/users/login')
      .send({ phone: '0900000007', password: 'password123' });
    const cookie = loginRes.headers['set-cookie'];

    // 3. Staff đăng ký user mới cố tình truyền role admin và permissions
    const res = await request(app)
      .post('/users/register')
      .set('Cookie', cookie)
      .send({
        phone: '0900000008',
        password: 'password123',
        name: 'Created by Staff',
        role: 'admin',
        permissions: ['read_order', 'product.edit']
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Nhân viên chỉ được tạo tài khoản khách hàng');

    const createdUser = await User.findOne({ phone: '0900000008' });
    expect(createdUser).toBeNull();
  });

});
