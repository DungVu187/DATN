const { removeVietnameseTones } = require('../utils/textNormalization');
const { containsPhrase, matchCatalogEntities } = require('./chatCatalog');

const CHAT_INTENTS = Object.freeze([
    'greeting',
    'product_search',
    'price_query',
    'stock_query',
    'similar_product',
    'specification_query',
    'shipping_query',
    'warranty_query',
    'policy_query',
    'human_handoff',
    'order_status_query',
    'nonsense_query',
    'out_of_scope',
]);

/** Nhiệm vụ nội bộ: quyết định nhánh trả lời, không lộ ra API công khai. */
const CHAT_TASKS = Object.freeze(['search', 'advice', 'compare', 'details', 'general_support']);

/** Trường dữ kiện khách đang hỏi; một câu có thể hỏi nhiều trường cùng lúc. */
const REQUESTED_FIELDS = Object.freeze([
    'price', 'stock', 'warranty', 'specifications', 'features', 'alternatives', 'policy',
]);

const CHAT_RESOLUTIONS = Object.freeze(['resolved', 'ambiguous', 'not_found', 'out_of_scope']);

/**
 * Danh sách dự phòng cho classifier đồng bộ (không có catalog trong tay).
 * Danh mục thật luôn lấy động từ DB qua chatCatalog; đây chỉ là lưới an toàn.
 */
const FALLBACK_DOMAIN_WORDS = Object.freeze([
    'san pham', 'hang hoa', 'plc', 'relay', 'ro le', 'contactor', 'aptomat', 'bien tan',
    'module', 'siemens', 'mitsubishi', 'schneider', 'idec', 'omron', 'autonics', 'airtac',
    'delta', 'cam bien', 'nut nhan', 'cau dau', 'xy lanh', 'xi lanh', 'van dien tu',
    'van khi nen', 'nguon', 'loadcell', 'thiet bi',
]);

// Từ khóa ngành chỉ dùng để KHÔNG vội chốt ngoài phạm vi; danh mục thật vẫn lấy từ DB.
const INDUSTRY_CONTEXT_PHRASES = Object.freeze([
    'tu dien', 'tu dieu khien', 'dong co', 'bang tai', 'may nen khi', 'tram tron',
    'day chuyen', 'khi nen', 'dieu khien', 'servo', 'inverter', 'bom', 'motor',
    'dien 3 pha', '3 pha', '1 pha', 'dong luc', 'cong nghiep', 'tu ban dien',
]);

const AMBIGUOUS_PHRASES = Object.freeze([
    ['danh gia san pham', 'productreview'],
    ['danh gia', 'productreview'],
    ['gia han', 'renew'],
]);

const GREETING_PHRASES = Object.freeze(['xin chao', 'chao ban', 'chao nova', 'hello', 'hi', 'hey', 'alo', 'chao']);

/**
 * Danh từ chỉ đơn hàng.
 *
 * KHÔNG được để 'don' đứng một mình: `containsPhrase` khớp trọn cụm theo ranh giới
 * khoảng trắng, nên ' don ' sẽ dính luôn 'don gia', 'don vi', 'don chiec', 'don gian'.
 * Cũng vì luật ranh giới đó mà danh sách cũ ('ma don', 'kiem tra don', 'tra cuu don'...)
 * chết ngay khi khách viết "đơn hàng" — chữ 'hang' chen vào làm vỡ cụm.
 */
const ORDER_NOUNS = Object.freeze([
    'don hang', 'don mua', 'don dat', 'don cua toi', 'don cua minh', 'don cua em',
    'trang thai don', 'ma don',
]);

/** Hàng đã mua nhưng khách không nhắc chữ "đơn"; phải đi kèm ORDER_STATE_PHRASES. */
const ORDER_OWNED_GOODS = Object.freeze([
    'hang cua toi', 'hang cua minh', 'hang toi dat', 'hang da dat', 'dat hang roi', 'da dat hang',
]);

/**
 * "đơn" trơ trọi chỉ tính là đơn hàng khi đi cùng động từ tra cứu và không đứng
 * trước một trong các từ ghép bên dưới — "kiểm tra đơn giá" không phải hỏi đơn hàng.
 */
const ORDER_LOOKUP_VERBS = Object.freeze(['xem', 'kiem tra', 'tra cuu', 'theo doi', 'check', 'coi']);
const ORDER_NOUN_FALSE_FRIENDS = Object.freeze([
    'don gia', 'don vi', 'don chiec', 'don gian', 'don le', 'don doc', 'don hang loat',
]);

