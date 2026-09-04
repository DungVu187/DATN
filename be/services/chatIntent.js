const { removeVietnameseTones } = require('../utils/textNormalization');

const CHAT_INTENTS = Object.freeze([
    'greeting',
    'product_search',
    'price_query',
    'stock_query',
    'similar_product',
    'specification_query',
    'shipping_query',
    'warranty_query',
    'order_status_query',
    'nonsense_query',
    'out_of_scope',
]);

const DOMAIN_WORDS = [
    'san pham', 'hang hoa', 'plc', 'relay', 'contactor', 'aptomat', 'bien tan',
    'module', 'siemens', 'mitsubishi', 'schneider', 'idec', 'omron', 'giao hang',
    'van chuyen', 'bao hanh', 'don hang', 'ton kho', 'thong so', 'ky thuat',
];

const containsAny = (value, words) => words.some((word) => value.includes(word));

function normalizeMessage(message) {
    return removeVietnameseTones(String(message || ''))
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function classifyChatIntent(message) {
    const normalized = normalizeMessage(message);
    if (!normalized || normalized.length < 2) return 'nonsense_query';

    // Xử lý lời chào trước các từ khóa nghiệp vụ để không bị rơi vào ngoài phạm vi.
    const greetingPhrases = ['xin chao', 'chao ban', 'chao nova', 'hello', 'hi', 'hey', 'alo', 'chao'];
    if (greetingPhrases.includes(normalized)) return 'greeting';

    if (containsAny(normalized, ['trang thai don', 'don hang cua toi', 'don cua toi', 'ma don', 'don hang'])) {
        return 'order_status_query';
    }
    if (containsAny(normalized, ['bao hanh', 'doi tra', 'sua chua', 'tem bao hanh'])) {
        return 'warranty_query';
    }
    if (containsAny(normalized, ['giao hang', 'giao nhan', 'van chuyen', 'phi ship', 'thoi gian giao', 'ship'])) {
        return 'shipping_query';
    }
    if (containsAny(normalized, ['tuong tu', 'thay the', 'loai nao khac', 'san pham khac'])) {
        return 'similar_product';
    }
    if (containsAny(normalized, ['thong so', 'ky thuat', 'cau hinh', 'cong suat', 'dien ap', 'kich thuoc', 'specification'])) {
        return 'specification_query';
    }
    if (containsAny(normalized, ['gia', 'bao nhieu tien', 'bao nhieu', 'chi phi', 'gia ban'])) {
        return 'price_query';
    }
    if (containsAny(normalized, ['ton kho', 'con hang', 'het hang', 'so luong con', 'co san khong'])) {
        return 'stock_query';
    }
    if (containsAny(normalized, DOMAIN_WORDS)) return 'product_search';

    const hasLetters = /[a-z]/.test(normalized);
    if (!hasLetters || /^[^aeiou]+$/.test(normalized.replace(/\s/g, ''))) {
        return 'nonsense_query';
    }
    return 'out_of_scope';
}

function isGeminiRequired(intent) {
    return ['product_search', 'price_query', 'stock_query', 'similar_product', 'specification_query']
        .includes(intent);
}

module.exports = {
    CHAT_INTENTS,
    classifyChatIntent,
    isGeminiRequired,
    normalizeMessage,
};
