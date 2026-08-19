const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User, getCookieOptions } = require('../components/user');

beforeAll(async () => {
  // Kết nối tới Database test riêng biệt
  const url = 'mongodb://localhost:27017/EcomTest';
  await mongoose.connect(url);
});

afterAll(async () => {
  // Xóa sạch Database test để tránh rác máy chủ
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  // Xóa dữ liệu các bản ghi User test sau mỗi ca kiểm thử
  await User.deleteMany({});
});

describe('Authentication API Tests (Phase 3)', () => {
  it('does not set Secure cookie for localhost HTTP even when proxy marks request secure', () => {
    const localOptions = getCookieOptions({
      secure: true,
      hostname: 'localhost',
      get: () => 'localhost:5000'
    });

    expect(localOptions.secure).toBe(false);

    const productionOptions = getCookieOptions({
      secure: true,
      hostname: 'nova.com.vn',
      get: () => 'nova.com.vn'
    });

    expect(productionOptions.secure).toBe(true);
  });

  it('Test Case 5: POST /users/login thành công phải thiết lập cookie authToken', async () => {
    // 1. Tạo và lưu user mẫu
    const user = new User({
      phone: '0987654321',
      password: 'password123',
      role: 'customer'
    });
    await user.save();

    // 2. Gửi request POST tới /users/login bằng supertest
    const response = await request(app)
      .post('/users/login')
      .send({
        phone: '0987654321',
        password: 'password123'
      });

    // 3. Khẳng định:
    // - status code là 200
    // - response body có message thành công
    // - Header Set-Cookie chứa cookie authToken
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Đăng nhập thành công');
    expect(response.headers['set-cookie']).toBeDefined();
    
    const cookies = response.headers['set-cookie'].join(';');
    expect(cookies.includes('authToken=')).toBe(true);
  });

  it('Test Case 6: POST /users/login thất bại phải trả về status 400', async () => {
    // 1. Tạo và lưu user mẫu
    const user = new User({
      phone: '0987654322',
      password: 'password123',
      role: 'customer'
    });
    await user.save();

    // 2. Đăng nhập sai mật khẩu
    const response = await request(app)
      .post('/users/login')
      .send({
        phone: '0987654322',
        password: 'wrongPassword'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Thông tin đăng nhập không hợp lệ');

    // 3. Đăng nhập với số điện thoại không tồn tại
    const response2 = await request(app)
      .post('/users/login')
      .send({
        phone: '0000000000',
        password: 'password123'
      });

    expect(response2.status).toBe(400);
    expect(response2.body.message).toBe('Thông tin đăng nhập không hợp lệ');
  });

});
