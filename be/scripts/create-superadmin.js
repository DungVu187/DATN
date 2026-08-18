require('dotenv').config();
const mongoose = require('mongoose');

const dbNames = ['test', 'Ecom', 'TTSmartEcom'];

async function seed() {
  const phone = '0813158383';
  const password = '0813158383';
  const name = 'Super Admin';
  const role = 'superadmin';

  for (const dbName of dbNames) {
    const dbUri = `mongodb://localhost:27017/${dbName}`;
    console.log(`\n-------------------------------------`);
    console.log(`Đang xử lý database: ${dbName}`);
    try {
      await mongoose.connect(dbUri);
      console.log(`Kết nối thành công tới ${dbName}`);
      
      const { User } = require('../models/user');

      // 1. Kiểm tra superadmin khác
      const otherSuper = await User.findOne({ role: 'superadmin', phone: { $ne: phone } });
      if (otherSuper) {
        console.warn(`[CẢNH BÁO] Phát hiện tài khoản superadmin khác với SĐT (${otherSuper.phone}) trong DB ${dbName}. Tiến hành xóa...`);
        await User.deleteOne({ _id: otherSuper._id });
      }

      // 2. Tìm hoặc tạo mới tài khoản superadmin
      let user = await User.findOne({ phone });
      if (user) {
        console.log(`Tài khoản "${phone}" đã tồn tại trong DB ${dbName}. Đang cập nhật...`);
        user.role = role;
        user.password = password;
        user.name = name;
        await user.save();
        console.log(`Cập nhật thành công tài khoản "${phone}" làm Super Admin trong DB ${dbName}!`);
      } else {
        console.log(`Tài khoản "${phone}" chưa tồn tại trong DB ${dbName}. Đang tạo mới...`);
        user = new User({
          phone,
          password,
          name,
          role
        });
        await user.save();
        console.log(`Tạo mới thành công tài khoản Super Admin với SĐT "${phone}" trong DB ${dbName}!`);
      }
      
      await mongoose.disconnect();
    } catch (err) {
      console.error(`Lỗi khi xử lý database ${dbName}:`, err.message);
      try { await mongoose.disconnect(); } catch (e) {}
    }
  }
  console.log(`\nHoàn tất seed tài khoản Super Admin trên tất cả các database.`);
  process.exit(0);
}

seed();
