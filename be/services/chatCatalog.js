const { Product } = require('../models/product');
const { removeVietnameseTones } = require('../utils/textNormalization');

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
// Khi refresh lỗi mà vẫn còn cache cũ, chỉ giữ thêm một khoảng ngắn rồi thử lại.
const CATALOG_STALE_GRACE_MS = 60 * 1000;

class CatalogUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CatalogUnavailableError';
        this.code = 'CATALOG_UNAVAILABLE';
    }
}

/**
 * Alias là kiến thức ngôn ngữ (cách viết khác của cùng một cụm), không thay thế danh mục động.
 * Vế trái đã ở dạng chuẩn hóa nên "rơ le", "rơ-le", "ro le" đều quy về cùng một khóa.
 */
const CATALOG_ALIASES = Object.freeze([
    { alias: 'ro le', canonical: 'relay' },
    { alias: 'role', canonical: 'relay' },
    { alias: 'xi lanh', canonical: 'xy lanh' },
    { alias: 'xilanh', canonical: 'xy lanh' },
    { alias: 'nut bam', canonical: 'nut nhan' },
    { alias: 'khoi dong tu', canonical: 'contactor' },
    { alias: 'congtacto', canonical: 'contactor' },
    // "công tắc tơ" phải thay trước "công tắc"; applyCatalogAliases đã sắp cụm dài lên đầu.
    { alias: 'cong tac to', canonical: 'contactor' },
    { alias: 'cong tac', canonical: 'nut nhan' },
    { alias: 'at to mat', canonical: 'aptomat' },
    { alias: 'atomat', canonical: 'aptomat' },
    { alias: 'cb tep', canonical: 'aptomat' },
    { alias: 'chong dong ro', canonical: 'aptomat' },
    { alias: 'bao ve dong ro', canonical: 'aptomat' },
    { alias: 'bao ve chong dong ro', canonical: 'aptomat' },
    { alias: 'chong ro', canonical: 'aptomat' },
    { alias: 'aptomat chong ro', canonical: 'aptomat' },
    { alias: 'den bao', canonical: 'den' },
    { alias: 'cau dau day', canonical: 'cau dau' },
    { alias: 'domino dien', canonical: 'cau dau' },
    { alias: 'bo nguon', canonical: 'nguon' },
    { alias: 'nguon to ong', canonical: 'nguon' },
    { alias: 'van solenoid', canonical: 'van dien tu' },
    { alias: 'bien ap', canonical: 'bien ap' },
]);

/**
 * Ánh xạ chức năng sử dụng -> nhóm hàng.
 * Khác CATALOG_ALIASES (chỉ là biến thể chính tả của cùng một danh từ): ở đây khách mô tả
 * việc cần làm ("đóng cắt", "bảo vệ") chứ không gọi tên món hàng, nên phải suy ra nhóm.
 * Vế `types` viết ở dạng đã chuẩn hóa và luôn được đối chiếu lại với danh mục thật
 * trong DB trước khi dùng, tránh sinh ra type không tồn tại.
 */