const ORDER_STATE_PHRASES = Object.freeze([
    'den dau', 'toi dau', 'sao roi', 'giao chua', 'da giao chua', 'chua thay', 'chua nhan',
]);

const ORDER_HISTORY_PHRASES = Object.freeze([
    'lich su mua hang', 'lich su don hang', 'don da dat', 'don dat truoc',
]);

const ORDER_CANCEL_PHRASES = Object.freeze(['huy don', 'huy don hang', 'bo don']);

/** Hỏi chính sách thì để policy_query trả lời, đừng kéo sang tra đơn cá nhân. */
const ORDER_POLICY_OVERRIDE = Object.freeze(['chinh sach', 'dieu khoan']);

/** Số điện thoại khách tự khai: không bao giờ tra đơn theo đó, đẩy sang nhân viên. */
const PHONE_LOOKUP_PATTERN = /\b\d{9,11}\b/;

const HUMAN_PHRASES = Object.freeze([
    'nhan vien', 'gap nguoi', 'tu van vien', 'hotline', 'so dien thoai',
    'lien he truc tiep', 'gap ai do', 'nhan vien lien he',
]);

const POLICY_PHRASES = Object.freeze([
    'chinh sach', 'huy don', 'bao mat', 'thong tin ca nhan', 'du lieu ca nhan', 'dieu khoan',
    // Hỏi hóa đơn/thanh toán là việc mua hàng của NOVA, không phải "ngoài phạm vi".
    // Không để trần từ "vat" vì trùng token với "vật tư".
    'hoa don', 'hoa don do', 'hoa don vat', 'xuat hoa don', 'thue vat', 'xuat vat',
    'thanh toan', 'chuyen khoan', 'tra gop', 'dat coc', 'cong no',
]);

const SHIPPING_PHRASES = Object.freeze([
    'giao hang', 'giao nhan', 'van chuyen', 'phi ship', 'thoi gian giao', 'ship',
]);

const RETURN_PHRASES = Object.freeze(['doi tra', 'tem bao hanh', 'sua chua']);

const PRICE_PHRASES = Object.freeze(['gia', 'gia ban', 'gia bao nhieu', 'bao nhieu tien', 'chi phi', 'bao tien', 'don gia']);
const STOCK_PHRASES = Object.freeze(['con hang', 'het hang', 'ton kho', 'so luong', 'con may cai', 'co san khong', 'con bao nhieu', 'san hang', 'con hang khong', 'so luong con', 'con may']);
/**
 * Xin đọc bảng thông số: khách gọi thẳng tên tài liệu.
 * Tách khỏi cụm đơn vị bên dưới vì "công suất/điện áp" phần lớn là khách NÊU RÀNG BUỘC
 * ("đồng hồ đo điện áp 3 pha, loại nào dễ đọc") chứ không xin datasheet — đổ nguyên bảng
 * thông số ra là trả lời lạc đề.
 */
const EXPLICIT_SPEC_PHRASES = Object.freeze(['thong so', 'ky thuat', 'cau hinh', 'kich thuoc', 'specification', 'so chan']);
const CONSTRAINT_SPEC_PHRASES = Object.freeze(['cong suat', 'dien ap', 'dong dien']);
const SPEC_PHRASES = Object.freeze([...EXPLICIT_SPEC_PHRASES, ...CONSTRAINT_SPEC_PHRASES]);
const FEATURE_PHRASES = Object.freeze(['tinh nang', 'cong dung', 'dung de lam gi', 'lam duoc gi', 'dung lam gi', 'chuc nang']);
const ALTERNATIVE_PHRASES = Object.freeze(['tuong tu', 'thay the', 'loai nao khac', 'san pham khac', 'tuong duong', 'hang khac']);
const WARRANTY_PHRASES = Object.freeze(['bao hanh']);

const COMPARE_PHRASES = Object.freeze([
    'so sanh', 'khac nhau', 'khac gi', 'cai nao tot hon', 'cai nao re hon', 're hon',
    'tot hon', 'hai cai nay', '2 cai nay', 'ca hai', 'nen mua cai nao',
]);

