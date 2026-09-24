require('dotenv').config();
const mongoose = require('mongoose');
const { Product, DEFAULT_PRODUCT_EARN } = require('../models/product');
const { resolveMongoUri } = require('../config/database');

/**
 * Script giả lập giá bán cho tất cả sản phẩm
 * Quy tắc:
 * - Giả lập giá trong khoảng min -> max (mặc định 10.000đ - 1.000.000đ)
 * - Giá được làm tròn theo bước nhảy (mặc định 1.000đ hoặc tùy chỉnh)
 * - Tự động đồng bộ giá nhập (importPrice) theo tỷ lệ lợi nhuận (earn, mặc định 25%)
 * - Giữ nguyên toàn bộ thông tin khác (số lượng kho, mã, tên, mô tả, ảnh, thuộc tính...)
 */

// Đọc tham số dòng lệnh
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const onlyEmpty = args.includes('--only-empty');

let minPrice = 10000;
let maxPrice = 1000000;
let step = 1000;

const minIdx = args.indexOf('--min');
if (minIdx !== -1 && args[minIdx + 1]) {
  const parsedMin = parseInt(args[minIdx + 1], 10);
  if (!isNaN(parsedMin) && parsedMin >= 0) {
    minPrice = parsedMin;
  }
}

const maxIdx = args.indexOf('--max');
if (maxIdx !== -1 && args[maxIdx + 1]) {
  const parsedMax = parseInt(args[maxIdx + 1], 10);
  if (!isNaN(parsedMax) && parsedMax >= minPrice) {
    maxPrice = parsedMax;
  }
}

const stepIdx = args.indexOf('--step');
if (stepIdx !== -1 && args[stepIdx + 1]) {
  const parsedStep = parseInt(args[stepIdx + 1], 10);
  if (!isNaN(parsedStep) && parsedStep > 0) {
    step = parsedStep;
  }
}

function getRandomPrice(min, max, stepValue) {
  const stepsCount = Math.floor((max - min) / stepValue);
  const randomStep = Math.floor(Math.random() * (stepsCount + 1));
  return min + randomStep * stepValue;
}

const formatVND = (num) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

