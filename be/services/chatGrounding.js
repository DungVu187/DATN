/**
 * Kiểm chứng lời tư vấn do model viết trước khi cho khách nhìn thấy.
 *
 * Backend vẫn là nơi duy nhất sở hữu dữ kiện: model được viết câu dẫn cho tự nhiên,
 * nhưng mọi CON SỐ và MÃ HÀNG trong câu phải tìm thấy trong tập bằng chứng backend đưa.
 * Sai một con số là cả đoạn bị bỏ, rơi về template cũ — thà khô khan còn hơn bịa.
 */
const { removeVietnameseTones } = require('../utils/textNormalization');

const MAX_ADVISORY_LENGTH = 600;
// Số đếm nhỏ dùng để dẫn dắt ("3 lựa chọn", "cách 1") không phải dữ kiện sản phẩm.
const MAX_FREE_COUNT = 3;

/**
 * Lời hứa không dữ kiện nào kiểm chứng nổi. Viết ở dạng đã bỏ dấu vì so trên chuỗi chuẩn hóa.
 */
const BANNED_CLAIM_PHRASES = Object.freeze([
    'chac chan tuong thich', 'hoan toan tuong thich', 'chac chan dung duoc', 'dam bao tuong thich',
    'cam ket', 'bao dam 100', 'dam bao 100', 'chinh hang 100',
    'tot nhat thi truong', 're nhat thi truong', 're nhat',
    'mien phi van chuyen', 'freeship', 'khuyen mai', 'giam gia', 'tang kem',
    'bao hanh tron doi', 'vinh vien',
]);

/** Cụm đơn vị đi liền số ("24v", "15kw"): con số đã được kiểm riêng nên không soi như mã hàng. */
const UNIT_SUFFIX_PATTERN = /^\d+(?:[.,]\d+)?(v|vdc|vac|kw|kva|kg|w|a|hz|mm|cm|m|p|no|nc|ma|mpa|bar|inch)$/i;

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g;
// Token vừa có chữ vừa có số: đây là chỗ model dễ bịa ra mã hàng nhất.
const CODE_TOKEN_PATTERN = /[A-Za-zÀ-ỹ]*\d[A-Za-zÀ-ỹ0-9]*(?:[-/][A-Za-zÀ-ỹ0-9]+)*/g;

/**
 * "222.000" là 222000 (phân cách nghìn), còn "1.5" là 1.5 (thập phân).
 * Hai bên so sánh phải dùng chung một cách đọc, nếu không sẽ chặn nhầm số đúng.
 */
function normalizeNumber(raw) {
    const text = String(raw || '').trim().replace(/,/g, '.');
    if (!text) return null;
    if (/^\d{1,3}(\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ''));
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
}

const compact = (value) => removeVietnameseTones(String(value || '')).toLowerCase().replace(/\s+/g, '');

/** Toàn bộ chữ mà backend đã kiểm chứng: sản phẩm, fact/reason, thông tin cửa hàng và chính sách. */
function buildEvidenceCorpus(evidence) {
    const parts = [];
    (evidence?.products || []).forEach((product) => {
        parts.push(product.name, product.code, product.type, product.brand);
    });
    (evidence?.facts || []).forEach((fact) => parts.push(fact.text));
    (evidence?.reasons || []).forEach((reason) => parts.push(reason.text));
    Object.values(evidence?.store || {}).forEach((value) => parts.push(value));
    (evidence?.policies || []).forEach((policy) => {
        parts.push(policy.title, policy.summary);
        (policy.sections || []).forEach((section) => parts.push(section.title, section.content));
    });
    (evidence?.productTypes || []).forEach((type) => parts.push(type));
    return parts.filter((part) => typeof part === 'string' && part).join(' ');
}

function collectAllowedNumbers(corpus, { includeFreeCounts = true } = {}) {
    const allowed = new Set();
    if (includeFreeCounts) {
        for (let count = 1; count <= MAX_FREE_COUNT; count += 1) allowed.add(count);
    }
    (corpus.match(NUMBER_PATTERN) || []).forEach((raw) => {
        const value = normalizeNumber(raw);
        if (value !== null) allowed.add(value);
        // "380-500V" cho phép nhắc cả hai đầu dải lẫn từng phần của số ghép.
        raw.split('.').forEach((piece) => {
            const part = normalizeNumber(piece);
            if (part !== null) allowed.add(part);
        });
    });
    return allowed;
}

