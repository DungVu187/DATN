/**
 * Script baseline chatbot (chỉ đọc).
 * - Snapshot catalog công khai của DB ứng dụng: type/brand đang dùng ở sản phẩm display:true.
 * - Tái lập lại các câu hỏi ở mục 2.3 kế hoạch trên classifier + retrieval hiện tại.
 *
 * Chạy: node scripts/chatbotBaseline.js [--db=Ecom] [--out=tests/artifacts/chatbot]
 * KHÔNG ghi bất cứ gì vào DB: autoIndex/autoCreate = false, chỉ dùng find/distinct.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const found = args.find((item) => item.startsWith('--' + name + '='));
    return found ? found.split('=').slice(1).join('=') : fallback;
};

const dbName = getArg('db', 'Ecom');
const outDir = path.resolve(__dirname, '..', getArg('out', 'tests/artifacts/chatbot'));
const uri = 'mongodb://localhost:27017/' + dbName;

// Các câu hỏi ở mục 2.3 của KE-HOACH-CHATBOT-TU-VAN.md.
const PROBE_QUESTIONS = [
    'Tìm PLC Siemens',
    'Bán cảm biến tiệm cận không?',
    'relay trung gian',
    'rơ le trung gian',
    'Nên chọn loại nào cho tủ điện 3 pha?',
    'FX3U-32MT',
    'Xin chào, tìm PLC Siemens',
    'Còn bao nhiêu cái?',
    'Giá bao nhiêu?',
    'Cái này bảo hành mấy năm?',
    'Có nút nhấn không?',
    'Có nguồn 24V không?',
    'Van điện từ Airtac',
    'Xy lanh khí nén',
    'xi lanh khi nen',
    'Cảm biến Autonics',
    'Giá bitcoin hôm nay?',
    'Nguồn tin bóng đá hôm nay?',
];

async function main() {
    mongoose.set('autoIndex', false);
    mongoose.set('autoCreate', false);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

    const { Product } = require('../models/product');
    const { classifyChatIntent } = require('../services/chatIntent');
    const { listProducts } = require('../services/productListing');
    const { removeVietnameseTones } = require('../utils/textNormalization');

    // Bản sao logic tách từ khóa TRƯỚC khi sửa, giữ lại để tái lập baseline.
    const LEGACY_FILLER_WORDS = new Set([
        'toi', 'can', 'muon', 'tim', 'cho', 'hoi', 'biet', 'xem', 'giup',
        'minh', 'mot', 'loai', 'san', 'pham', 'hang', 'nao', 'co', 'khong',
        'con', 'het', 'gia', 'bao', 'nhieu', 'ton', 'kho', 'thong', 'so',
        'ky', 'thuat', 'tuong', 'tu', 'thay', 'the', 'giao', 'nhan',
        'van', 'chuyen', 'bao', 'hanh', 'doi', 'tra', 'cua', 'toi',
    ]);
    const getSearchEntity = (message) => removeVietnameseTones(String(message || ''))
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => !LEGACY_FILLER_WORDS.has(token))
        .join(' ')
        .slice(0, 300);

    const displayFilter = { display: true };
    const [types, brands, sections, total] = await Promise.all([
        Product.distinct('type', displayFilter),
        Product.distinct('brand', displayFilter),
        Product.distinct('section', displayFilter),
        Product.countDocuments(displayFilter),
    ]);

    const catalog = {
        db: dbName,
        capturedAt: new Date().toISOString(),
        publicProductCount: total,
        typeCount: types.length,
        brandCount: brands.length,
        sectionCount: sections.length,
        types: types.filter(Boolean).sort(),
        brands: brands.filter(Boolean).sort(),
        sections: sections.filter(Boolean).sort(),
    };

    const probes = [];
    for (const question of PROBE_QUESTIONS) {
        const intent = classifyChatIntent(question);
        const searchEntity = getSearchEntity(question);
        let retrieved = [];
        let retrievalError = null;
        try {
            const result = await listProducts({
                query: { search: searchEntity || question, limit: 5, sortBy: 'purchaseCount', sortOrder: 'desc' },
                userId: null,
            });
            retrieved = (result.products || []).map((product) => ({
                name: product.name,
                code: product.code || '',
                type: product.type,
                brand: product.brand,
            }));
        } catch (error) {
            retrievalError = error.message;
        }
        probes.push({ question, intent, searchEntity, retrieved, retrievalError });
    }

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'catalog-snapshot.json'), JSON.stringify(catalog, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, 'baseline-probes.json'), JSON.stringify(probes, null, 2), 'utf8');

    console.log('DB=' + dbName + ' products(display:true)=' + total + ' types=' + types.length + ' brands=' + brands.length);
    probes.forEach((probe) => {
        const items = probe.retrieved.map((item) => item.type + ' | ' + item.name).slice(0, 3);
        console.log('\nQ: ' + probe.question);
        console.log('  intent=' + probe.intent + ' entity="' + probe.searchEntity + '"');
        console.log('  top: ' + (items.length ? items.join(' || ') : '(rỗng)'));
    });
    console.log('\nArtifacts: ' + outDir);

    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error('Baseline failed:', error.message);
    await mongoose.disconnect().catch(() => { });
    process.exitCode = 1;
});
