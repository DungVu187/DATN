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

describe('Role Hierarchy & Authorization Tests', () => {
  let superadminCookie;
  let adminCookie;
  let admin2Cookie;
  let staffCookie;
  let superadminId;
  let adminId;
  let admin2Id;
  let staffId;

  beforeEach(async () => {
    // 1. Tạo tài khoản Super Admin
    const superadmin = new User({
      phone: '0900000001',
      password: 'superpassword123',
      name: 'Super Admin',
      role: 'superadmin'
    });
    await superadmin.save();
    superadminId = superadmin._id.toString();

    // 2. Tạo tài khoản Admin 1
    const admin = new User({
      phone: '0900000002',
      password: 'adminpassword123',
      name: 'Admin 1',
      role: 'admin'
    });
    await admin.save();
    adminId = admin._id.toString();

    // 3. Tạo tài khoản Admin 2
    const admin2 = new User({
      phone: '0900000003',
      password: 'adminpassword123',
      name: 'Admin 2',
      role: 'admin'
    });
    await admin2.save();
    admin2Id = admin2._id.toString();

    // 4. Tạo tài khoản Staff
    const staff = new User({
      phone: '0900000004',
      password: 'staffpassword123',
      name: 'Staff Member',
      role: 'staff'
    });
    await staff.save();
    staffId = staff._id.toString();

    // Đăng nhập để lấy Cookies
    const resSuper = await request(app).post('/users/login').send({ phone: '0900000001', password: 'superpassword123' });
    superadminCookie = resSuper.headers['set-cookie'];

    const resAdmin = await request(app).post('/users/login').send({ phone: '0900000002', password: 'adminpassword123' });
    adminCookie = resAdmin.headers['set-cookie'];

    const resAdmin2 = await request(app).post('/users/login').send({ phone: '0900000003', password: 'adminpassword123' });
    admin2Cookie = resAdmin2.headers['set-cookie'];

    const resStaff = await request(app).post('/users/login').send({ phone: '0900000004', password: 'staffpassword123' });
    staffCookie = resStaff.headers['set-cookie'];
  });

  describe('Đăng nhập Admin/Staff (/users/admin/login)', () => {
    it('Super Admin nên đăng nhập thành công vào admin panel', async () => {
      const res = await request(app)
        .post('/users/admin/login')
        .send({ phone: '0900000001', password: 'superpassword123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('thành công');
    });

    it('Admin nên đăng nhập thành công vào admin panel', async () => {
      const res = await request(app)
        .post('/users/admin/login')
        .send({ phone: '0900000002', password: 'adminpassword123' });
      expect(res.status).toBe(200);
    });

    it('Staff nên đăng nhập thành công vào admin panel', async () => {
      const res = await request(app)
        .post('/users/admin/login')
        .send({ phone: '0900000004', password: 'staffpassword123' });
      expect(res.status).toBe(200);
    });
  });

  describe('Danh sach tai khoan (/users/all-users)', () => {
    it('Super Admin nhin thay toan bo tai khoan quan tri', async () => {
      const res = await request(app)
        .get('/users/all-users')
        .set('Cookie', superadminCookie);

      expect(res.status).toBe(200);
      const phones = res.body.map((user) => user.phone);
      expect(phones).toEqual(expect.arrayContaining([
        '0900000001',
        '0900000002',
        '0900000003',
        '0900000004',
      ]));
    });

    it('Admin khong nhin thay tai khoan Super Admin trong muc phan quyen', async () => {
      const res = await request(app)
        .get('/users/all-users')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const phones = res.body.map((user) => user.phone);
      expect(phones).not.toContain('0900000001');
      expect(phones).toEqual(expect.arrayContaining([
        '0900000002',
        '0900000003',
        '0900000004',
      ]));
    });
  });

  describe('Tạo tài khoản thủ công (/users/admin-create)', () => {
    it('Super Admin có thể tạo tài khoản Admin', async () => {
      const res = await request(app)
        .post('/users/admin-create')
        .set('Cookie', superadminCookie)
        .send({
          phone: '0909999111',
          password: 'newpassword123',
          name: 'New Admin',
          role: 'admin'
        });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('admin');
    });

    it('Super Admin có thể tạo tài khoản Staff', async () => {
      const res = await request(app)
        .post('/users/admin-create')
        .set('Cookie', superadminCookie)
        .send({
          phone: '0909999222',
          password: 'newpassword123',
          name: 'New Staff',
          role: 'staff'
        });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('staff');
    });

    it('Admin có thể tạo tài khoản Staff', async () => {
      const res = await request(app)
        .post('/users/admin-create')
        .set('Cookie', adminCookie)
        .send({
          phone: '0909999333',
          password: 'newpassword123',
          name: 'New Staff 2',
          role: 'staff'
        });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('staff');
    });

    it('Admin KHÔNG THỂ tạo tài khoản Admin', async () => {
      const res = await request(app)
        .post('/users/admin-create')
        .set('Cookie', adminCookie)
        .send({
          phone: '0909999444',
          password: 'newpassword123',
          name: 'Illegal Admin',
          role: 'admin'
        });
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('chỉ được phép tạo tài khoản Staff');
    });

    it('Admin KHÔNG THỂ tạo tài khoản Super Admin', async () => {
      const res = await request(app)
        .post('/users/admin-create')
        .set('Cookie', adminCookie)
        .send({
          phone: '0909999555',
          password: 'newpassword123',
          name: 'Illegal Super',
          role: 'superadmin'
        });
      expect(res.status).toBe(403);
    });

    it('Chỉ duy nhất 1 Super Admin tồn tại (Super Admin không thể tạo thêm Super Admin khác)', async () => {
      const res = await request(app)
        .post('/users/admin-create')
        .set('Cookie', superadminCookie)
        .send({
          phone: '0909999666',
          password: 'newpassword123',
          name: 'Another Super',
          role: 'superadmin'
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('duy nhất 1 tài khoản Super Admin');
    });

    it('Staff KHÔNG THỂ gọi API tạo tài khoản', async () => {
      const res = await request(app)
        .post('/users/admin-create')
        .set('Cookie', staffCookie)
        .send({
          phone: '0909999777',
          password: 'newpassword123',
          role: 'staff'
        });
      expect(res.status).toBe(403);
    });
  });

  describe('Cập nhật quyền hạn (/users/:id/permissions)', () => {
    it('Super Admin có thể đổi vai trò Admin thành Staff', async () => {
      const res = await request(app)
        .put(`/users/${adminId}/permissions`)
        .set('Cookie', superadminCookie)
        .send({
          role: 'staff'
        });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('staff');
    });

    it('Admin KHÔNG THỂ đổi vai trò Staff thành Admin', async () => {
      const res = await request(app)
        .put(`/users/${staffId}/permissions`)
        .set('Cookie', adminCookie)
        .send({
          role: 'admin'
        });
      expect(res.status).toBe(403);
    });

    it('Admin KHÔNG THỂ chỉnh sửa thông tin tài khoản của Admin khác', async () => {
      const res = await request(app)
        .put(`/users/${admin2Id}/permissions`)
        .set('Cookie', adminCookie)
        .send({
          name: 'Hacked Name'
        });
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('không có quyền chỉnh sửa');
    });

    it('Admin KHÔNG THỂ chỉnh sửa thông tin tài khoản của Super Admin', async () => {
      const res = await request(app)
        .put(`/users/${superadminId}/permissions`)
        .set('Cookie', adminCookie)
        .send({
          name: 'Hacked Super Name'
        });
      expect(res.status).toBe(403);
    });
  });

  describe('Xóa tài khoản (DELETE /users/:id)', () => {
    it('Super Admin có thể xóa Admin', async () => {
      const res = await request(app)
        .delete(`/users/${adminId}`)
        .set('Cookie', superadminCookie);
      expect(res.status).toBe(200);
      
      const checkUser = await User.findById(adminId);
      expect(checkUser).toBeNull();
    });

    it('Super Admin co the xoa Staff', async () => {
      const res = await request(app)
        .delete(`/users/${staffId}`)
        .set('Cookie', superadminCookie);
      expect(res.status).toBe(200);

      const checkUser = await User.findById(staffId);
      expect(checkUser).toBeNull();
    });

    it('Admin KHÔNG THỂ xóa Super Admin', async () => {
      const res = await request(app)
        .delete(`/users/${superadminId}`)
        .set('Cookie', adminCookie);
      expect(res.status).toBe(403);
    });

    it('Admin KHÔNG THỂ xóa Admin khác', async () => {
      const res = await request(app)
        .delete(`/users/${admin2Id}`)
        .set('Cookie', adminCookie);
      expect(res.status).toBe(403);
    });

    it('Admin có thể xóa Staff', async () => {
      const res = await request(app)
        .delete(`/users/${staffId}`)
        .set('Cookie', adminCookie);
      expect(res.status).toBe(403);
      
      const checkUser = await User.findById(staffId);
      expect(checkUser).not.toBeNull();
    });
  });
});