/** Câu tư vấn rõ ràng: thắng cả khi câu có kèm từ giá/tồn. */
const STRONG_ADVICE_PHRASES = Object.freeze([
    'nen chon', 'nen dung', 'tu van', 'loai nao', 'phu hop', 'goi y',
    'giup toi chon', 'chon loai nao', 'nen mua gi', 'can loai nao',
    // "chọn dòng nào", "lấy mã nào" cũng là xin tư vấn chọn hàng.
    'dong nao', 'chon dong nao', 'ma nao', 'model nao', 'cai nao hop',
]);

/**
 * Câu nêu nhu cầu mua sắm. Dùng để phân biệt "tôi cần thiết bị ... công suất 15kW"
 * (xin tư vấn chọn hàng) với "thông số kỹ thuật của cái này" (hỏi dữ kiện món đã biết).
 */
const NEED_PHRASES = Object.freeze([
    'toi can', 'minh can', 'em can', 'ben minh can', 'dang can', 'can mua',
    'can tim', 'can thiet bi', 'can bo', 'toi muon', 'minh muon', 'em muon',
    'muon mua', 'muon tim', 'dang tim', 'dang kiem', 'can bao gia',
]);

/** Câu hỏi khả năng dùng được: chỉ vào nhánh tư vấn khi không hỏi dữ kiện cụ thể. */
const WEAK_ADVICE_PHRASES = Object.freeze([
    'dung duoc khong', 'co dung duoc', 'lap duoc khong', 'duoc khong', 'dung cho',
    'thay duoc khong', 'lap thay duoc',
]);

const ADVICE_PHRASES = Object.freeze([...STRONG_ADVICE_PHRASES, ...WEAK_ADVICE_PHRASES]);

const ORDINAL_PHRASES = Object.freeze([
    ['cai dau tien', 1], ['san pham dau tien', 1], ['cai thu nhat', 1], ['san pham thu nhat', 1],
    ['cai thu hai', 2], ['san pham thu hai', 2], ['cai thu 2', 2], ['san pham thu 2', 2],
    ['cai thu ba', 3], ['san pham thu ba', 3], ['cai thu 3', 3], ['san pham thu 3', 3],
    ['cai cuoi', -1], ['san pham cuoi', -1],
]);

const CURRENT_REFERENCE_PHRASES = Object.freeze([
    'san pham nay', 'cai nay', 'mon nay', 'san pham dang xem', 'cai dang xem',
    'ma nay', 'loai nay', 'thiet bi nay', 'con nay',
]);

const PAIR_REFERENCE_PHRASES = Object.freeze(['hai cai nay', '2 cai nay', 'ca hai', 'hai san pham nay', '2 san pham nay']);

/**
 * "cái 1 với cái 2", "mẫu thứ hai", "sản phẩm số 3": vị trí trong danh sách thẻ vừa hiện.
 * Không nhận "loại 3 pha" hay "còn 2 cái" — "loại"/"còn" đứng trước số là thông số/số lượng.
 */
const ORDINAL_REFERENCE_PATTERN = /\b(?:cai|san pham|mau|mon|thiet bi)\s+(?:thu\s+|so\s+)?(\d|nhat|hai|ba|bon|tu|nam|dau tien|cuoi cung|cuoi)\b(?!\s*(?:pha|kw|hp|a|v|vdc|vac|cuc|p)\b)/g;
const ORDINAL_WORDS = Object.freeze({
    nhat: 1, 'dau tien': 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, cuoi: -1, 'cuoi cung': -1,
});

function findOrdinalReferences(normalized) {
    const ordinals = [];
    for (const match of String(normalized || '').matchAll(ORDINAL_REFERENCE_PATTERN)) {
        const raw = match[1];
        const value = /^\d$/.test(raw) ? Number(raw) : ORDINAL_WORDS[raw];
        if (Number.isInteger(value) && value !== 0 && !ordinals.includes(value)) ordinals.push(value);
    }
    return ordinals;
}

/**
 * Câu cảm ơn / xác nhận ngắn ("cảm ơn nhé", "ok", "vâng"). Trước đây rơi vào "ngoài phạm vi"
 * và nhận câu "Mình chỉ hỗ trợ sản phẩm..." — trả lời như máy với một lời cảm ơn.
 */