async function simulateProductPrice() {
  const uri = resolveMongoUri();
  console.log('----------------------------------------------------');
  console.log(`[SIMULATE PRICE] Đang kết nối CSDL...`);
  console.log(`Khoảng giá giả lập: ${formatVND(minPrice)} -> ${formatVND(maxPrice)} (bước nhảy: ${formatVND(step)})`);
  if (onlyEmpty) {
    console.log(`[CHẾ ĐỘ] Chỉ cập nhật các sản phẩm chưa có giá`);
  } else {
    console.log(`[CHẾ ĐỘ] Cập nhật lại giá cho TẤT CẢ sản phẩm`);
  }
  if (isDryRun) {
    console.log(`[CHẾ ĐỘ THỬ NGHIỆM] (Dry-run: không ghi dữ liệu vào CSDL)`);
  }
  console.log('----------------------------------------------------');

  try {
    await mongoose.connect(uri);
    const dbName = mongoose.connection.name;
    console.log(`Đã kết nối thành công tới database: ${dbName}`);

    const products = await Product.find({}, '_id name variant').lean();
    console.log(`Tìm thấy tổng cộng ${products.length} sản phẩm.`);

    if (products.length === 0) {
      console.log('Không có sản phẩm nào để cập nhật.');
      return;
    }

    const bulkOperations = [];
    let totalVariantsUpdated = 0;
    let previouslyEmptyPriceCount = 0;
    let sumPrice = 0;
    let minPriceAssigned = Infinity;
    let maxPriceAssigned = -Infinity;
    let sampleLogs = [];

    for (const prod of products) {
      const variants = Array.isArray(prod.variant) && prod.variant.length > 0
        ? prod.variant
        : [{
            price: '',
            importPrice: '',
            earn: DEFAULT_PRODUCT_EARN || 25,
            imgUrl: '',
            color: '',
            shape: '',
            buttonCount: '',
            frame: '',
            quantityForSale: 10,
            quantityInStorage: 10,
            note: ''
          }];

      let shouldUpdateProduct = false;

      const updatedVariants = variants.map((v, idx) => {
        const oldPriceStr = String(v.price || '').trim();
        const oldPriceNum = parseFloat(oldPriceStr.replace(/\./g, '').replace(',', '.')) || 0;
        const isOldEmpty = !oldPriceStr || oldPriceNum <= 0;

        if (isOldEmpty) {
          previouslyEmptyPriceCount++;
        }

        // Nếu chỉ cập nhật sp rỗng mà sp này đã có giá -> giữ nguyên
        if (onlyEmpty && !isOldEmpty) {
          return v;
        }

        shouldUpdateProduct = true;
        const newPrice = getRandomPrice(minPrice, maxPrice, step);
        const earnPercent = Number(v.earn) > 0 ? Number(v.earn) : (DEFAULT_PRODUCT_EARN || 25);
        // Tính giá nhập logic tương ứng: importPrice = price / (1 + earn/100)
        const newImportPrice = Math.round(newPrice / (1 + earnPercent / 100));

        totalVariantsUpdated++;
        sumPrice += newPrice;
        if (newPrice < minPriceAssigned) minPriceAssigned = newPrice;
        if (newPrice > maxPriceAssigned) maxPriceAssigned = newPrice;

        if (sampleLogs.length < 5) {
          sampleLogs.push({
            productName: prod.name,
            variantIndex: idx,
            oldPrice: isOldEmpty ? 'Chưa có giá' : formatVND(oldPriceNum),
            newPrice: formatVND(newPrice),
            newImportPrice: formatVND(newImportPrice),
            earn: earnPercent,
          });
        }

        // Chỉ cập nhật giá và giá nhập, giữ nguyên toàn bộ các trường khác
        return {
          ...v,
          price: String(newPrice),
          importPrice: String(newImportPrice),
          earn: earnPercent,
        };
      });

      if (shouldUpdateProduct) {
        bulkOperations.push({
          updateOne: {
            filter: { _id: prod._id },
            update: {
              $set: {
                variant: updatedVariants,
              },
            },
          },
        });
      }
    }

    if (!isDryRun && bulkOperations.length > 0) {
      console.log(`Đang ghi dữ liệu vào CSDL theo lô (${bulkOperations.length} sản phẩm)...`);
      const result = await Product.bulkWrite(bulkOperations);
      console.log(`BulkWrite hoàn tất: Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    }

    console.log('----------------------------------------------------');
    console.log('KẾT QUẢ GIẢ LẬP GIÁ SẢN PHẨM:');
    console.log(`- Tổng số sản phẩm kiểm tra: ${products.length}`);
    console.log(`- Tổng số phiên bản (variants) được cập nhật giá: ${totalVariantsUpdated}`);
    console.log(`- Số phiên bản từng chưa có giá được bổ sung: ${previouslyEmptyPriceCount}`);
    if (totalVariantsUpdated > 0) {
      console.log(`- Giá thấp nhất được gán: ${formatVND(minPriceAssigned)}`);
      console.log(`- Giá cao nhất được gán: ${formatVND(maxPriceAssigned)}`);
      console.log(`- Giá trung bình: ${formatVND(Math.round(sumPrice / totalVariantsUpdated))}`);
    }
    console.log(`- Mẫu 5 sản phẩm đầu tiên sau khi cập nhật:`);
    sampleLogs.forEach((item, index) => {
      console.log(`  ${index + 1}. [${item.productName}] (Variant #${item.variantIndex}): cũ: ${item.oldPrice} -> mới: ${item.newPrice} (Giá nhập: ${item.newImportPrice}, Lợi nhuận: ${item.earn}%)`);
    });
    console.log('----------------------------------------------------');
    console.log('Hoàn tất giả lập giá sản phẩm! Tất cả sản phẩm đều có giá bán và giá nhập hợp lệ.');

  } catch (error) {
    console.error('Lỗi trong quá trình giả lập giá sản phẩm:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Đã ngắt kết nối CSDL.');
  }
}

if (require.main === module) {
  simulateProductPrice();
}

module.exports = {
  simulateProductPrice,
  getRandomPrice,
};