const FUNCTIONAL_GROUPS = Object.freeze([
    {
        group: 'dong cat',
        phrases: Object.freeze([
            'dong cat', 'dong ngat', 'ngat dien', 'cat dien', 'dong mo tiep diem',
            'khoi dong dong co', 'cap nguon cho dong co', 'bat tat dong co',
            // Khách nói đời thường: "bật tắt bơm", "đóng mở quạt", "khởi động máy".
            'bat tat', 'dong mo', 'khoi dong', 'tat mo',
        ]),
        types: Object.freeze(['contactor', 'aptomat', 'relay trung gian']),
    },
    {
        group: 'bao ve pha',
        phrases: Object.freeze(['mat pha', 'nguoc pha', 'lech pha', 'thu tu pha', 'bao ve pha']),
        types: Object.freeze(['bao ve mat nguoc pha']),
        overrides: Object.freeze(['bao ve']),
    },
    {
        group: 'bao ve qua tai',
        phrases: Object.freeze(['chong qua tai', 'qua tai', 'qua dong', 'qua nhiet']),
        types: Object.freeze(['relay nhiet', 'aptomat']),
        overrides: Object.freeze(['bao ve']),
    },
    {
        group: 'bao ve',
        phrases: Object.freeze(['bao ve', 'qua ap', 'ngan mach', 'chong giat', 'su co dien']),
        types: Object.freeze(['aptomat', 'relay nhiet', 'bao ve mat nguoc pha']),
    },
    {
        // Cụm hẹp phải đứng trước và vô hiệu hóa cụm "điều khiển" chung.
        group: 'dieu khien toc do',
        phrases: Object.freeze([
            'dieu khien toc do', 'thay doi toc do', 'doi tan so', 'bien doi tan so',
            'chay bien tan', 'dieu toc',
        ]),
        types: Object.freeze(['bien tan']),
        overrides: Object.freeze(['dieu khien']),
    },
    {
        group: 'dieu khien',
        phrases: Object.freeze([
            'dieu khien', 'lap trinh', 'tu dong hoa', 'hen gio', 'tre thoi gian',
        ]),
        types: Object.freeze(['plc', 'bien tan', 'relay thoi gian', 'nut nhan']),
    },
    {
        group: 'do luong',
        phrases: Object.freeze([
            'do luong', 'do dong', 'do dien ap', 'giam sat',
            'hien thi thong so', 'can dien tu', 'dinh luong', 'do nhiet do',
        ]),
        // "điều khiển tốc độ động cơ" chứa chuỗi "độ động" — chặn để không hiểu nhầm thành "đo dòng".
        blockers: Object.freeze(['toc do dong', 'do dong co', 'toc do']),
        types: Object.freeze(['dong ho', 'ti', 'loadcell', 'cam bien']),
    },
]);

/**
 * Cụm trùng với danh mục nhưng cũng là từ thường dùng ngoài ngành.
 * Chỉ nhận là tín hiệu hàng hóa khi câu có thêm bằng chứng khác.
 */
const AMBIGUOUS_CATALOG_TERMS = Object.freeze(new Set([
    'nguon', 'den', 'delta', 'ti', 'khac', 'taiwan', 'giga', 'dong ho', 'day dien',
]));

/** Cụm chắc chắn không phải hỏi hàng dù chứa từ trùng danh mục. */
const AMBIGUOUS_BLOCKING_PHRASES = Object.freeze({
    nguon: ['nguon tin', 'nguon goc', 'nguon cung', 'nguon nhan luc', 'nguon von', 'nguon luc'],
    den: ['den bu', 'den luot', 'den han', 'den noi'],
    ti: ['ti le', 'ti gia', 'ti do', 'ti phu'],
    giga: ['gigabyte'],
    'dong ho': ['dong ho deo tay', 'dong ho thong minh'],
});

/** Từ ghép tiếng Việt (đã bỏ dấu) trùng chữ đầu của một họ nhóm hàng ("van", "relay"...). */
const FAMILY_HEAD_FALSE_FRIENDS = Object.freeze([
    'tu van', 'van de', 'van ban', 'van phong', 'van hoa', 'van chuyen', 'van hanh', 'van may',
]);

/** Đơn vị kỹ thuật thường gặp: dùng để nhận biết token thông số, không phải mã hàng. */
const TECHNICAL_UNIT_PATTERN = /^\d+(?:[.,]\d+)?(?:v|kv|mv|vdc|vac|kw|w|hp|a|ma|ka|hz|khz|mm|cm|m|bar|mpa|kg|inch|p|ph|pha)$/;

const COMMERCE_SIGNAL_PHRASES = Object.freeze([
    'ban', 'co ban', 'tim', 'mua', 'con', 'gia', 'bao nhieu', 'tu van', 'can',
    'muon', 'bao hanh', 'ton kho', 'het hang', 'con hang', 'thong so', 'san pham',
    'hang', 'loai nao', 'model', 'ma', 'dat hang', 'chon',
]);

