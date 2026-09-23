const { Product } = require('../../models/product');
const { resetCatalogCache } = require('../../services/chatCatalog');

const CODE_PREFIX = 'CHAT-FIX-';

/**
 * Bộ sản phẩm cố định cho test chatbot.
 * Dùng productKey ổn định rồi map sang ObjectId sau khi seed, không hardcode ID của DB ứng dụng.
 */
const CHAT_PRODUCT_FIXTURES = Object.freeze([
    {
        key: 'proximity_sensor',
        type: 'Cảm biến', name: 'Cảm biến tiệm cận PR12-4DN', brand: 'Autonics',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'PR12-4DN',
        warranty: '12 tháng', description: 'Cảm biến tiệm cận kiểu NPN dùng cho dây chuyền.',
        specifications: 'Điện áp: 12-24VDC; Khoảng cách phát hiện: 4mm; Ngõ ra: NPN',
        features: 'Phát hiện kim loại không tiếp xúc.',
        variant: [{ price: '350000', earn: 25, quantityForSale: 12, quantityInStorage: 12 }],
    },
    {
        key: 'transformer_noise',
        type: 'Biến áp cách ly', name: 'Biến áp cách ly 500VA', brand: 'Khác',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'BA-500VA',
        warranty: '6 tháng', description: 'Biến áp cách ly công suất 500VA.',
        variant: [{ price: '1500000', earn: 25, quantityForSale: 4, quantityInStorage: 4 }],
    },
    {
        key: 'relay_intermediate',
        type: 'Relay Trung Gian', name: 'Relay 8 chân IDEC RN2S-NL-D24 24VDC 5A', brand: 'Idec',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'RN2S-NL-D24',
        warranty: '12 tháng', description: 'Relay trung gian 8 chân dẹp.',
        specifications: 'Điện áp cuộn dây: 24VDC; Dòng tiếp điểm: 5A',
        variant: [{ price: '95000', earn: 25, quantityForSale: 30, quantityInStorage: 30 }],
    },
    {
        key: 'relay_thermal',
        type: 'Relay Nhiệt', name: 'Relay nhiệt LRD08 2.5-4A', brand: 'Schneider',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'LRD08',
        warranty: '12 tháng', description: 'Relay nhiệt bảo vệ quá tải động cơ.',
        variant: [{ price: '420000', earn: 25, quantityForSale: 8, quantityInStorage: 8 }],
    },
    {
        key: 'push_button',
        type: 'Nút Nhấn', name: 'Nút nhấn xanh không đèn Idec 1 NO', brand: 'Idec',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'YW1B-M1E10G',
        warranty: '6 tháng', description: 'Nút nhấn nhả phi 22.',
        variant: [{ price: '65000', earn: 25, quantityForSale: 50, quantityInStorage: 50 }],
    },
    {
        key: 'power_supply_24v',
        type: 'Nguồn', name: 'Nguồn 24VDC 5A gắn ray', brand: 'Delta',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'DRP024V120W',
        warranty: '24 tháng', description: 'Bộ nguồn 24VDC 5A gắn ray DIN.',
        specifications: 'Ngõ ra: 24VDC; Dòng: 5A; Ngõ vào: 100-240VAC',
        variant: [{ price: '890000', earn: 25, quantityForSale: 10, quantityInStorage: 10 }],
    },
    {
        key: 'solenoid_valve_airtac',
        type: 'Van điện từ', name: 'Van điện từ Airtac 4V210-08 220V', brand: 'Airtac',
        section: 'Cụm Cối', value: 'Thiết bị', code: CODE_PREFIX + '4V210-08',
        warranty: '6 tháng', description: 'Van điện từ khí nén 5/2.',
        // Đúng kiểu boilerplate máy sinh của dữ liệu thật: nhắc cả 24V lẫn 220V nên
        // dò điện áp trong specs thì con nào cũng "khớp" — tên hàng mới là căn cứ.
        specifications: 'Điện áp hoạt động định mức: 24 V DC hoặc 220 V AC tiêu chuẩn',
        variant: [{ price: '260000', earn: 25, quantityForSale: 15, quantityInStorage: 15 }],
    },
    {
        key: 'cylinder_airtac',
        type: 'Xy lanh khí nén', name: 'Xy lanh khí nén Airtac SC63x250', brand: 'Airtac',
        section: 'Cụm Cối', value: 'Thiết bị', code: CODE_PREFIX + 'SC63X250',
        warranty: '6 tháng', description: 'Xy lanh khí nén hành trình 250mm.',
        variant: [{ price: '1200000', earn: 25, quantityForSale: 6, quantityInStorage: 6 }],
    },
    {
        key: 'plc_siemens',
        type: 'PLC', name: 'PLC Siemens S7-1200 CPU 1214C', brand: 'Siemens',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'S7-1214C',
        warranty: '3 tháng', description: 'PLC dùng cho dây chuyền nhỏ.',
        specifications: 'CPU 1214C DC/DC/RLY; 14 DI; 10 DO',
        variant: [{ price: '6850000', earn: 25, quantityForSale: 5, quantityInStorage: 5 }],
    },
    {
        key: 'plc_siemens_out_of_stock',
        type: 'PLC', name: 'PLC Siemens S7-1200 CPU 1215C', brand: 'Siemens',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'S7-1215C',
        warranty: '12 tháng', description: 'PLC bản cao hơn, hiện hết hàng.',
        specifications: 'CPU 1215C DC/DC/RLY; 14 DI; 10 DO; 2 cổng PROFINET',
        variant: [{ price: '9200000', earn: 25, quantityForSale: 0, quantityInStorage: 0 }],
    },
    {
        key: 'plc_contact_only',
        type: 'PLC', name: 'PLC Mitsubishi FX3U-32M báo giá', brand: 'Mitsubishi',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'FX3U-32M',
        warranty: '12 tháng', description: 'PLC bán theo hình thức liên hệ báo giá.',
        // earn = 0 nên theo productPricing đây là hàng contact-only, không công khai giá.
        variant: [{ price: '5000000', earn: 0, quantityForSale: 4, quantityInStorage: 4 }],
    },
    {
        key: 'contactor_multi_variant',
        type: 'Contactor', name: 'Contactor Schneider LC1D 3P', brand: 'Schneider',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'LC1D-MULTI',
        warranty: '12 tháng', description: 'Contactor 3 pha nhiều dòng.',
        variant: [
            { price: '480000', earn: 25, quantityForSale: 0, quantityInStorage: 0, color: '9A' },
            { price: '560000', earn: 25, quantityForSale: 7, quantityInStorage: 7, color: '12A' },
        ],
    },
    {
        key: 'breaker_in_stock',
        type: 'Aptomat', name: 'MCB Schneider A9F74210 10A 2P', brand: 'Schneider',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'A9F74210',
        warranty: '12 tháng', description: 'Aptomat 10A 2P.',
        variant: [{ price: '310000', earn: 25, quantityForSale: 20, quantityInStorage: 20 }],
    },
    {
        key: 'breaker_out_of_stock',
        type: 'Aptomat', name: 'MCB Schneider A9F74216 16A 2P', brand: 'Schneider',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'A9F74216',
        warranty: '12 tháng', description: 'Aptomat 16A 2P.',
        variant: [{ price: '310000', earn: 25, quantityForSale: 0, quantityInStorage: 0 }],
    },
    {
        key: 'breaker_6a',
        type: 'Aptomat', name: 'MCB Schneider A9F74206 6A 2P', brand: 'Schneider',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'A9F74206',
        warranty: '12 tháng', description: 'Aptomat 6A 2P.',
        variant: [{ price: '295000', earn: 25, quantityForSale: 15, quantityInStorage: 15 }],
    },
    {
        key: 'breaker_20a',
        type: 'Aptomat', name: 'MCB Schneider A9F74220 20A 2P', brand: 'Schneider',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'A9F74220',
        warranty: '12 tháng', description: 'Aptomat 20A 2P.',
        variant: [{ price: '330000', earn: 25, quantityForSale: 9, quantityInStorage: 9 }],
    },
    {
        key: 'breaker_32a',
        type: 'Aptomat', name: 'MCB Schneider A9F74232 32A 2P', brand: 'Schneider',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'A9F74232',
        warranty: '12 tháng', description: 'Aptomat 32A 2P.',
        variant: [{ price: '360000', earn: 25, quantityForSale: 11, quantityInStorage: 11 }],
    },
    {
        key: 'terminal_block',
        type: 'Cầu Đấu', name: 'Cầu đấu dây 60A 3 mắt', brand: 'Khác',
        section: 'Tủ Điện Điều Khiển', value: 'Vật tư', code: CODE_PREFIX + 'CD-60A-3',
        warranty: '6 tháng', description: 'Cầu đấu dây 60A loại 3 mắt.',
        specifications: 'Dòng định mức: 60A',
        variant: [{ price: '48000', earn: 25, quantityForSale: 40, quantityInStorage: 40 }],
    },
    {
        key: 'inverter_15kw',
        type: 'Biến tần', name: 'Biến tần Schneider ATV320U15N4C 1.5kW 3 Pha 380-500V', brand: 'Schneider',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'ATV320U15N4C',
        warranty: '12 tháng', description: 'Biến tần 1.5kW ba pha.',
        specifications: 'Công suất: 1.5kW; Điện áp: 380-500V; Số pha: 3 pha',
        variant: [{ price: '5200000', earn: 25, quantityForSale: 3, quantityInStorage: 3 }],
    },
    {
        key: 'indicator_lamp',
        type: 'Đèn', name: 'Đèn báo pha xanh 220V phi 22', brand: 'Idec',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'DB-220V-X',
        warranty: '6 tháng', description: 'Đèn báo pha 220V.',
        specifications: 'Điện áp: 220V; Đường kính: 22mm',
        variant: [{ price: '38000', earn: 25, quantityForSale: 60, quantityInStorage: 60 }],
    },
    {
        key: 'hidden_product',
        type: 'PLC', name: 'PLC Siemens nội bộ chưa mở bán', brand: 'Siemens',
        section: 'Tủ Điện Điều Khiển', value: 'Thiết bị', code: CODE_PREFIX + 'HIDDEN',
        warranty: '12 tháng', description: 'Sản phẩm ẩn, không được lộ ra chatbot.',
        display: false,
        variant: [{ price: '1000000', earn: 25, quantityForSale: 3, quantityInStorage: 3 }],
    },
]);

async function seedChatFixtures() {
    await cleanChatFixtures();
    const created = await Product.create(CHAT_PRODUCT_FIXTURES.map((fixture) => {
        const { key, ...document } = fixture;
        return document;
    }));
    resetCatalogCache();
    return new Map(CHAT_PRODUCT_FIXTURES.map((fixture, index) => [fixture.key, created[index]]));
}

async function cleanChatFixtures() {
    await Product.deleteMany({ code: { $regex: '^' + CODE_PREFIX } });
    resetCatalogCache();
}

module.exports = {
    CHAT_PRODUCT_FIXTURES,
    CODE_PREFIX,
    cleanChatFixtures,
    seedChatFixtures,
};
