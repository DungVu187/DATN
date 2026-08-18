const mongoose = require('mongoose');
const { Product } = require('../components/product');
// Require chip.js để đăng ký model Section
require('../components/chip');
const Section = mongoose.model('Section');

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
  // Xóa dữ liệu sau mỗi ca test
  await Product.deleteMany({});
  await Section.deleteMany({});
});

describe('Product and Section Model Unit Tests (Phase 2)', () => {
  it('Test Case 3: Link ảnh sản phẩm tuyệt đối phải tự động chuyển thành tương đối (/images/... nhắm mục tiêu post-init hook)', async () => {
    // 1. Tạo và lưu sản phẩm có link ảnh tuyệt đối cũ
    const product = new Product({
      type: 'PLC',
      name: 'Siemens S7-1200',
      brand: 'Siemens',
      section: 'Phần cứng',
      value: 'Siemens',
      warranty: '12 tháng',
      variant: [{
        color: 'Xám',
        price: '5000000',
        imgUrl: 'https://ttsmart.com.vn/api/images/product_1741235837924.png',
        quantityForSale: 10,
        quantityInStorage: 10
      }]
    });
    const saved = await product.save();

    // 2. Truy vấn lại sản phẩm từ Database
    const fetched = await Product.findById(saved._id);

    // 3. Khẳng định: imgUrl của variant phải tự động chuyển đổi thành relative path
    expect(fetched.variant[0].imgUrl).toBe('/images/product_1741235837924.png');
  });

  it('Test Case 4: Link ảnh phân mục tuyệt đối phải tự động chuyển thành tương đối (/section-images/...)', async () => {
    // 1. Tạo và lưu Section có link ảnh tuyệt đối cũ
    const sectionDoc = new Section({
      Section: [
        {
          name: 'Siemens PLC',
          value: ['S7-1200', 'S7-1500'],
          imgUrl: 'https://ttsmart.com.vn/api/section-images/sectionImage_1750388070165.jpg'
        }
      ]
    });
    const saved = await sectionDoc.save();

    // 2. Truy vấn lại Section từ Database
    const fetched = await Section.findById(saved._id);

    // 3. Khẳng định: imgUrl của section phải tự động chuyển đổi thành relative path
    expect(fetched.Section[0].imgUrl).toBe('/section-images/sectionImage_1750388070165.jpg');
  });
});