function normalizeChatText(value) {
    return removeVietnameseTones(String(value || ''))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function containsPhrase(haystack, phrase) {
    if (!haystack || !phrase) return false;
    return (' ' + haystack + ' ').includes(' ' + phrase + ' ');
}

/** Áp alias lên câu đã chuẩn hóa; cụm dài thay trước để không cắt nhầm cụm ngắn. */
function applyCatalogAliases(normalized) {
    let result = ' ' + normalized + ' ';
    [...CATALOG_ALIASES]
        .sort((first, second) => second.alias.length - first.alias.length)
        .forEach(({ alias, canonical }) => {
            if (alias === canonical) return;
            result = result.split(' ' + alias + ' ').join(' ' + canonical + ' ');
        });
    return result.replace(/\s+/g, ' ').trim();
}

/** Mã hàng: token có cả chữ và số, đủ dài, không phải thông số kỹ thuật. */
function extractCodeCandidates(rawMessage) {
    const source = removeVietnameseTones(String(rawMessage || '')).toLowerCase();
    const tokens = source.match(/[a-z0-9]+(?:[-_/.][a-z0-9]+)*/g) || [];
    const seen = new Set();
    return tokens.filter((token) => {
        if (token.length < 4) return false;
        if (!/[a-z]/.test(token) || !/[0-9]/.test(token)) return false;
        if (TECHNICAL_UNIT_PATTERN.test(token)) return false;
        if (seen.has(token)) return false;
        seen.add(token);
        return true;
    }).slice(0, 5);
}

/** Thông số có đơn vị rõ trong câu hỏi (24V, 1.5kW, 3 pha…). */
function extractTechnicalTokens(normalized) {
    const tokens = String(normalized || '').split(' ').filter(Boolean);
    const found = [];
    tokens.forEach((token, index) => {
        if (TECHNICAL_UNIT_PATTERN.test(token)) {
            found.push(token);
            return;
        }
        const next = tokens[index + 1];
        // Chuẩn hóa đã tách "1.5kW" thành "1" và "5kw"; ghép lại để giữ đúng thông số.
        if (/^\d+$/.test(token) && next && /^\d+(?:v|kv|vdc|vac|kw|w|a|hz|mm|cm|bar)$/.test(next)) {
            found.push(token + '.' + next);
            return;
        }
        if (/^\d+(?:[.,]\d+)?$/.test(token) && next && /^(?:v|kv|vdc|vac|kw|w|a|hz|mm|cm|bar|pha|p)$/.test(next)) {
            found.push(token + next);
        }
    });
    return [...new Set(found)].slice(0, 6);
}

/**
 * Đọc ràng buộc số từ token thông số của khách ("15kw" -> power 15, "380v" -> voltage 380).
 * Chỉ nhận đơn vị dùng được để lọc hàng; kA (dòng cắt) và mA bị bỏ qua vì không phải tiêu chí chọn.
 */
function parseTechnicalConstraints(tokens) {
    const constraints = { power: null, voltage: null, current: null, phase: null };
    (Array.isArray(tokens) ? tokens : []).forEach((token) => {
        const matched = String(token || '').match(/^(\d+(?:[.,]\d+)?)(kv|kw|vdc|vac|hp|v|w|a|pha)$/);
        if (!matched) return;
        const value = Number(String(matched[1]).replace(',', '.'));
        if (!Number.isFinite(value) || value <= 0) return;

        switch (matched[2]) {
            case 'kw': if (constraints.power === null) constraints.power = value; break;
            case 'w': if (constraints.power === null) constraints.power = value / 1000; break;
            case 'hp': if (constraints.power === null) constraints.power = value * 0.746; break;
            case 'kv': if (constraints.voltage === null) constraints.voltage = value * 1000; break;
            case 'v':
            case 'vdc':
            case 'vac': if (constraints.voltage === null) constraints.voltage = value; break;
            case 'a': if (constraints.current === null) constraints.current = value; break;
            case 'pha': if (constraints.phase === null) constraints.phase = value; break;
            default: break;
        }
    });
    return constraints;
}

function hasTechnicalConstraint(constraints) {
    if (!constraints) return false;
    return ['power', 'voltage', 'current'].some((key) => Number.isFinite(constraints[key]) && constraints[key] > 0);
}

/**
 * Suy nhóm hàng từ chức năng khách mô tả.
 * Chỉ quét phần câu CÒN LẠI sau khi đã trừ đi type/brand/section đã khớp, nên
 * "tủ điện điều khiển" (đã nhận là section) không bị hiểu nhầm thành nhu cầu "điều khiển".
 */
function matchFunctionalGroups(remainingRuns, catalog) {
    const runs = (Array.isArray(remainingRuns) ? remainingRuns : []).filter(Boolean);
    if (runs.length === 0) return { groups: [], types: [] };

    // Đối chiếu về tên type thật trong DB; key là dạng đã chuẩn hóa.
    const catalogTypeByNormalized = new Map();
    (catalog?.types || []).forEach((type) => {
        const normalized = normalizeChatText(type);
        if (normalized && !catalogTypeByNormalized.has(normalized)) catalogTypeByNormalized.set(normalized, type);
    });

    const hits = FUNCTIONAL_GROUPS.filter((entry) => {
        const blocked = (entry.blockers || []).some((phrase) => runs.some((run) => containsPhrase(run, phrase)));
        if (blocked) return false;
        return entry.phrases.some((phrase) => runs.some((run) => containsPhrase(run, phrase)));
    });

    // Cụm hẹp thắng cụm rộng: "điều khiển tốc độ" chỉ ra biến tần, không kéo theo cả PLC/nút nhấn.
    const overridden = new Set(hits.flatMap((entry) => entry.overrides || []));
    const effective = hits.filter((entry) => !overridden.has(entry.group));

    const groups = [];
    const types = [];
    effective.forEach((entry) => {
        groups.push(entry.group);
        entry.types.forEach((normalizedType) => {
            const original = catalogTypeByNormalized.get(normalizedType);
            if (original && !types.includes(original)) types.push(original);
        });
    });

    return { groups, types };
}

/**
 * Khách gọi tên rút gọn của cả một họ nhóm hàng: "relay" trong khi DB chỉ có
 * "Relay Nhiệt" / "Relay Thời Gian" / "Relay Trung Gian", hay "van" trong khi DB có
 * "Van khí nén" / "Van điện từ". Khớp chính xác trượt hết, câu hỏi rơi vào nhánh hỏi lại
 * dù khách đã nói rất rõ.
 * Suy ra hoàn toàn từ danh mục thật (không bảng cứng) và chỉ nhận khi từ đầu đó dẫn tới
 * NHIỀU type — một type duy nhất thì đã có khớp chính xác lo, còn từ chung chung như
 * "thiết bị" chỉ dẫn tới đúng "Thiết bị khác" nên bị loại.
 */
function matchTypeFamilies(remainingRuns, catalog) {
    // Bỏ các từ ghép thường ngày trước khi dò từ đầu họ nhóm: "tư vấn", "vận chuyển" bỏ dấu
    // đều chứa "van", từng khiến "mình cần tư vấn" ra danh sách van khí nén.
    const runs = (Array.isArray(remainingRuns) ? remainingRuns : [])
        .filter(Boolean)
        .map((run) => FAMILY_HEAD_FALSE_FRIENDS.reduce(
            (text, phrase) => text.split(' ' + phrase + ' ').join('   '),
            ' ' + run + ' ',
        ).trim())
        .filter(Boolean);
    if (runs.length === 0) return [];

    const familyByHead = new Map();
    (catalog?.types || []).forEach((type) => {
        const normalized = normalizeChatText(type);
        const head = normalized.split(' ')[0];
        if (!head || head.length < 3 || head === normalized) return;
        if (!familyByHead.has(head)) familyByHead.set(head, []);
        familyByHead.get(head).push(type);
    });

    const types = [];
    familyByHead.forEach((familyTypes, head) => {
        if (familyTypes.length < 2) return;
        if (!runs.some((run) => containsPhrase(run, head))) return;
        familyTypes.forEach((type) => {
            if (!types.includes(type)) types.push(type);
        });
    });
    return types;
}

function hasCommerceSignal(normalized) {
    // "Có ... không?" là câu hỏi bên mình có bán hàng đó hay không.
    if (/\bco\b[^]*\bkhong\b/.test(normalized)) return true;
    return COMMERCE_SIGNAL_PHRASES.some((phrase) => containsPhrase(normalized, phrase));
}

function toCatalogEntry(kind, original) {
    const normalized = normalizeChatText(original);
    return {
        kind,
        original: String(original || '').trim(),
        normalized,
        tokenCount: normalized ? normalized.split(' ').length : 0,
        ambiguous: AMBIGUOUS_CATALOG_TERMS.has(normalized),
    };
}

let catalogCache = null;
let catalogInFlight = null;

async function loadCatalogMetadata() {
    const publicFilter = { display: true };
    const [types, brands, sections] = await Promise.all([
        Product.distinct('type', publicFilter),
        Product.distinct('brand', publicFilter),
        Product.distinct('section', publicFilter),
    ]);

    const entries = [
        ...types.filter(Boolean).map((value) => toCatalogEntry('type', value)),
        ...brands.filter(Boolean).map((value) => toCatalogEntry('brand', value)),
        ...sections.filter(Boolean).map((value) => toCatalogEntry('section', value)),
    ].filter((entry) => entry.normalized.length >= 2);

    // Cụm dài khớp trước cụm ngắn để "relay trung gian" không rơi về "relay".
    entries.sort((first, second) => second.tokenCount - first.tokenCount
        || second.normalized.length - first.normalized.length);

    return {
        types: types.filter(Boolean),
        brands: brands.filter(Boolean),
        sections: sections.filter(Boolean),
        entries,
        stale: false,
        capturedAt: new Date().toISOString(),
    };
}

/**
 * Metadata danh mục có cache TTL 5 phút; nhiều request cùng lúc dùng chung một promise.
 * Không cache giá hay tồn kho ở đây.
 */
async function getCatalogMetadata({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && catalogCache && catalogCache.expiresAt > now) return catalogCache.data;
    if (catalogInFlight) return catalogInFlight;

    catalogInFlight = loadCatalogMetadata()
        .then((data) => {
            catalogCache = { data, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS };
            return data;
        })
        .catch((error) => {
            if (catalogCache) {
                // Metadata cũ vẫn dùng được với cờ stale; giá/tồn kho luôn nạp mới ở nơi khác.
                const staleData = { ...catalogCache.data, stale: true };
                catalogCache = { data: staleData, expiresAt: Date.now() + CATALOG_STALE_GRACE_MS };
                return staleData;
            }
            throw new CatalogUnavailableError(error.message || 'Không đọc được danh mục sản phẩm.');
        })
        .finally(() => { catalogInFlight = null; });

    return catalogInFlight;
}

function resetCatalogCache() {
    catalogCache = null;
    catalogInFlight = null;
}

function isBlockedAmbiguousTerm(normalizedMessage, entry) {
    const blockers = AMBIGUOUS_BLOCKING_PHRASES[entry.normalized] || [];
    return blockers.some((phrase) => containsPhrase(normalizedMessage, phrase));
}

/**
 * Nhận diện type/brand/section trong câu hỏi.
 * Cụm đã khớp bị thay bằng khoảng trắng kép nên phần còn lại vẫn giữ được ranh giới cụm.
 */
function matchCatalogEntities(message, catalog) {
    const normalized = normalizeChatText(message);
    const aliased = applyCatalogAliases(normalized);
    const codes = extractCodeCandidates(message);
    const technicalTokens = extractTechnicalTokens(aliased);
    const entries = catalog?.entries || [];

    let working = ' ' + aliased + ' ';
    const matched = [];
    const ambiguousMatches = [];

    const consume = (entry) => {
        working = working.split(' ' + entry.normalized + ' ').join('   ');
        matched.push(entry);
    };

    entries.forEach((entry) => {
        if (!entry.normalized) return;
        // Hãng "Khác" là nhãn gom hàng không rõ hãng, không ai gọi tên nó; còn chữ "khác" thì
        // xuất hiện khắp nơi ("khác gì nhau", "loại khác") và từng biến câu so sánh thành lọc hãng.
        if (entry.normalized === 'khac') return;
        if (!working.includes(' ' + entry.normalized + ' ')) return;
        if (entry.ambiguous) {
            if (isBlockedAmbiguousTerm(aliased, entry)) return;
            ambiguousMatches.push(entry);
            return;
        }
        consume(entry);
    });

    // Cụm mơ hồ chỉ được tính khi câu còn bằng chứng khác (danh mục rõ, mã, thông số, ý định mua bán).
    const hasOtherEvidence = matched.length > 0 || codes.length > 0 || technicalTokens.length > 0;
    ambiguousMatches
        .filter(() => hasOtherEvidence || hasCommerceSignal(aliased))
        .forEach((entry) => {
            if (!working.includes(' ' + entry.normalized + ' ')) return;
            consume(entry);
        });

    const remainingRuns = working
        .split(/\s{2,}/)
        .map((run) => run.trim())
        .filter(Boolean);

    // Nhu cầu theo chức năng là tín hiệu YẾU hơn khớp danh mục trực tiếp: giữ riêng,
    // không gộp vào hasCatalogMatch để không đổi hành vi của các câu đã nhận ra nhóm hàng.
    const functional = matchFunctionalGroups(remainingRuns, catalog);
    // Họ nhóm hàng cũng là tín hiệu yếu, gộp chung đường đi với nhu cầu chức năng.
    const familyTypes = matchTypeFamilies(remainingRuns, catalog);
    const weakTypes = [...functional.types];
    familyTypes.forEach((type) => {
        if (!weakTypes.includes(type)) weakTypes.push(type);
    });

    return {
        normalized,
        aliased,
        codes,
        technicalTokens,
        technicalConstraints: parseTechnicalConstraints(technicalTokens),
        functionalGroups: functional.groups,
        functionalTypes: weakTypes,
        familyTypes,
        types: matched.filter((entry) => entry.kind === 'type').map((entry) => entry.original),
        brands: matched.filter((entry) => entry.kind === 'brand').map((entry) => entry.original),
        sections: matched.filter((entry) => entry.kind === 'section').map((entry) => entry.original),
        matchedPhrases: matched.map((entry) => entry.normalized),
        hasCatalogMatch: matched.length > 0,
        ambiguousOnly: matched.length > 0 && matched.every((entry) => entry.ambiguous),
        remainingRuns,
        remainingTokens: remainingRuns.join(' ').split(' ').filter(Boolean),
        stale: catalog?.stale === true,
    };
}

module.exports = {
    AMBIGUOUS_CATALOG_TERMS,
    CATALOG_ALIASES,
    CATALOG_CACHE_TTL_MS,
    CatalogUnavailableError,
    FUNCTIONAL_GROUPS,
    applyCatalogAliases,
    containsPhrase,
    extractCodeCandidates,
    extractTechnicalTokens,
    getCatalogMetadata,
    hasCommerceSignal,
    hasTechnicalConstraint,
    matchCatalogEntities,
    matchFunctionalGroups,
    matchTypeFamilies,
    normalizeChatText,
    parseTechnicalConstraints,
    resetCatalogCache,
};
