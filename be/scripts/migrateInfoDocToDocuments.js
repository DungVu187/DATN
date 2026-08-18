// Chạy một lần từ thư mục gốc dự án: node be/scripts/migrateInfoDocToDocuments.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Product } = require('../models/product');
const { resolveMongoUri } = require('../config/database');

const LEGACY_DOCUMENTS = [
    ['manual', 'Manual'],
    ['dataSheet', 'Data sheet'],
    ['catalog', 'Catalog'],
    ['others', 'Khác'],
];

async function migrateInfoDocToDocuments() {
    await mongoose.connect(resolveMongoUri());

    let updatedCount = 0;
    const products = await Product.find({
        $or: LEGACY_DOCUMENTS.map(([field]) => ({
            [`infoDoc.${field}`]: { $exists: true, $nin: [null, ''] },
        })),
    });

    for (const product of products) {
        const existingUrls = new Set((product.documents || []).map((document) => String(document.url || '').trim()));
        let changed = false;

        for (const [field, label] of LEGACY_DOCUMENTS) {
            const url = String(product.infoDoc?.[field] || '').trim();
            if (!url || existingUrls.has(url)) continue;

            product.documents.push({ label, url, sourceType: 'link' });
            existingUrls.add(url);
            changed = true;
        }

        if (changed) {
            await product.save();
            updatedCount += 1;
        }
    }

    process.stdout.write(`Đã cập nhật ${updatedCount}/${products.length} sản phẩm.\n`);
}

migrateInfoDocToDocuments()
    .catch((error) => {
        process.stderr.write(`Migration thất bại: ${error.message}\n`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
