/**
 * Probe đường tìm hàng mới (chatCatalog + chatRetrieval) — chỉ đọc DB.
 * Chạy: node scripts/chatbotProbe.js [--db=Ecom]
 */
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const found = args.find((item) => item.startsWith('--' + name + '='));
    return found ? found.split('=').slice(1).join('=') : fallback;
};

const QUESTIONS = [
    'Tìm PLC Siemens',
    'Bán cảm biến tiệm cận không?',
    'relay trung gian',
    'rơ le trung gian',
    'Nên chọn loại nào cho tủ điện 3 pha?',
    'FX3U-32MT',
    'Xin chào, tìm PLC Siemens',
    'Có nút nhấn không?',
    'Có nguồn 24V không?',
    'Van điện từ Airtac',
    'Xy lanh khí nén',
    'xi lanh khi nen',
    'Cảm biến Autonics',
    'Giá bitcoin hôm nay?',
    'Nguồn tin bóng đá hôm nay?',
    'Có aptomat Schneider không',
    'cầu đấu dây',
    'biến tần 1.5kW',
];

async function main() {
    mongoose.set('autoIndex', false);
    mongoose.set('autoCreate', false);
    await mongoose.connect('mongodb://localhost:27017/' + getArg('db', 'Ecom'), { serverSelectionTimeoutMS: 5000 });

    const { getCatalogMetadata } = require('../services/chatCatalog');
    const { retrieveProducts } = require('../services/chatRetrieval');
    const catalog = await getCatalogMetadata();

    for (const question of QUESTIONS) {
        const result = await retrieveProducts({ message: question, catalog, limit: 3 });
        const analysis = result.analysis;
        console.log('\nQ: ' + question);
        console.log('  types=' + JSON.stringify(analysis.types)
            + ' brands=' + JSON.stringify(analysis.brands)
            + ' codes=' + JSON.stringify(analysis.codes)
            + ' phrases=' + JSON.stringify(analysis.phrases)
            + ' tech=' + JSON.stringify(analysis.technicalTokens));
        console.log('  relevance=' + result.relevance + ' relaxed=' + result.relaxed
            + ' missingCodes=' + JSON.stringify(result.missingCodes));
        console.log('  top: ' + (result.products.length
            ? result.products.map((product) => product.type + ' | ' + product.name).join(' || ')
            : '(rỗng)'));
    }

    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => { });
    process.exitCode = 1;
});