const THANKS_WORDS = Object.freeze(new Set(['cam', 'on', 'thank', 'thanks', 'thankyou', 'you', 'tks', 'thanh', 'kiu']));
const ACK_WORDS = Object.freeze(new Set([
    'ok', 'oke', 'okay', 'okie', 'okela', 'vang', 'da', 'u', 'uh', 'um', 'duoc', 'roi', 'dc', 'hieu', 'tot', 'tuyet',
]));
const SMALL_TALK_FILLER = Object.freeze(new Set([
    'nhe', 'nha', 'a', 'ah', 'ban', 'shop', 'nhieu', 'lam', 'minh', 'em', 'anh', 'chi', 'nova', 'ad', 'voi', 'qua',
]));

function detectSmallTalk(normalized) {
    const words = String(normalized || '').split(' ').filter(Boolean);
    if (words.length === 0 || words.length > 6) return null;
    const known = words.every((word) => THANKS_WORDS.has(word) || ACK_WORDS.has(word) || SMALL_TALK_FILLER.has(word));
    if (!known) return null;
    if (containsPhrase(normalized, 'cam on') || words.some((word) => ['thank', 'thanks', 'thankyou', 'tks'].includes(word))) {
        return 'thanks';
    }
    return words.some((word) => ACK_WORDS.has(word)) ? 'ack' : null;
}

