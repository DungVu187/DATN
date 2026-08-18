const mongoose = require('mongoose');
const { User } = require('../components/user');

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

describe('User Model Unit Tests (Phase 1)', () => {
  it('Test Case 1: Nên tự động mã hóa (hash) mật khẩu bằng bcrypt khi lưu vào Database', async () => {
    const rawPassword = 'mySuperSecretPassword123';
    const user = new User({
      phone: '0901234567',
      password: rawPassword,
      role: 'customer'
    });

    await user.save();

    // Khẳng định mật khẩu được lưu đã bị mã hóa (không trùng mật khẩu thô)
    expect(user.password).not.toBe(rawPassword);
    
    // Bcrypt hash trên NodeJS thường bắt đầu bằng $2a$ hoặc $2b$
    expect(user.password.startsWith('$2a$') || user.password.startsWith('$2b$')).toBe(true);
  });

  it('Test Case 2: So sánh mật khẩu (comparePassword) phải hoạt động chính xác', async () => {
    const rawPassword = 'correctPassword999';
    const user = new User({
      phone: '0907654321',
      password: rawPassword,
      role: 'customer'
    });

    await user.save();

    // Khẳng định đúng mật khẩu trả về true, sai trả về false
    const isCorrectMatch = await user.comparePassword('correctPassword999');
    const isIncorrectMatch = await user.comparePassword('wrongPassword123');

    expect(isCorrectMatch).toBe(true);
    expect(isIncorrectMatch).toBe(false);
  });
});
