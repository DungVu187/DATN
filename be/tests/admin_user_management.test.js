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

describe('Admin User Management API Tests', () => {
  let adminCookie;

  beforeEach(async () => {
    // 1. Tạo tài khoản admin
    const admin = new User({
      phone: '0901112223',
      password: 'adminpassword123',
      name: 'Admin Manager',
      role: 'admin'
    });
    await admin.save();

    // 2. Đăng nhập admin để lấy cookie authToken
    const loginRes = await request(app)
      .post('/users/login')
      .send({ phone: '0901112223', password: 'adminpassword123' });
    adminCookie = loginRes.headers['set-cookie'];
  });

  describe('POST /users/admin-create (Tạo tài khoản thủ công)', () => {
    it('Nên tạo tài khoản staff thành công khi đầy đủ thông tin hợp lệ', async () => {
      const res = await request(app)
        .post('/users/admin-create')
        .set('Cookie', adminCookie)
        .send({
          phone: '0909998887',
          password: 'staffpassword123',
          name: 'Staff Member',
          email: 'staff@example.com',
          role: 'staff',
          permissions: ['order.view']
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Tạo tài khoản thành công');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.phone).toBe('0909998887');
      expect(res.body.user.email).toBe('staff@example.com');
      expect(res.body.user.role).toBe('staff');
      expect(res.body.user.permissions).toEqual(['order.view']);
      expect(res.body.user.functions).toEqual([]);

      // Đảm bảo mật khẩu trong DB đã được mã hóa
      const createdUser = await User.findOne({ phone: '0909998887' });
      expect(createdUser.password).not.toBe('staffpassword123');
    });

    it('Nên báo lỗi khi trùng lặp Số điện thoại hoặc Email', async () => {
      // Tạo trước một user khác
      const existing = new User({
        phone: '0909998887',
        password: 'password123',
        email: 'staff@example.com',
        role: 'staff'
      });
      await existing.save();

      // Cố gắng tạo trùng phone
      const resPhone = await request(app)
        .post('/users/admin-create')
        .set('Cookie', adminCookie)
        .send({
          phone: '0909998887',
          password: 'newpassword123',
          role: 'staff'
        });
      expect(resPhone.status).toBe(400);
      expect(resPhone.body.message).toContain('đã tồn tại');

      // Cố gắng tạo trùng email
      const resEmail = await request(app)
        .post('/users/admin-create')
        .set('Cookie', adminCookie)
        .send({
          phone: '0903334445',
          password: 'newpassword123',
          email: 'staff@example.com',
          role: 'staff'
        });
      expect(resEmail.status).toBe(400);
      expect(resEmail.body.message).toContain('đã tồn tại');
    });
  });

  describe('PUT /users/:id/permissions (Cập nhật tài khoản & quyền)', () => {
    it('Nên cập nhật thành công họ tên, email, SĐT và mật khẩu mới', async () => {
      const user = new User({
        phone: '0902223334',
        password: 'oldpassword123',
        name: 'Old Name',
        email: 'old@example.com',
        role: 'staff',
        functions: ['product_management']
      });
      await user.save();

      const res = await request(app)
        .put(`/users/${user._id}/permissions`)
        .set('Cookie', adminCookie)
        .send({
          phone: '0905556667', // Thay đổi SĐT
          name: 'New Name',     // Thay đổi tên
          email: 'new@example.com', // Thay đổi email
          password: 'newpassword789', // Đổi mật khẩu
          role: 'staff',
          permissions: ['order.view'] // Đổi quyền
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Cập nhật tài khoản thành công');
      expect(res.body.user.phone).toBe('0905556667');
      expect(res.body.user.name).toBe('New Name');
      expect(res.body.user.email).toBe('new@example.com');
      expect(res.body.user.permissions).toEqual(['order.view']);
      expect(res.body.user.functions).toEqual([]);

      // Xác thực trong DB mật khẩu mới đã được mã hóa chính xác
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.password).not.toBe('newpassword789');
      const isMatch = await updatedUser.comparePassword('newpassword789');
      expect(isMatch).toBe(true);
    });

    it('Nên báo lỗi khi cập nhật số điện thoại hoặc email trùng lặp với người khác', async () => {
      const user1 = new User({
        phone: '0901234567',
        password: 'password123',
        email: 'user1@example.com',
        role: 'staff'
      });
      const user2 = new User({
        phone: '0907654321',
        password: 'password123',
        email: 'user2@example.com',
        role: 'staff'
      });
      await user1.save();
      await user2.save();

      // Cố tình sửa SĐT của user2 thành SĐT của user1
      const resPhone = await request(app)
        .put(`/users/${user2._id}/permissions`)
        .set('Cookie', adminCookie)
        .send({
          phone: '0901234567',
          role: 'staff'
        });
      expect(resPhone.status).toBe(400);
      expect(resPhone.body.message).toContain('Số điện thoại đã tồn tại');

      // Cố tình sửa email của user2 thành email của user1
      const resEmail = await request(app)
        .put(`/users/${user2._id}/permissions`)
        .set('Cookie', adminCookie)
        .send({
          email: 'user1@example.com',
          role: 'staff'
        });
      expect(resEmail.status).toBe(400);
      expect(resEmail.body.message).toContain('Email đã tồn tại');
    });
  });
});