function normalizeMessage(message) {
    return removeVietnameseTones(String(message || ''))
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const containsAny = (value, phrases) => phrases.some((phrase) => containsPhrase(value, phrase));

/**
 * Nhận diện câu hỏi về đơn hàng của chính khách.
 *
 * Trả `null` nếu không phải, ngược lại trả `{ action }` để controller biết khách
 * đang hỏi trạng thái hay xin hủy. Hai lớp chặn bắt buộc giữ:
 *   - hỏi chính sách  -> nhường policy_query
 *   - có số điện thoại -> nhường human_handoff, không tra đơn theo số khách tự khai
 */
function detectOrderSignal(normalized) {
    const wantsCancel = containsAny(normalized, ORDER_CANCEL_PHRASES);
    const hasBareOrderNoun = containsPhrase(normalized, 'don')
        && containsAny(normalized, ORDER_LOOKUP_VERBS)
        && !containsAny(normalized, ORDER_NOUN_FALSE_FRIENDS);
    const hasOrderNoun = containsAny(normalized, ORDER_NOUNS)
        || hasBareOrderNoun
        || containsAny(normalized, ORDER_HISTORY_PHRASES)
        || wantsCancel
        || (containsAny(normalized, ORDER_OWNED_GOODS) && containsAny(normalized, ORDER_STATE_PHRASES));
    if (!hasOrderNoun) return null;

    if (containsAny(normalized, ORDER_POLICY_OVERRIDE)) return null;
    if (containsAny(normalized, HUMAN_PHRASES) || PHONE_LOOKUP_PATTERN.test(normalized)) return null;

    return { action: wantsCancel ? 'cancel' : 'status' };
}

function applyAmbiguousPhrases(normalized) {
    let result = normalized;
    AMBIGUOUS_PHRASES.forEach(([phrase, replacement]) => { result = result.split(phrase).join(replacement); });
    return result;
}

/**
 * "còn bao nhiêu cái" là tồn kho, "giá bao nhiêu / bao nhiêu tiền" là giá.
 * Khi chỉ có "bao nhiêu" trơ trọi thì không đoán, để tầng trên hỏi lại.
 */
function resolveHowManyField(normalized) {
    if (!containsPhrase(normalized, 'bao nhieu')) return null;
    if (/\bgia\s+(?:la\s+)?bao nhieu\b/.test(normalized) || /\bbao nhieu\s+(?:tien|d|dong|vnd)\b/.test(normalized)) return 'price';
    if (/\b(?:con|con lai|so luong|ton)\s+(?:khoang\s+)?bao nhieu\b/.test(normalized)) return 'stock';
    if (/\bbao nhieu\s+(?:cai|chiec|san pham|bo|con|thanh|chiec)\b/.test(normalized)) return 'stock';
    return null;
}

function detectRequestedFields(normalized) {
    const fields = new Set();
    const howMany = resolveHowManyField(normalized);
    if (howMany) fields.add(howMany);

    if (containsAny(normalized, PRICE_PHRASES.filter((phrase) => phrase !== 'gia')) || /\bgia\b/.test(normalized)) fields.add('price');
    // "Còn <món> không?" là câu hỏi tồn kho dù không có từ "hàng".
    if (containsAny(normalized, STOCK_PHRASES) || /\bcon\b[^]*\bkhong\b\s*$/.test(normalized)) fields.add('stock');
    // "rẻ hơn / đắt hơn" là so sánh giá.
    if (/\b(?:re|dat)\s+hon\b/.test(normalized)) fields.add('price');
    if (containsAny(normalized, WARRANTY_PHRASES)) fields.add('warranty');
    if (containsAny(normalized, SPEC_PHRASES)) fields.add('specifications');
    if (containsAny(normalized, FEATURE_PHRASES)) fields.add('features');
    if (containsAny(normalized, ALTERNATIVE_PHRASES)) fields.add('alternatives');
    if (containsAny(normalized, POLICY_PHRASES) || containsAny(normalized, SHIPPING_PHRASES) || containsAny(normalized, RETURN_PHRASES)) fields.add('policy');

    return [...fields].filter((field) => REQUESTED_FIELDS.includes(field));
}

/** Khách có thật sự xin bảng thông số hay chỉ đang nêu ràng buộc kỹ thuật. */
function hasExplicitSpecRequest(normalized) {
    return containsAny(String(normalized || ''), EXPLICIT_SPEC_PHRASES);
}

/** Bảo hành chung (chính sách) khác thời hạn bảo hành của một món. */
function detectWarrantyScope(normalized, hasReference) {
    if (!containsPhrase(normalized, 'bao hanh')) return null;
    const asksPolicy = containsPhrase(normalized, 'chinh sach bao hanh')
        || containsPhrase(normalized, 'chinh sach')
        || containsAny(normalized, RETURN_PHRASES);
    const asksProduct = /\bbao hanh\s+(?:may|bao lau|den khi nao|trong bao lau)\b/.test(normalized)
        || containsPhrase(normalized, 'thoi han bao hanh')
        || containsPhrase(normalized, 'bao hanh bao lau')
        || hasReference;
    if (asksPolicy && asksProduct) return 'both';
    if (asksPolicy) return 'policy';
    if (asksProduct) return 'product';
    return 'policy';
}

function detectReference(normalized) {
    if (containsAny(normalized, PAIR_REFERENCE_PHRASES)) return { kind: 'pair', ordinal: null };
    // Nhắc hai vị trí trở lên ("so sánh cái 1 với cái 2") là chỉ đích danh một cặp trong danh sách.
    const ordinals = findOrdinalReferences(normalized);
    if (ordinals.length >= 2) return { kind: 'ordinals', ordinal: null, ordinals: ordinals.slice(0, 3) };
    if (ordinals.length === 1) return { kind: 'ordinal', ordinal: ordinals[0] };
    const ordinal = ORDINAL_PHRASES.find(([phrase]) => containsPhrase(normalized, phrase));
    if (ordinal) return { kind: 'ordinal', ordinal: ordinal[1] };
    if (containsPhrase(normalized, 'san pham dang xem') || containsPhrase(normalized, 'cai dang xem')) {
        return { kind: 'current_page', ordinal: null };
    }
    if (containsAny(normalized, CURRENT_REFERENCE_PHRASES)) return { kind: 'contextual', ordinal: null };
    return { kind: 'none', ordinal: null };
}

function detectTask(normalized, { fields, hasEntity, reference = { kind: 'none' } }) {
    if (containsAny(normalized, COMPARE_PHRASES)) return 'compare';
    // Hỏi món thay thế là đi tìm hàng, không phải tư vấn nhu cầu.
    if (fields.includes('alternatives')) return 'search';
    if (containsAny(normalized, STRONG_ADVICE_PHRASES)) return 'advice';
    // Nêu nhu cầu kèm thông số mà chưa chỉ ra món nào ("tôi cần thiết bị đóng cắt,
    // điện áp 380V, công suất 15kW") là xin tư vấn chọn hàng, không phải tra thông số món đã biết.
    const specOnlyFields = fields.length > 0
        && fields.every((field) => field === 'specifications' || field === 'features');
    if (specOnlyFields && !hasEntity && reference.kind === 'none' && containsAny(normalized, NEED_PHRASES)) {
        return 'advice';
    }
    // Hỏi dữ kiện cụ thể thì trả dữ kiện; câu "dùng được không" mới vào nhánh tư vấn.
    if (fields.some((field) => ['price', 'stock', 'warranty', 'specifications', 'features'].includes(field))) return 'details';
    if (containsAny(normalized, WEAK_ADVICE_PHRASES)) return 'advice';
    if (hasEntity) return 'search';
    // Câu có ngữ cảnh ngành vẫn là yêu cầu hàng hóa, không phải hỗ trợ chung.
    if (hasIndustryContext(normalized)) return 'search';
    return 'general_support';
}

/** Từ được phép xuất hiện trong một lời chào thuần: chào hỏi + xưng hô, không có yêu cầu thực chất. */
const GREETING_ONLY_WORDS = Object.freeze(new Set([
    ...GREETING_PHRASES.flatMap((phrase) => phrase.split(' ')),
    'ban', 'nova', 'shop', 'ad', 'a', 'ah', 'em', 'anh', 'chi', 'oi', 'nhe', 'nha',
]));

function isGreetingOnly(normalized) {
    if (!normalized) return false;
    const words = normalized.split(' ').filter(Boolean);
    if (words.length > 5) return false;
    return GREETING_PHRASES.some((phrase) => normalized === phrase || normalized.startsWith(phrase + ' '))
        && words.every((word) => GREETING_ONLY_WORDS.has(word));
}

function hasIndustryContext(normalized) {
    return containsAny(normalized, INDUSTRY_CONTEXT_PHRASES);
}

/**
 * Intent công khai giữ nguyên hợp đồng cũ với frontend, evaluator và lịch sử chat.
 * Thứ tự kiểm tra được sắp lại để lời chào không nuốt yêu cầu thực chất.
 */
function classifyChatIntent(message) {
    const rawNormalized = normalizeMessage(message);
    // "ok" chỉ có 2 ký tự nên phải xét trước ngưỡng độ dài của câu vô nghĩa.
    if (detectSmallTalk(rawNormalized)) return 'greeting';
    if (!rawNormalized || rawNormalized.length < 2) return 'nonsense_query';
    const normalized = applyAmbiguousPhrases(rawNormalized);

    if (detectOrderSignal(normalized)) return 'order_status_query';
    if (containsAny(normalized, HUMAN_PHRASES)) return 'human_handoff';
    // Các cách nói tự nhiên về nhu cầu mua/tư vấn phải vào luồng thu thập nhu cầu.
    if (containsAny(normalized, STRONG_ADVICE_PHRASES)) return 'product_search';

    const reference = detectReference(normalized);
    const fields = detectRequestedFields(normalized);
    const warrantyScope = detectWarrantyScope(normalized, reference.kind !== 'none');

    if (warrantyScope === 'policy' || warrantyScope === 'both') return 'warranty_query';
    if (containsAny(normalized, SHIPPING_PHRASES)) return 'shipping_query';
    // "Đổi trả thế nào nếu hàng lỗi" là hỏi chính sách đổi trả, không phải hỏi một món cụ thể.
    if ((containsAny(normalized, POLICY_PHRASES) || containsAny(normalized, RETURN_PHRASES))
        && !fields.some((field) => ['price', 'stock', 'specifications'].includes(field))) {
        return 'policy_query';
    }
    if (warrantyScope === 'product') return 'warranty_query';

    if (fields.includes('price')) return 'price_query';
    if (fields.includes('stock')) return 'stock_query';
    if (fields.includes('alternatives')) return 'similar_product';
    if (fields.includes('specifications') || fields.includes('features')) return 'specification_query';

    if (isGreetingOnly(normalized)) return 'greeting';
    if (hasIndustryContext(normalized)) return 'product_search';
    if (containsAny(normalized, COMPARE_PHRASES) || containsAny(normalized, ADVICE_PHRASES)) return 'product_search';
    if (containsAny(normalized, FALLBACK_DOMAIN_WORDS)) return 'product_search';

    const hasLetters = /[a-z]/.test(normalized);
    if (!hasLetters || /^[^aeiou]+$/.test(normalized.replace(/\s/g, ''))) return 'nonsense_query';
    // Tiếng Việt không có cụm 4 phụ âm liền nhau; chuỗi gõ bừa thường rơi vào đây.
    if (normalized.split(' ').some((word) => /[^aeiou0-9]{4,}/.test(word))) return 'nonsense_query';
    return 'out_of_scope';
}

function isGeminiRequired(intent) {
    return ['product_search', 'price_query', 'stock_query', 'similar_product', 'specification_query'].includes(intent);
}

/**
 * Phân tích đầy đủ cho tầng điều phối: giữ intent công khai, bổ sung task/fields/entities.
 * Không dùng LLM — luồng chính và nhánh hỏi lại phải chạy được khi thiếu API key.
 */
function analyzeChatMessage(message, { catalog = null, hasStoredFocus = false, currentProductId = null } = {}) {
    const rawNormalized = normalizeMessage(message);
    const normalized = applyAmbiguousPhrases(rawNormalized);
    const entities = matchCatalogEntities(message, catalog);
    const classified = classifyChatIntent(message);
    const reference = detectReference(normalized);
    const hasReferenceSource = hasStoredFocus || Boolean(currentProductId);
    // Classifier đồng bộ không có catalog trong tay; danh mục thật thắng khi hai bên lệch nhau.
    // Câu chỉ vào món đã hiện ("cái đầu tiên có bao nhiêu đầu vào ra") cũng là hỏi hàng,
    // không phải "ngoài phạm vi" chỉ vì câu không nhắc tên nhóm hàng.
    const primaryIntent = (classified === 'out_of_scope' || classified === 'nonsense_query')
        && (entities.hasCatalogMatch || entities.codes.length > 0 || (reference.kind !== 'none' && hasReferenceSource))
        ? 'product_search'
        : classified;
    const requestedFields = detectRequestedFields(normalized);
    const warrantyScope = detectWarrantyScope(normalized, reference.kind !== 'none');
    const hasEntity = entities.hasCatalogMatch || entities.codes.length > 0;
    const task = detectTask(normalized, { fields: requestedFields, hasEntity, reference });

    // Câu có từ tham chiếu ("cái này", "cái thứ hai") chỉ được coi là rõ khi thật sự có nguồn tham chiếu.
    const industrySignal = hasEntity
        || entities.technicalTokens.length > 0
        || (entities.functionalGroups || []).length > 0
        || hasIndustryContext(normalized);

    let resolution = 'resolved';
    let resolutionReason = 'entity_or_reference';

    if (['greeting', 'nonsense_query', 'human_handoff', 'order_status_query', 'policy_query', 'shipping_query'].includes(primaryIntent)) {
        resolution = 'resolved';
        resolutionReason = 'general_support';
    } else if (primaryIntent === 'warranty_query' && warrantyScope === 'policy') {
        resolution = 'resolved';
        resolutionReason = 'policy_warranty';
    } else if (hasEntity) {
        resolution = 'resolved';
        resolutionReason = 'catalog_entity';
    } else if (hasReferenceSource) {
        resolution = 'resolved';
        resolutionReason = 'conversation_reference';
    } else if (industrySignal || task === 'advice' || task === 'compare') {
        // Câu mơ hồ nhưng có thể liên quan ngành: hỏi lại, không chốt ngoài phạm vi.
        resolution = 'ambiguous';
        resolutionReason = industrySignal ? 'industry_signal_without_entity' : 'advice_without_entity';
    } else if (requestedFields.length > 0) {
        resolution = 'ambiguous';
        resolutionReason = 'field_without_object';
    } else {
        resolution = 'out_of_scope';
        resolutionReason = 'no_industry_signal';
    }

    return {
        primaryIntent,
        task,
        hasIndustrySignal: industrySignal,
        requestedFields,
        warrantyScope,
        entities,
        constraints: {
            types: entities.types,
            brands: entities.brands,
            sections: entities.sections,
            technicalTokens: entities.technicalTokens,
            technicalConstraints: entities.technicalConstraints || null,
            functionalGroups: entities.functionalGroups || [],
            functionalTypes: entities.functionalTypes || [],
            codes: entities.codes,
        },
        reference,
        resolution,
        resolutionReason,
        // 'status' | 'cancel' khi khách hỏi về đơn của mình, null với mọi câu khác.
        orderAction: primaryIntent === 'order_status_query'
            ? (detectOrderSignal(normalized)?.action || 'status')
            : null,
        // 'thanks' | 'ack' | null: lời cảm ơn/xác nhận, trả lời ngay bằng câu có sẵn.
        smallTalk: primaryIntent === 'greeting' ? detectSmallTalk(rawNormalized) : null,
        normalized,
    };
}

module.exports = {
    CHAT_INTENTS,
    CHAT_RESOLUTIONS,
    CHAT_TASKS,
    REQUESTED_FIELDS,
    analyzeChatMessage,
    classifyChatIntent,
    detectReference,
    detectRequestedFields,
    detectSmallTalk,
    detectWarrantyScope,
    findOrdinalReferences,
    hasExplicitSpecRequest,
    isGeminiRequired,
    normalizeMessage,
};
