require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../models/product');
const { resolveMongoUri } = require('../config/database');

/**
 * Script giả lập số lượng tồn kho cho tất cả sản phẩm
 * Quy tắc:
 * - Chỉ cập nhật quantityForSale và quantityInStorage của từng variant từ min đến max (mặc định 1 - 30)
 * - Giữ nguyên toàn bộ thông tin khác (giá, mã, tên, mô tả, ảnh, thuộc tính...)
 * - Đảm bảo không còn sản phẩm nào bị hết hàng (kho luôn có hàng từ 1-30 cái)
 */

// Đọc tham số dòng lệnh
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

let minQuantity = 1;
let maxQuantity = 30;

const minIdx = args.indexOf('--min');
if (minIdx !== -1 && args[minIdx + 1]) {
  const parsedMin = parseInt(args[minIdx + 1], 10);
  if (!isNaN(parsedMin) && parsedMin >= 0) {
    minQuantity = parsedMin;
  }
}

const maxIdx = args.indexOf('--max');
if (maxIdx !== -1 && args[maxIdx + 1]) {
  const parsedMax = parseInt(args[maxIdx + 1], 10);
  if (!isNaN(parsedMax) && parsedMax >= minQuantity) {
    maxQuantity = parsedMax;
  }
}

function getRandomQuantity(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function simulateProductStock() {
  const uri = resolveMongoUri();
  console.log('----------------------------------------------------');
  console.log(`[SIMULATE STOCK] Đang kết nối CSDL...`);
  console.log(`Khoảng số lượng giả lập: ${minQuantity} -> ${maxQuantity}`);
  if (isDryRun) {
    console.log(`[CHẾ ĐỘ THỬ NGHIỆM] (Dry-run: không ghi dữ liệu vào CSDL)`);
  }
  console.log('----------------------------------------------------');

  try {
    await mongoose.connect(uri);
    const dbName = mongoose.connection.name;
    console.log(`Đã kết nối thành công tới database: ${dbName}`);

    // Chỉ lấy _id, name và variant để tối ưu bộ nhớ
    const products = await Product.find({}, '_id name variant').lean();
    console.log(`Tìm thấy tổng cộng ${products.length} sản phẩm.`);

    if (products.length === 0) {
      console.log('Không có sản phẩm nào để cập nhật.');
      return;
    }

    const bulkOperations = [];
    let totalVariantsUpdated = 0;
    let previouslyOutOfStockCount = 0;
    let sumQuantity = 0;
    let sampleLogs = [];

    for (const prod of products) {
      const variants = Array.isArray(prod.variant) && prod.variant.length > 0
        ? prod.variant
        : [{
            price: '',
            imgUrl: '',
            color: '',
            shape: '',
            buttonCount: '',
            frame: '',
            quantityForSale: 0,
            quantityInStorage: 0,
            note: ''
          }];

      let hadOutOfStock = false;

      const updatedVariants = variants.map((v, idx) => {
        const oldSale = Number(v.quantityForSale || 0);
        const oldStorage = Number(v.quantityInStorage || 0);
        if (oldSale <= 0 || oldStorage <= 0) {
          hadOutOfStock = true;
        }

        const newQty = getRandomQuantity(minQuantity, maxQuantity);
        totalVariantsUpdated++;
        sumQuantity += newQty;

        if (sampleLogs.length < 5) {
          sampleLogs.push({
            productName: prod.name,
            variantIndex: idx,
            oldSale,
            oldStorage,
            newQty,
          });
        }

        // Chỉ thay đổi số lượng, giữ nguyên tất cả thuộc tính khác
        return {
          ...v,
          quantityForSale: newQty,
          quantityInStorage: newQty,
        };
      });

      if (hadOutOfStock) {
        previouslyOutOfStockCount++;
      }

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

    if (!isDryRun && bulkOperations.length > 0) {
      console.log(`Đang ghi dữ liệu vào CSDL theo lô (${bulkOperations.length} sản phẩm)...`);
      const result = await Product.bulkWrite(bulkOperations);
      console.log(`BulkWrite hoàn tất: Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    }

    console.log('----------------------------------------------------');
    console.log('KẾT QUẢ GIẢ LẬP SỐ LƯỢNG KHO:');
    console.log(`- Tổng số sản phẩm: ${products.length}`);
    console.log(`- Tổng số phiên bản (variants) cập nhật: ${totalVariantsUpdated}`);
    console.log(`- Số sản phẩm từng hết hàng (<= 0) được bổ sung: ${previouslyOutOfStockCount}`);
    console.log(`- Số lượng trung bình mỗi sp/variant: ${(sumQuantity / (totalVariantsUpdated || 1)).toFixed(1)}`);
    console.log(`- Mẫu 5 sản phẩm đầu tiên sau khi cập nhật:`);
    sampleLogs.forEach((item, index) => {
      console.log(`  ${index + 1}. [${item.productName}] (Variant #${item.variantIndex}): cũ (bán: ${item.oldSale}, kho: ${item.oldStorage}) -> mới: ${item.newQty}`);
    });
    console.log('----------------------------------------------------');
    console.log('Tất cả sản phẩm hiện đều có số lượng trong kho và mở bán từ 1 - 30 cái. Kho không còn bị hết hàng!');

  } catch (error) {
    console.error('Lỗi trong quá trình giả lập số lượng sản phẩm:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Đã ngắt kết nối CSDL.');
  }
}

if (require.main === module) {
  simulateProductStock();
}

module.exports = {
  simulateProductStock,
  getRandomQuantity,
};
