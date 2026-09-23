const { Product } = require('../models/product');
const { escapeRegex, generateFuzzyCodeRegex } = require('../utils/productSearch');
const { stripSearchEdgeWords } = require('../utils/productSearchTerms');
const { removeVietnameseTones } = require('../utils/textNormalization');
const {
    containsPhrase,
    matchCatalogEntities,
    normalizeChatText,
} = require('./chatCatalog');

const MAX_CANDIDATES = 60;
const MAX_PHRASES = 4;
const MAX_PHRASE_LENGTH = 60;

const PRODUCT_SELECT = 'name code brand type section value description features specifications warranty averageReviews reviewCount purchaseCount variant';

/**
 * Mức độ liên quan theo mục 5.2 kế hoạch:
 * 1 khớp mã/tên rõ, 2 đúng nhóm và mọi ràng buộc, 3 cùng nhóm nhưng thiếu dữ kiện,
 * 4 chỉ trùng từ chung hoặc cùng hãng (bị loại khỏi đáp án trực tiếp).
 */
const RELEVANCE = Object.freeze({
    EXACT: 1,
    CONSTRAINED: 2,
    GROUP_ONLY: 3,
    WEAK: 4,
});

/** Từ ở rìa câu có thể bỏ; danh sách này không chứa token kỹ thuật như "cận", "van", "khí". */
const EXTRA_EDGE_STOPWORDS = new Set([
    'ban', 'muon', 'shop', 'em', 'anh', 'chi', 'a', 'ah', 'hello', 'hi', 'xin',
    'chao', 'vui', 'long', 'lam', 'on', 'duoc', 'nen', 'chon', 'o', 'nay', 'kia',
    'va', 'hay', 'nua', 'them', 'khong', 'co', 'toi', 'minh', 'them',
]);

const DIACRITIC_GROUPS = Object.freeze({
    a: 'aàáảãạăằắẳẵặâầấẩẫậ',
    e: 'eèéẻẽẹêềếểễệ',
    i: 'iìíỉĩị',
    o: 'oòóỏõọôồốổỗộơờớởỡợ',
    u: 'uùúủũụưừứửữự',
    y: 'yỳýỷỹỵ',
    d: 'dđ',
});

/** Regex bỏ qua dấu: cho phép gõ không dấu vẫn khớp dữ liệu có dấu trong DB. */
function buildDiacriticPattern(phrase) {
    return String(phrase || '')
        .slice(0, MAX_PHRASE_LENGTH)
        .split('')
        .map((character) => {
            if (character === ' ') return '[\\s\\-_.]+';
            const group = DIACRITIC_GROUPS[character];
            return group ? '[' + group + ']' : escapeRegex(character);
        })
        .join('');
}

function buildPhraseCondition(phrase) {
    const pattern = buildDiacriticPattern(phrase);
    if (!pattern) return null;
    const regex = { $regex: pattern, $options: 'i' };
    return {
        $or: [
            { name: regex },
            { nameUnsigned: regex },
            { code: regex },
            { type: regex },
            { brand: regex },
            { value: regex },
            { description: regex },
            { features: regex },
            { specifications: regex },
        ],
    };
}

function stripEdgeWords(run) {
    let tokens = stripSearchEdgeWords(run);
    while (tokens.length > 0 && EXTRA_EDGE_STOPWORDS.has(tokens[0])) tokens = tokens.slice(1);
    while (tokens.length > 0 && EXTRA_EDGE_STOPWORDS.has(tokens[tokens.length - 1])) tokens = tokens.slice(0, -1);
    return tokens;
}