/**
 * Soi một đoạn văn do model viết. Trả về text đã làm sạch nếu đạt, chuỗi rỗng nếu không đạt.
 * Nguyên tắc fail-closed: nghi ngờ thì bỏ, vì mất giọng văn nhẹ hơn nhiều so với mất uy tín.
 */
function verifyAdvisoryText(rawText, { evidence, maxLength = MAX_ADVISORY_LENGTH } = {}) {
    const violations = [];
    // Frontend render text thuần nên ký tự markdown chỉ hiện ra thô; bỏ luôn từ đây.
    const text = String(rawText || '')
        .replace(/[*#`_>]+/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!text) return { text: '', violations };
    if (text.length > maxLength) violations.push('qua_dai');

    const normalized = removeVietnameseTones(text).toLowerCase();
    BANNED_CLAIM_PHRASES.forEach((phrase) => {
        if (normalized.includes(phrase)) violations.push('loi_hua:' + phrase);
    });
    if (/https?:\/\/|www\.|@[a-z0-9]/i.test(text)) violations.push('duong_dan_ngoai');

    const corpus = buildEvidenceCorpus(evidence);
    const compactCorpus = compact(corpus);
    const allowedNumbers = collectAllowedNumbers(corpus);

    (text.match(NUMBER_PATTERN) || []).forEach((raw) => {
        const value = normalizeNumber(raw);
        if (value === null || !allowedNumbers.has(value)) violations.push('so_la:' + raw);
    });

    (text.match(CODE_TOKEN_PATTERN) || []).forEach((token) => {
        if (!/[A-Za-zÀ-ỹ]/.test(token) || token.length < 4) return;
        if (UNIT_SUFFIX_PATTERN.test(token)) return;
        if (!compactCorpus.includes(compact(token))) violations.push('ma_la:' + token);
    });

    return { text: violations.length === 0 ? text : '', violations };
}

const MAX_REPLY_TEXT_LENGTH = 1500;

/**
 * Lời hứa bị cấm trong câu trả lời đầy đủ. Khác BANNED_CLAIM_PHRASES ở chỗ không cấm trần
 * "rẻ nhất" hay "giảm giá": khách hỏi "cái nào rẻ nhất" thì so trong danh sách là trả lời đúng,
 * khách hỏi giảm giá thì bot phải được nói "việc giảm giá bạn liên hệ hotline". Chỉ cấm cách nói HỨA.
 */
const BANNED_PROMISE_PHRASES = Object.freeze([
    'chac chan tuong thich', 'hoan toan tuong thich', 'chac chan dung duoc', 'dam bao tuong thich',
    'cam ket', 'bao dam 100', 'dam bao 100', 'chinh hang 100',
    'tot nhat thi truong', 're nhat thi truong',
    'mien phi van chuyen', 'freeship', 'tang kem', 'bao hanh tron doi', 'vinh vien',
    'duoc giam gia', 'se duoc giam', 'duoc chiet khau', 'co chiet khau', 'dang giam gia',
    'dang khuyen mai', 'co chuong trinh khuyen mai', 'uu dai dac biet',
]);

// Số đi liền đơn vị tiền: phải là giá có thật trong DB, không được lấy từ lời khách.
// Không dùng \b sau "đ": trong regex JS "đ" không phải ký tự từ nên \b không bao giờ khớp.
const PRICE_NUMBER_PATTERN = /(\d+(?:[.,]\d+)*)\s*(?:đồng|vnđ|vnd|nghìn|ngàn|triệu|đ|tr|k)(?![a-zà-ỹ])/gi;
// Khách nêu ngân sách ("dưới 1 triệu") thì bot được nhắc lại đúng con số đó.
const BUDGET_CONTEXT_PATTERN = /(?:dưới|trên|khoảng|tầm|ngân sách|tối đa|không quá|từ|đến)\s*$/i;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tên hãng có trong câu mà không nằm trong nguồn nào: dấu hiệu model tự thêm hãng. */
function findUnknownBrands(text, sources, knownBrands) {
    const normalizedText = ' ' + removeVietnameseTones(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    const normalizedSources = ' ' + removeVietnameseTones(sources).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    return (knownBrands || [])
        .map((brand) => removeVietnameseTones(String(brand || '')).toLowerCase().trim())
        // "Khác" là nhãn gom nhóm, không phải tên hãng; tên quá ngắn dễ trùng từ thường.
        .filter((brand) => brand.length >= 3 && brand !== 'khac')
        .filter((brand) => new RegExp(' ' + escapeRegex(brand) + ' ').test(normalizedText))
        .filter((brand) => !normalizedSources.includes(' ' + brand + ' '));
}

/**
 * Soi câu trả lời đầy đủ do model viết (không chỉ câu dẫn).
 * Được nhắc lại điều khách tự nói (mã khách hỏi, "3 pha", "15kW"), nhưng giá tiền, mã hàng,
 * hãng và số điện thoại mà bot khẳng định phải có trong bằng chứng. Fail-closed như verifyAdvisoryText.
 */
function verifyReplyText(rawText, {
    evidence, userTexts = [], knownBrands = [], maxLength = MAX_REPLY_TEXT_LENGTH,
} = {}) {
    const violations = [];
    const text = String(rawText || '')
        .replace(/[*#`_>]+/g, '')
        .replace(/[ \t]+/g, ' ')
        // Model hay viết gạch đầu dòng dính liền câu trước ("...nhé bạn.- Cầu dao"); frontend
        // hiển thị pre-line nên phải tự xuống dòng. Chỉ tách khi "-" đứng sau dấu kết câu,
        // không đụng dải số "380-500V" hay mã "NF63-CV".
        .replace(/([.!?:;])\s*-\s+(?=\S)/g, '$1\n- ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!text) return { text: '', violations: ['rong'] };
    if (text.length > maxLength) violations.push('qua_dai');

    const normalized = removeVietnameseTones(text).toLowerCase();
    BANNED_PROMISE_PHRASES.forEach((phrase) => {
        if (normalized.includes(phrase)) violations.push('loi_hua:' + phrase);
    });
    if (/https?:\/\/|www\.|@[a-z0-9]/i.test(text)) violations.push('duong_dan_ngoai');

    const corpus = buildEvidenceCorpus(evidence);
    const userCorpus = userTexts.filter(Boolean).join(' ');
    const rawSources = corpus + ' ' + userCorpus;
    const compactCorpus = compact(corpus);
    const compactSources = compact(rawSources);
    // Giá chỉ tin số có thật trong bằng chứng: không cộng "số đếm tự do" 1-3, nếu không
    // "báo giá 1 đồng" của khách lọt qua dưới dạng số đếm.
    const evidencePrices = collectAllowedNumbers(corpus, { includeFreeCounts: false });
    const allNumbers = new Set([...collectAllowedNumbers(corpus), ...collectAllowedNumbers(userCorpus)]);
    const userNumbers = collectAllowedNumbers(userCorpus, { includeFreeCounts: false });

    // Số không đọc được thành giá trị (09.0151.3825) thì phải xuất hiện nguyên văn trong nguồn.
    // Không dò chuỗi con với số đọc được: "1" nằm trong gần như mọi đoạn văn, dò kiểu đó là mở cửa.
    const isKnown = (raw, allowed, compactSource) => {
        const value = normalizeNumber(raw);
        if (value !== null) return allowed.has(value);
        return compactSource.includes(compact(raw));
    };

    const priceStarts = new Set();
    for (const match of text.matchAll(PRICE_NUMBER_PATTERN)) {
        priceStarts.add(match.index);
        const before = text.slice(Math.max(0, match.index - 14), match.index);
        const allowed = isKnown(match[1], evidencePrices, compactCorpus)
            || (BUDGET_CONTEXT_PATTERN.test(before) && isKnown(match[1], userNumbers, compact(userCorpus)));
        if (!allowed) violations.push('gia_la:' + match[0].trim());
    }

    for (const match of text.matchAll(NUMBER_PATTERN)) {
        if (priceStarts.has(match.index)) continue;
        if (!isKnown(match[0], allNumbers, compactSources)) violations.push('so_la:' + match[0]);
    }

    (text.match(CODE_TOKEN_PATTERN) || []).forEach((token) => {
        if (!/[A-Za-zÀ-ỹ]/.test(token) || token.length < 4) return;
        if (UNIT_SUFFIX_PATTERN.test(token)) return;
        if (!compactSources.includes(compact(token))) violations.push('ma_la:' + token);
    });

    findUnknownBrands(text, rawSources, knownBrands).forEach((brand) => violations.push('hang_la:' + brand));

    return { text: violations.length === 0 ? text : '', violations };
}

module.exports = {
    BANNED_CLAIM_PHRASES,
    BANNED_PROMISE_PHRASES,
    MAX_ADVISORY_LENGTH,
    MAX_REPLY_TEXT_LENGTH,
    buildEvidenceCorpus,
    normalizeNumber,
    verifyAdvisoryText,
    verifyReplyText,
};