/** Ngân sách chỉ nhận khi khách nêu con số rõ ràng kèm đơn vị tiền. */
function extractBudget(normalized) {
    const millionMatch = normalized.match(/(?:duoi|khoang|tam|toi da|khong qua)?\s*(\d+(?:[.,]\d+)?)\s*(trieu|tr|nghin|k)\b/);
    if (!millionMatch) return null;
    const amount = Number(String(millionMatch[1]).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const unit = millionMatch[2];
    const multiplier = unit === 'trieu' || unit === 'tr' ? 1000000 : 1000;
    const isMaximum = /(?:duoi|toi da|khong qua)\s*\d/.test(normalized) || containsPhrase(normalized, 'duoi');
    return { maxPrice: amount * multiplier, isMaximum };
}

/**
 * Phân tích câu hỏi thành thực thể và ràng buộc.
 * Cụm danh mục/alias/mã được nhận trước khi bỏ từ xã giao ở rìa câu.
 */
function analyzeRetrievalQuery(message, catalog) {
    const entities = matchCatalogEntities(message, catalog);
    const phrases = entities.remainingRuns
        .map(stripEdgeWords)
        .filter((tokens) => tokens.length > 0)
        .map((tokens) => tokens.join(' '))
        .filter((phrase) => phrase.length >= 2 && !/^\d+$/.test(phrase))
        .slice(0, MAX_PHRASES);

    return {
        ...entities,
        phrases,
        budget: extractBudget(entities.aliased),
        hasProductSignal: entities.hasCatalogMatch || entities.codes.length > 0,
    };
}

function buildRetrievalFilter(analysis, { includePhrases = true } = {}) {
    const filter = { display: true };
    if (analysis.types.length > 0) filter.type = { $in: analysis.types };
    if (analysis.brands.length > 0) filter.brand = { $in: analysis.brands };

    const conditions = [];
    if (includePhrases) {
        analysis.phrases.forEach((phrase) => {
            const condition = buildPhraseCondition(phrase);
            if (condition) conditions.push(condition);
        });
    }
    if (conditions.length > 0) filter.$and = conditions;
    return filter;
}

async function runCandidateQuery(filter) {
    // Phải sắp xếp trước khi cắt: không có sort thì Mongo trả về theo thứ tự tự nhiên, nên khi
    // số món khớp vượt MAX_CANDIDATES, cùng một câu hỏi có thể ra tập ứng viên khác nhau giữa
    // các lần chạy — hàng đúng rơi ra ngoài mà không ai biết. Xếp hạng thật vẫn chạy sau đó.
    return Product.find(filter)
        .select(PRODUCT_SELECT)
        .sort({ purchaseCount: -1, _id: 1 })
        .limit(MAX_CANDIDATES)
        .lean();
}

/** Mã đầy đủ chính xác ưu tiên nhất, sau đó mới tới dạng bỏ dấu phân cách. */
async function lookupProductCodes(codes) {
    const found = [];
    const missing = [];
    const near = [];

    for (const code of codes) {
        const exact = await Product.findOne({
            display: true,
            code: { $regex: '^' + escapeRegex(code) + '$', $options: 'i' },
        }).select(PRODUCT_SELECT).lean();
        if (exact) {
            found.push({ code, product: exact });
            continue;
        }

        const fuzzy = generateFuzzyCodeRegex(code);
        const relaxed = fuzzy
            ? await Product.findOne({ display: true, code: { $regex: '^' + fuzzy.source + '$', $options: 'i' } })
                .select(PRODUCT_SELECT).lean()
            : null;
        if (relaxed) {
            found.push({ code, product: relaxed });
            continue;
        }

        // Mã gần giống chỉ để nói rõ "đây là mã khác", không được coi là hàng thay thế.
        const similar = fuzzy
            ? await Product.find({ display: true, code: { $regex: fuzzy.source, $options: 'i' } })
                .select(PRODUCT_SELECT).limit(3).lean()
            : [];
        missing.push(code);
        similar.forEach((product) => near.push({ requestedCode: code, product }));
    }

    return { found, missing, near };
}

/**
 * Đọc thông số số học ra khỏi dữ liệu sản phẩm.
 * Phải dùng regex dung sai đơn vị chứ không parse key-value, vì `specifications` là chuỗi thô
 * với ít nhất 3 định dạng khác nhau ("K: V" xuống dòng, "- K: V", "K: V; K: V") và đơn vị
 * viết loạn ("1.5kW" / "1.5 kW", "24VDC" / "24 V DC", "380-500V" / "380V - 480V AC").
 * `name` được ưu tiên vì nhiều sản phẩm có specs sinh tự động không đáng tin.
 */
function extractNumbersByUnit(text, unitPattern) {
    const found = [];
    const regex = new RegExp('(\\d+(?:[.,]\\d+)?)\\s*(?:' + unitPattern + ')\\b', 'gi');
    let matched = regex.exec(text);
    while (matched) {
        const value = Number(String(matched[1]).replace(',', '.'));
        if (Number.isFinite(value) && value > 0) found.push(value);
        matched = regex.exec(text);
    }
    return found;
}

function extractProductSpecNumbers(product) {
    // Bỏ dấu nhưng GIỮ dấu chấm/gạch nối: "1.5kW" phải còn nguyên, và "vòng" -> "vong"
    // để không bị đọc nhầm thành đơn vị vôn.
    const text = removeVietnameseTones(
        [product?.name, product?.specifications, product?.features].filter(Boolean).join(' '),
    ).toLowerCase();
    if (!text) return { powers: [], voltages: [], currents: [] };

    const powers = extractNumbersByUnit(text, 'kw');
    // "2hp" quy về kW để so cùng thang.
    extractNumbersByUnit(text, 'hp').forEach((value) => powers.push(value * 0.746));

    return {
        powers,
        voltages: extractNumbersByUnit(text, 'v\\s*(?:dc|ac)?'),
        // "25kA" (dòng cắt ngắn mạch) tự động không khớp vì có chữ "k" chen giữa số và "a".
        currents: extractNumbersByUnit(text, 'a'),
    };
}

/** Khớp đúng ăn điểm cao, khớp xấp xỉ ăn điểm thấp, không đọc được số thì 0 — không phạt. */
function scoreTechnicalDimension(wanted, found, exactScore, nearScore) {
    if (!Number.isFinite(wanted) || wanted <= 0 || found.length === 0) return 0;
    const bestRatio = found.reduce((best, value) => {
        if (!Number.isFinite(value) || value <= 0) return best;
        const ratio = value >= wanted ? wanted / value : value / wanted;
        return Math.max(best, ratio);
    }, 0);
    if (bestRatio >= 0.999) return exactScore;
    if (bestRatio >= 0.8) return nearScore;
    return 0;
}

/**
 * Điểm khớp thông số: CỘNG ĐIỂM xếp hạng chứ không lọc cứng.
 * Hơn nửa catalog có `specifications` sinh tự động (số trong đó không đáng tin),
 * lọc cứng sẽ giết nhầm đúng sản phẩm khách cần.
 */
function scoreTechnicalMatch(product, constraints) {
    if (!constraints) return 0;
    const numbers = extractProductSpecNumbers(product);
    return scoreTechnicalDimension(constraints.power, numbers.powers, 10, 5)
        + scoreTechnicalDimension(constraints.voltage, numbers.voltages, 8, 4)
        + scoreTechnicalDimension(constraints.current, numbers.currents, 8, 4);
}

/**
 * Số cực/số pha ghi trong tên hàng ("Aptomat BH-D10 3P 32A", "MCB ... 2P").
 * Chỉ đọc từ `name`: specifications sinh tự động hay ghi "1 pha hoặc 3 pha" nên không dùng được.
 */
function extractProductPoles(product) {
    const text = removeVietnameseTones(String(product?.name || '')).toLowerCase();
    const found = [];
    const regex = /(\d)\s*(?:p|pha|cuc)\b/g;
    let matched = regex.exec(text);
    while (matched) {
        const value = Number(matched[1]);
        if (value >= 1 && value <= 4) found.push(value);
        matched = regex.exec(text);
    }
    return found;
}

/**
 * Khách hỏi "aptomat 2 pha" mà trả về hàng 3P là sai hẳn công năng, không phải sai vặt.
 * Vẫn cộng/trừ điểm chứ không lọc cứng: phần lớn tên hàng không ghi số cực, lọc cứng sẽ
 * quét sạch cả những món đúng nhưng ghi thiếu.
 */
function scorePoleMatch(product, constraints) {
    const wanted = constraints?.phase;
    if (!Number.isFinite(wanted) || wanted <= 0) return 0;
    const poles = extractProductPoles(product);
    if (poles.length === 0) return 0;
    return poles.includes(wanted) ? 6 : -6;
}

/** Từ đệm trong câu nói thường: có mặt ở đâu cũng được, không nói lên khách cần gì. */
const OVERLAP_NOISE_TOKENS = Object.freeze(new Set([
    'loai', 'nao', 'cai', 'cho', 'can', 'mua', 'ban', 'minh', 'shop', 'gia', 'bao', 'nhieu',
    'co', 'khong', 'the', 'nay', 'voi', 'va', 'la', 'duoc', 'gi', 'hang', 'san', 'pham',
    'xem', 'dung', 'them', 'giup', 'toi', 'em', 'anh', 'chi', 'thi', 'ma', 'ra', 'nhe',
    'de', 'khi', 'hay', 'tot', 'hon', 'moi', 'day', 'do', 'ai', 'nen', 'tu', 'van',
]));

/**
 * Điểm trùng từ khóa giữa phần mô tả còn lại của khách và TÊN hàng.
 * Lý do phải có: khi cụm đầy đủ không khớp, retrieval nới ràng buộc rồi mọi ứng viên cùng
 * nhóm trở nên ngang điểm, và tồn kho/lượt mua quyết định thay — khách hỏi "đồng hồ đo ĐIỆN ÁP"
 * lại nhận về "đồng hồ đo dòng điện". Chấm trên `name`/`value` chứ không trên specifications
 * vì hơn nửa catalog có specifications sinh tự động, chữ trong đó không phản ánh món hàng.
 */
function scoreNameOverlap(product, phrases) {
    const tokens = String((phrases || []).join(' ')).split(' ')
        .filter((token) => token.length >= 2 && !/^\d+$/.test(token) && !OVERLAP_NOISE_TOKENS.has(token));
    if (tokens.length === 0) return 0;

    const haystack = ' ' + normalizeChatText([product.name, product.value, product.type].filter(Boolean).join(' ')) + ' ';
    let score = 0;
    tokens.forEach((token, index) => {
        if (haystack.includes(' ' + token + ' ')) score += 1;
        const next = tokens[index + 1];
        // Cụm hai từ ("điện áp") phân biệt được món hàng tốt hơn nhiều so với từ lẻ ("điện").
        if (next && haystack.includes(' ' + token + ' ' + next + ' ')) score += 3;
    });
    return score;
}

function countPhraseHits(product, phrases) {
    if (phrases.length === 0) return 0;
    const haystack = normalizeChatText([
        product.name, product.code, product.type, product.brand, product.value,
        product.description, product.features, product.specifications,
    ].filter(Boolean).join(' '));
    return phrases.filter((phrase) => haystack.includes(phrase)).length;
}

function classifyRelevance(product, analysis, { matchedByCode = false } = {}) {
    if (matchedByCode) return RELEVANCE.EXACT;

    const typeOk = analysis.types.length === 0 || analysis.types.includes(product.type);
    const brandOk = analysis.brands.length === 0 || analysis.brands.includes(product.brand);
    const phraseHits = countPhraseHits(product, analysis.phrases);
    const allPhrases = analysis.phrases.length === 0 || phraseHits === analysis.phrases.length;

    if (!typeOk || !brandOk) return RELEVANCE.WEAK;
    if (analysis.types.length === 0 && analysis.brands.length === 0 && phraseHits === 0) return RELEVANCE.WEAK;
    if (allPhrases) {
        return analysis.types.length > 0 || analysis.codes.length > 0 || phraseHits > 0
            ? RELEVANCE.CONSTRAINED
            : RELEVANCE.GROUP_ONLY;
    }
    return RELEVANCE.GROUP_ONLY;
}

function getStockScore(product) {
    const variants = Array.isArray(product.variant) ? product.variant : [];
    return variants.some((variant) => Number(variant?.quantityForSale || 0) > 0) ? 1 : 0;
}

/**
 * Xếp hạng: độ khớp ràng buộc trước, tồn kho chỉ là tiêu chí phụ sau khi đã đạt ràng buộc.
 */
function rankCandidates(candidates, analysis, { matchedCodeIds = new Set() } = {}) {
    return candidates
        .map((product) => ({
            product,
            relevance: classifyRelevance(product, analysis, { matchedByCode: matchedCodeIds.has(String(product._id)) }),
            phraseHits: countPhraseHits(product, analysis.phrases),
            // Khách nêu 15kW/380V thì sản phẩm đúng thông số phải lên trước, không để tồn kho quyết định.
            // Số cực gộp vào đây vì cùng bản chất: sai số cực là sai công năng.
            technicalScore: scoreTechnicalMatch(product, analysis.technicalConstraints)
                + scorePoleMatch(product, analysis.technicalConstraints),
            // Khi cụm đầy đủ đã bị nới bỏ, đây là thứ duy nhất còn phân biệt được món hàng.
            overlapScore: scoreNameOverlap(product, analysis.overlapPhrases || analysis.phrases),
        }))
        .sort((first, second) => first.relevance - second.relevance
            || second.phraseHits - first.phraseHits
            || second.technicalScore - first.technicalScore
            || second.overlapScore - first.overlapScore
            || getStockScore(second.product) - getStockScore(first.product)
            || Number(second.product.purchaseCount || 0) - Number(first.product.purchaseCount || 0));
}

/**
 * Tìm ứng viên theo phân tích câu hỏi.
 * Không nới ràng buộc bắt buộc (mã/type/brand); chỉ nới cụm mô tả và hạ tier tương ứng.
 */
async function retrieveProducts({ message, catalog, limit = 5 }) {
    const analysis = analyzeRetrievalQuery(message, catalog);
    const result = {
        analysis,
        products: [],
        relevance: null,
        codeMatches: [],
        missingCodes: [],
        nearCodeProducts: [],
        unverifiedPhrases: [],
        relaxed: false,
        // Kết quả suy ra từ chức năng khách mô tả, không phải từ tên nhóm hàng khách gọi.
        functionalFallback: false,
        // Chỉ còn "cùng nhóm công năng" chứ không món nào thật sự khớp thứ khách tả.
        weakMatch: false,
        // Cho biết đã thực sự chạy một lượt tra cứu có kiểm soát ở DB hay chưa.
        queried: false,
    };

    if (analysis.codes.length > 0) {
        result.queried = true;
        const codeLookup = await lookupProductCodes(analysis.codes);
        result.codeMatches = codeLookup.found;
        result.missingCodes = codeLookup.missing;
        result.nearCodeProducts = codeLookup.near;
        if (codeLookup.found.length > 0) {
            result.products = codeLookup.found.map((item) => item.product).slice(0, limit);
            result.relevance = RELEVANCE.EXACT;
            return result;
        }
    }

    const functionalTypes = analysis.functionalTypes || [];
    if (!analysis.hasCatalogMatch && analysis.phrases.length === 0 && functionalTypes.length === 0) return result;

    result.queried = true;
    let rankingAnalysis = analysis;
    let candidates = await runCandidateQuery(buildRetrievalFilter(analysis));
    if (candidates.length === 0 && analysis.phrases.length > 0 && analysis.hasCatalogMatch) {
        // Đúng nhóm nhưng chưa xác minh được cụm mô tả: hạ xuống lựa chọn tham khảo.
        candidates = await runCandidateQuery(buildRetrievalFilter(analysis, { includePhrases: false }));
        result.relaxed = true;
        result.unverifiedPhrases = [...analysis.phrases];
    }

    // Tầng cuối: khách mô tả CHỨC NĂNG ("thiết bị đóng cắt") thay vì gọi tên nhóm hàng.
    // Chỉ chạy khi mọi cách trên đều không ra gì, nên không ảnh hưởng câu đã nhận ra nhóm.
    if (candidates.length === 0 && functionalTypes.length > 0) {
        // phrases bị bỏ khỏi truy vấn nhưng vẫn dùng để xếp hạng: đó là chỗ khách nói rõ nhất
        // mình cần gì, bỏ luôn thì cả nhóm ngang điểm.
        rankingAnalysis = {
            ...analysis, types: functionalTypes, brands: [], phrases: [], overlapPhrases: analysis.phrases,
        };
        candidates = await runCandidateQuery(buildRetrievalFilter(rankingAnalysis, { includePhrases: false }));
        if (candidates.length > 0) {
            result.relaxed = true;
            result.functionalFallback = true;
            result.unverifiedPhrases = [...analysis.phrases];
        }
    }
    if (candidates.length === 0) return result;

    // Có nêu chức năng nhưng chưa gọi tên nhóm: thu hẹp về đúng nhóm chức năng nếu còn giao.
    if (functionalTypes.length > 0 && analysis.types.length === 0 && !result.functionalFallback) {
        const narrowed = candidates.filter((product) => functionalTypes.includes(product.type));
        if (narrowed.length > 0) candidates = narrowed;
    }

    const ranked = rankCandidates(candidates, rankingAnalysis).filter((item) => item.relevance < RELEVANCE.WEAK);
    if (ranked.length === 0) return result;

    result.products = ranked.slice(0, limit).map((item) => item.product);
    result.relevance = result.relaxed ? RELEVANCE.GROUP_ONLY : ranked[0].relevance;
    // Đã nới tới mức chỉ còn đúng nhóm công năng, mà món đứng đầu không nhắc tới thứ khách tả
    // cũng không khớp thông số nào: shop gần như chắc chắn KHÔNG có thứ khách hỏi.
    // Phải nói thật chỗ này, nếu không bot sẽ tự tin chào PLC cho người đi hỏi bộ điều khiển nhiệt độ.
    result.weakMatch = result.functionalFallback
        && ranked[0].overlapScore === 0
        && ranked[0].technicalScore <= 0;
    return result;
}

/**
 * Pool ứng viên rộng cho nhánh "không được phép hỏi lại".
 * Khách đã trả lời câu hỏi làm rõ rồi thì thà đưa vài gợi ý đúng nhóm kèm lý do
 * còn hơn lặp lại đúng câu hỏi đó. Vẫn chỉ lấy hàng đang bán, vẫn xếp theo thông số khách nêu.
 */
async function retrieveBroadCandidates({
    types = [], brands = [], sections = [], technicalConstraints = null, limit = 8,
} = {}) {
    const filter = { display: true };
    if (types.length > 0) filter.type = { $in: types };
    else if (sections.length > 0) filter.section = { $in: sections };
    else if (brands.length > 0) filter.brand = { $in: brands };
    else return [];
    if (types.length > 0 && brands.length > 0) filter.brand = { $in: brands };

    const candidates = await runCandidateQuery(filter);
    if (candidates.length === 0) return [];

    const rankingAnalysis = { types: [], brands: [], codes: [], phrases: [], technicalConstraints };
    return rankCandidates(candidates, rankingAnalysis).slice(0, limit).map((item) => item.product);
}

module.exports = {
    MAX_CANDIDATES,
    PRODUCT_SELECT,
    RELEVANCE,
    analyzeRetrievalQuery,
    buildDiacriticPattern,
    buildRetrievalFilter,
    classifyRelevance,
    extractBudget,
    extractProductSpecNumbers,
    lookupProductCodes,
    rankCandidates,
    retrieveBroadCandidates,
    retrieveProducts,
    scoreTechnicalMatch,
};
