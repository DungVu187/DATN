const MAX_REPLY_LENGTH = 3000;
const CONTACT_HINT = 'Bạn có thể liên hệ hotline 09.0151.3825 để được hỗ trợ trực tiếp.';

function formatPrice(value) {
    const numeric = Number(String(value || '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(numeric) && numeric > 0
        ? new Intl.NumberFormat('vi-VN').format(numeric) + ' đ'
        : '';
}

function describeProduct(product) {
    if (!product) return 'sản phẩm này';
    return product.code ? product.name + ' (mã ' + product.code + ')' : product.name;
}

/** Chỉ dùng giá công khai của biến thể mua trực tiếp được; không đọc ngược giá gốc. */
function getPublicPrices(product) {
    return (product?.variants || [])
        .filter((variant) => variant.canBuyDirectly && variant.price)
        .map((variant) => Number(String(variant.price).replace(/\./g, '')))
        .filter((value) => Number.isFinite(value) && value > 0);
}

function buildPriceFact(product) {
    const prices = getPublicPrices(product);
    const variantCount = (product?.variants || []).length;

    if (prices.length === 0) {
        return product?.availability === 'out_of_stock'
            ? describeProduct(product) + ' hiện hết hàng nên chưa có giá công khai.'
            : describeProduct(product) + ' chưa có giá công khai, bạn liên hệ để được báo giá.';
    }
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) {
        const suffix = variantCount > 1 ? ' (áp dụng cho phiên bản đang bán trực tiếp)' : '';
        return 'Giá của ' + describeProduct(product) + ' là ' + formatPrice(String(min)) + suffix + '.';
    }
    return 'Giá của ' + describeProduct(product) + ' dao động từ ' + formatPrice(String(min))
        + ' đến ' + formatPrice(String(max)) + ' tùy phiên bản. Bạn cho mình biết phiên bản cần mua để báo đúng giá nhé.';
}

function buildStockFact(product) {
    const variants = product?.variants || [];
    const total = variants.reduce((sum, variant) => sum + Number(variant.quantityForSale || 0), 0);
    if (total <= 0) return describeProduct(product) + ' hiện đã hết hàng.';
    if (variants.length > 1) {
        return describeProduct(product) + ' còn tổng cộng ' + total + ' sản phẩm trên ' + variants.length + ' phiên bản.';
    }
    const note = product.availability === 'contact_for_price' ? ', cần liên hệ để được báo giá' : '';
    return describeProduct(product) + ' còn ' + total + ' sản phẩm' + note + '.';
}

/**
 * Trường `warranty` trong DB lúc ghi "6 tháng", lúc chỉ ghi "6" (xem hàng Biến tần Schneider).
 * Để nguyên thì câu trả ra là "bảo hành ... là 6." — cụt nghĩa. Số trần luôn là số tháng
 * theo cách nhập của shop, nên thêm đơn vị; mọi dạng khác giữ nguyên văn.
 */
function formatWarranty(value) {
    const warranty = String(value || '').trim();
    return /^\d+$/.test(warranty) ? warranty + ' tháng' : warranty;
}

function buildWarrantyFact(product) {
    const warranty = formatWarranty(product?.warranty);
    if (!warranty) return describeProduct(product) + ' chưa có dữ liệu thời hạn bảo hành trong hệ thống.';
    return 'Thời hạn bảo hành của ' + describeProduct(product) + ' là ' + warranty + '.';
}

function buildSpecificationFact(product) {
    const specifications = String(product?.specifications || '').trim();
    if (specifications) return 'Thông số của ' + describeProduct(product) + ': ' + specifications;
    const description = String(product?.description || '').trim();
    if (description) {
        return describeProduct(product) + ' chưa có bảng thông số riêng. Mô tả hiện có: ' + description;
    }
    return describeProduct(product) + ' chưa có dữ liệu thông số kỹ thuật trong hệ thống.';
}

function buildFeatureFact(product) {
    const features = String(product?.features || '').trim();
    if (features) return 'Tính năng của ' + describeProduct(product) + ': ' + features;
    const description = String(product?.description || '').trim();
    if (description) return describeProduct(product) + ': ' + description;
    return describeProduct(product) + ' chưa có mô tả tính năng trong hệ thống.';
}

const FIELD_BUILDERS = Object.freeze({
    price: buildPriceFact,
    stock: buildStockFact,
    warranty: buildWarrantyFact,
    specifications: buildSpecificationFact,
    features: buildFeatureFact,
});

/**
 * Đáp án dữ kiện do backend dựng từ DB.
 * Hỏi bao nhiêu trường thì trả đủ bấy nhiêu; trường không có dữ liệu phải nói là chưa có.
 */
function buildFactualReply(product, requestedFields = []) {
    const fields = requestedFields.filter((field) => FIELD_BUILDERS[field]);
    if (fields.length === 0) {
        const parts = [describeProduct(product) + ' thuộc nhóm ' + (product.type || 'chưa phân nhóm') + '.'];
        const price = buildPriceFact(product);
        if (price) parts.push(price);
        parts.push(buildStockFact(product));
        return parts.join(' ').slice(0, MAX_REPLY_LENGTH);
    }
    const lines = fields.map((field) => FIELD_BUILDERS[field](product)).filter(Boolean);
    if (product.availability === 'out_of_stock' && !fields.includes('stock')) {
        lines.push('Lưu ý: sản phẩm này hiện đang hết hàng.');
    }
    return lines.join('\n').slice(0, MAX_REPLY_LENGTH);
}

/**
 * Dữ kiện dạng ngắn "Nhãn: giá trị" dùng trong khối so sánh.
 * FIELD_BUILDERS viết câu đầy đủ nên lặp lại tên sản phẩm ở mọi dòng — đọc trong khung chat
 * thì mỗi món là một đoạn tên dài lặp ba lần, không thấy được chỗ nào khác nhau.
 */
const COMPARISON_FACT_BUILDERS = Object.freeze({
    price: (product) => {
        const prices = getPublicPrices(product);
        if (prices.length === 0) return 'Giá: chưa công khai, cần liên hệ báo giá';
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        return 'Giá: ' + (min === max ? formatPrice(String(min)) : formatPrice(String(min)) + ' - ' + formatPrice(String(max)));
    },
    stock: (product) => {
        const total = (product?.variants || []).reduce((sum, variant) => sum + Number(variant.quantityForSale || 0), 0);
        return 'Tồn kho: ' + (total > 0 ? 'còn ' + total : 'hết hàng');
    },
    warranty: (product) => {
        const warranty = formatWarranty(product?.warranty);
        return 'Bảo hành: ' + (warranty || 'chưa có dữ liệu');
    },
    specifications: (product) => {
        const text = summarizeFactText(product?.specifications || '', { modelToken: getModelToken(product) });
        return text ? 'Thông số: ' + text.replace(/\n/g, ' / ') : '';
    },
    features: (product) => {
        const text = summarizeFactText(product?.features || '', { modelToken: getModelToken(product) });
        return text ? 'Tính năng: ' + text.replace(/\n/g, ' / ') : '';
    },
});

/** So sánh chỉ dựa vào dữ liệu đã có; không tự kết luận món nào tốt hơn. */
function buildComparisonReply(products, requestedFields = [], { missingMentions = [] } = {}) {
    const fields = requestedFields.length > 0
        ? requestedFields.filter((field) => COMPARISON_FACT_BUILDERS[field])
        : ['price', 'stock', 'warranty'];
    const lines = [formatProductBlocks(products.map((product) => ({
        title: describeProduct(product),
        details: fields.map((field) => COMPARISON_FACT_BUILDERS[field](product)).filter(Boolean),
    })))];

    const prices = products.map((product) => {
        const values = getPublicPrices(product);
        return values.length > 0 ? Math.min(...values) : null;
    });
    const comparable = prices.filter((value) => value !== null);
    let priceNote = '';
    if (comparable.length === products.length && new Set(comparable).size > 1) {
        const cheapestIndex = prices.indexOf(Math.min(...comparable));
        priceNote = '\n\nTheo giá công khai hiện tại, ' + describeProduct(products[cheapestIndex]) + ' có giá thấp hơn.';
    } else if (comparable.length < products.length) {
        priceNote = '\n\nCó sản phẩm chưa công khai giá nên mình chưa so sánh được mức giá; bạn liên hệ để được báo giá nhé.';
    }

    const differences = [];
    if (new Set(products.map((product) => product.brand)).size > 1) {
        differences.push('khác hãng (' + products.map((product) => product.brand || 'chưa rõ').join(' và ') + ')');
    }
    if (new Set(products.map((product) => product.type)).size > 1) {
        differences.push('khác nhóm sản phẩm (' + products.map((product) => product.type || 'chưa rõ').join(' và ') + ')');
    }
    const differenceNote = differences.length > 0 ? '\n\nHai sản phẩm ' + differences.join(', ') + '.' : '';

    // Khách nêu một cái tên bên mình không bán: nói trước khi so sánh, nếu không khách tưởng
    // hai món dưới đây là hai thứ họ vừa hỏi.
    const missingNote = missingMentions.length > 0
        ? 'Bên mình hiện chưa có hàng của ' + missingMentions.join(', ')
            + ' trong danh mục, nên mình so sánh trên các model đang có nhé.\n\n'
        : '';

    return (missingNote + lines.join('\n') + differenceNote + priceNote).slice(0, MAX_REPLY_LENGTH);
}

/** Hết hàng thì không hứa đã đăng ký báo hàng; chỉ nêu kênh liên hệ đang có. */
function buildOutOfStockReply(product, similarProducts = []) {
    const name = product?.name || 'sản phẩm này';
    const opening = 'Mình rất tiếc, ' + name + ' hiện đang hết hàng.';
    const alternatives = (similarProducts || [])
        .filter((item) => ['available', 'contact_for_price'].includes(item.availability))
        .slice(0, 2);
    const availableNames = alternatives.filter((item) => item.availability === 'available').map((item) => item.name);
    const contactNames = alternatives.filter((item) => item.availability === 'contact_for_price').map((item) => item.name);
    const alternativeParts = [];
    if (availableNames.length > 0) alternativeParts.push(availableNames.join(' và ') + ' đang sẵn kho');
    if (contactNames.length > 0) alternativeParts.push(contactNames.join(' và ') + ' cần liên hệ để báo giá');
    const alternativeText = alternativeParts.length > 0
        ? ' Cùng nhóm còn ' + alternativeParts.join('; ') + ' để bạn tham khảo.'
        : '';
    return opening + alternativeText + ' Hiện mình chưa có lịch nhập hàng xác nhận. ' + CONTACT_HINT;
}

const CLARIFICATION_TEMPLATES = Object.freeze({
    missing_object: 'Bạn đang hỏi về sản phẩm nào ạ? Bạn gửi giúp mình tên hoặc mã sản phẩm để mình tra đúng thông tin nhé.',
    ambiguous_pair: 'Bạn muốn so sánh hai sản phẩm nào trong danh sách trên? Bạn gửi giúp mình hai mã cần so sánh nhé.',
    ambiguous_ordinal: 'Mình chưa xác định được bạn đang nhắc tới sản phẩm nào trong danh sách. Bạn gửi giúp mình tên hoặc mã sản phẩm nhé.',
    need_usage: 'Để tư vấn đúng, bạn cho mình biết thiết bị dùng cho chức năng gì (đóng cắt, bảo vệ, điều khiển hay đo lường) và thông số tải (điện áp, công suất) nhé.',
    need_specs: 'Bạn cho mình biết thêm điện áp nguồn và công suất/dòng tải cần dùng để mình lọc đúng sản phẩm nhé.',
    need_variant: 'Sản phẩm này có nhiều phiên bản. Bạn cho mình biết phiên bản cần mua để mình báo đúng giá và tồn kho nhé.',
    need_budget: 'Bạn dự kiến ngân sách khoảng bao nhiêu để mình lọc đúng tầm giá nhé?',
    need_code: 'Bạn gửi giúp mình mã sản phẩm cần tra để mình lấy đúng dữ liệu nhé.',
});

function buildClarificationReply(key) {
    return CLARIFICATION_TEMPLATES[key] || CLARIFICATION_TEMPLATES.missing_object;
}

/** Hỏi tiếp thì phải hỏi câu KHÁC; câu đã hỏi rồi coi như đã có câu trả lời. */
const FOLLOW_UP_QUESTION_ORDER = Object.freeze(['need_specs', 'need_budget', 'need_variant', 'need_code']);

function pickFollowUpQuestionKey(askedQuestionKeys = []) {
    return FOLLOW_UP_QUESTION_ORDER.find((key) => !askedQuestionKeys.includes(key)) || null;
}

/** Không tìm thấy hàng là câu trả lời hợp lệ, không phải lỗi hệ thống. */
function buildNotFoundReply({ missingCodes = [], nearCodeProducts = [], types = [], brands = [] } = {}) {
    if (missingCodes.length > 0) {
        const codeText = missingCodes.join(', ');
        const nearText = nearCodeProducts.length > 0
            ? ' Hệ thống có mã gần giống là ' + nearCodeProducts.map((item) => item.product.code).filter(Boolean).join(', ')
            + ', nhưng đó là mã khác nên mình không khẳng định thay thế được.'
            : '';
        return 'Mình chưa tìm thấy đúng mã ' + codeText + ' trong danh mục đang bán.' + nearText;
    }
    const scope = [
        types.length > 0 ? 'nhóm ' + types.join(', ') : '',
        brands.length > 0 ? 'hãng ' + brands.join(', ') : '',
    ].filter(Boolean).join(' của ');
    return scope
        ? 'Mình chưa tìm thấy sản phẩm phù hợp ở ' + scope + ' theo đúng yêu cầu của bạn. Bạn thử nới bớt một điều kiện hoặc gửi mã cụ thể để mình tra lại nhé.'
        : 'Mình chưa tìm thấy sản phẩm phù hợp trong dữ liệu hiện tại. Bạn gửi giúp mình tên, mã hoặc nhu cầu sử dụng cụ thể hơn nhé.';
}

const ADVICE_LIMITS = Object.freeze({ maxOptions: 3 });

const BLOCK_INDENT = '   ';

/**
 * Mỗi sản phẩm một khối riêng: đánh số, chi tiết thụt vào, các khối cách nhau một dòng trống.
 * Dồn tất cả vào những dòng liền nhau thì khách đọc không phân biệt nổi đâu là sản phẩm nào.
 * Chỉ dùng text thuần vì frontend render `white-space: pre-line`, không parse markdown.
 */
function formatProductBlocks(blocks) {
    return blocks
        .filter((block) => block && block.title)
        .map((block, index) => {
            const details = (block.details || [])
                .filter(Boolean)
                .map((line) => BLOCK_INDENT + String(line).replace(/\n/g, ' '));
            return [(index + 1) + '. ' + block.title, ...details].join('\n');
        })
        .join('\n\n');
}

/**
 * Tư vấn có căn cứ: mỗi lựa chọn kèm lý do đã kiểm tra được từ dữ liệu.
 * Ràng buộc chưa xác minh phải nói rõ là chưa xác minh.
 */
function buildAdviceReply(products, { unverifiedPhrases = [], requestedConstraints = [] } = {}) {
    const options = products.slice(0, ADVICE_LIMITS.maxOptions);
    if (options.length === 0) return buildNotFoundReply({});

    const body = formatProductBlocks(options.map((product) => ({
        title: describeProduct(product),
        details: [summarizeFactText(
            product.specifications || product.features || '',
            { modelToken: getModelToken(product) },
        )],
    })));

    const notes = [];
    if (unverifiedPhrases.length > 0) {
        notes.push('Mình chưa xác minh đầy đủ các thông số bạn cung cấp với từng sản phẩm, nên các lựa chọn trên chỉ mang tính tham khảo. Bạn cần kiểm tra lại thông số trước khi mua hoặc lắp đặt.');
    }
    if (requestedConstraints.length > 0) {
        notes.push('Nếu bạn cần đúng ' + requestedConstraints.join(', ') + ', bạn xác nhận giúp mình để lọc lại nhé.');
    }

    const heading = unverifiedPhrases.length > 0
        ? 'Mình tìm thấy ' + options.length + ' sản phẩm cùng nhóm để bạn tham khảo (chưa thể khẳng định phù hợp hoàn toàn):'
        : 'Các sản phẩm tìm được:';
    return [heading, body, ...notes]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, MAX_REPLY_LENGTH);
}

/**
 * Câu trả lời khi bot đã hỏi lại một lần và khách đã trả lời: nêu rõ ĐÃ HIỂU GÌ,
 * đưa sản phẩm cụ thể, rồi hỏi một câu KHÁC để tiến thêm một bước.
 * Text thuần (\n và "•") vì frontend render thẳng nội dung, không parse markdown.
 */
function buildBestEffortReply(products, {
    understood = [], askedQuestionKeys = [], unverifiedPhrases = [], body = '', advisory = '',
} = {}) {
    const options = products.slice(0, ADVICE_LIMITS.maxOptions);
    if (options.length === 0 && !body) return buildNotFoundReply({});

    // Lời tư vấn đã qua kiểm chứng nói thay câu dẫn máy móc; có nó rồi thì
    // "Mình hiểu bạn cần ..." chỉ thành dòng thừa nói lại cùng một ý.
    const heading = advisory || (understood.length > 0
        ? 'Mình hiểu bạn cần ' + understood.join(', ') + '. Với yêu cầu đó, mình gợi ý:'
        : 'Với yêu cầu của bạn, mình gợi ý:');
    // Thân bài do model dựng đã có câu dẫn riêng; để cả hai thành ra hai dòng mở đầu chồng nhau.
    const bodyLines = String(body || '').split('\n');
    if (bodyLines.length > 1 && bodyLines[0].trim().endsWith(':')) bodyLines.shift();
    const mainBody = body
        ? bodyLines.join('\n').trim()
        : formatProductBlocks(options.map((product) => ({
            title: describeProduct(product),
            details: [summarizeFactText(
            product.specifications || product.features || '',
            { modelToken: getModelToken(product) },
        )],
        })));

    const notes = [];
    if (unverifiedPhrases.length > 0) {
        notes.push('Một vài thông số bạn nêu mình chưa đối chiếu được đầy đủ trong dữ liệu sản phẩm, bạn kiểm tra lại trước khi mua hoặc lắp đặt nhé.');
    }
    const nextKey = pickFollowUpQuestionKey(askedQuestionKeys);
    if (nextKey) notes.push(CLARIFICATION_TEMPLATES[nextKey]);

    return [heading, mainBody, ...notes].filter(Boolean).join('\n\n').slice(0, MAX_REPLY_LENGTH);
}

function buildPolicyReply(policies = []) {
    if (policies.length === 0) {
        return 'Bạn vui lòng nói rõ muốn hỏi chính sách mua hàng, giao hàng, bảo hành hay bảo mật để mình hỗ trợ chính xác hơn nhé.';
    }
    const policy = policies[0];
    const content = policy.sections?.slice(0, 3).map((section) => section.title + ': ' + section.content).join('\n')
        || policy.summary;
    return (policy.title + ':\n' + content).slice(0, MAX_REPLY_LENGTH);
}

/** Hỏi cả chính sách chung lẫn thời hạn của một món thì trả cả hai và tách rõ nguồn. */
function buildWarrantyCombinedReply(product, policies = []) {
    const parts = [];
    if (product) parts.push(buildWarrantyFact(product));
    if (policies.length > 0) parts.push('Chính sách bảo hành chung của NOVA:\n' + buildPolicyReply(policies));
    if (parts.length === 0) return buildPolicyReply(policies);
    return parts.join('\n\n').slice(0, MAX_REPLY_LENGTH);
}

function buildDataUnavailableReply() {
    return 'Mình chưa tra được dữ liệu sản phẩm lúc này nên chưa thể trả lời chính xác. Bạn thử lại sau ít phút giúp mình nhé.';
}

/** Tập câu hỏi làm rõ mà model được phép chọn. */
const ALLOWED_QUESTION_KEYS = Object.freeze(Object.keys(CLARIFICATION_TEMPLATES));

const EVIDENCE_FACT_BUILDERS = Object.freeze({
    identity: (product) => describeProduct(product) + ' thuộc nhóm ' + (product.type || 'chưa phân nhóm')
        + (product.brand ? ', hãng ' + product.brand : '') + '.',
    price: buildPriceFact,
    stock: buildStockFact,
    warranty: (product) => (product.warranty ? buildWarrantyFact(product) : ''),
    specifications: (product) => (product.specifications ? buildSpecificationFact(product) : ''),
    features: (product) => (product.features ? buildFeatureFact(product) : ''),
});

/**
 * Danh sách bằng chứng có ID ổn định trong một request.
 * Lý do chỉ được nêu khi dữ liệu chứng minh được; không có claim "thay thế hoàn toàn" hay "tốt hơn".
 */
function buildProductEvidence(products = [], { requestedTypes = [], requestedBrands = [], budget = null } = {}) {
    const facts = [];
    const reasons = [];

    products.forEach((product, index) => {
        const productId = product.productId;
        Object.entries(EVIDENCE_FACT_BUILDERS).forEach(([kind, builder]) => {
            const text = builder(product);
            if (text) facts.push({ id: 'f' + index + '_' + kind, productId, kind, text });
        });

        const addReason = (key, text) => reasons.push({ id: 'r' + index + '_' + key, productId, text });
        if (requestedTypes.length > 0 && requestedTypes.includes(product.type)) {
            addReason('type', 'đúng nhóm ' + product.type + ' bạn đang hỏi');
        }
        if (requestedBrands.length > 0 && requestedBrands.includes(product.brand)) {
            addReason('brand', 'đúng hãng ' + product.brand + ' bạn yêu cầu');
        }
        if (product.availability === 'available') addReason('stock', 'đang còn hàng và mua trực tiếp được');
        if (budget?.maxPrice) {
            const prices = getPublicPrices(product);
            if (prices.length > 0 && Math.min(...prices) <= budget.maxPrice) {
                addReason('budget', 'giá công khai nằm trong ngân sách bạn nêu');
            }
        }
    });

    return {
        products: products.map((product) => ({
            productId: product.productId,
            name: product.name,
            code: product.code,
            type: product.type,
            brand: product.brand,
            availability: product.availability,
        })),
        facts,
        reasons,
        questionKeys: [...ALLOWED_QUESTION_KEYS],
    };
}

const MAX_BROWSE_FACT_LENGTH = 180;
const MAX_BROWSE_FACT_EXTRA_LINES = 2;

const FACT_LABEL_PATTERN = /^(Thông số|Tính năng):\s*/;

/** Mã model của món hàng, để nhận ra dòng thông số chỉ đang nhắc lại chính tên nó. */
function getModelToken(product) {
    const source = String(product?.code || product?.name || '');
    const token = source.trim().split(/\s+/)[0] || '';
    return /\d/.test(token) ? token.toLowerCase() : '';
}

/**
 * Khách chưa hỏi thông số cụ thể thì chỉ nêu vài ý đáng so sánh: đổ nguyên khối specifications
 * của 3 sản phẩm vào bong bóng chat thì không ai đọc, card bên dưới đã có đủ chi tiết.
 * Cắt theo dòng chứ không cắt giữa chừng, vì "công suất tối đa (380V):…" là câu bỏ lửng vô nghĩa.
 */
function summarizeFactText(text, { modelToken = '' } = {}) {
    const raw = String(text || '');
    const label = FACT_LABEL_PATTERN.exec(raw);
    const lines = (label ? raw.slice(label[0].length) : raw)
        .split('\n')
        .map((line) => line.replace(/^[-•\s]+/, '').trim())
        .filter(Boolean)
        // Dòng kiểu "Dòng sản phẩm: Khởi động từ ... S-T35" chỉ chép lại tên món, không thêm gì.
        .filter((line) => !modelToken || !line.toLowerCase().includes(modelToken));
    if (lines.length === 0) return '';

    // Khách chọn hàng bằng con số (A, kW, cực...), nên ưu tiên những dòng có số.
    const numeric = lines.filter((line) => /\d/.test(line));
    const picked = (numeric.length > 0 ? numeric : lines).slice(0, MAX_BROWSE_FACT_EXTRA_LINES + 1);

    const kept = [];
    let length = 0;
    picked.forEach((line) => {
        if (kept.length > 0 && length + line.length + 2 > MAX_BROWSE_FACT_LENGTH) return;
        kept.push(line);
        length += line.length + 2;
    });

    let summary = kept.join('; ');
    if (summary.length > MAX_BROWSE_FACT_LENGTH) summary = summary.slice(0, MAX_BROWSE_FACT_LENGTH).trimEnd() + '…';
    else if (kept.length < lines.length) summary += '…';
    return (label ? label[1] + ': ' : '') + summary;
}

/**
 * Dựng câu trả lời tiếng Việt từ lựa chọn đã kiểm chứng.
 * Chỉ dùng text bằng chứng do backend tạo, không dùng chữ tự do của model.
 */
function renderEvidenceSelection(selection, evidence, { requestedFields = [], advisory = '' } = {}) {
    if (!selection || selection.answerType === 'not_found') return '';
    if (selection.answerType === 'clarification') {
        return buildClarificationReply(selection.questionKey);
    }

    const factById = new Map((evidence.facts || []).map((fact) => [fact.id, fact]));
    const reasonById = new Map((evidence.reasons || []).map((reason) => [reason.id, reason]));
    const productById = new Map((evidence.products || []).map((product) => [product.productId, product]));

    const blocks = [...new Set(selection.productIds)].slice(0, ADVICE_LIMITS.maxOptions).map((productId) => {
        const product = productById.get(productId);
        if (!product) return '';
        const productFacts = selection.factIds
            .map((id) => factById.get(id))
            .filter((fact) => fact && fact.productId === productId)
            .filter((fact) => fact.kind !== 'identity')
            .filter((fact) => requestedFields.length > 0
                ? requestedFields.includes(fact.kind)
                : ['specifications', 'features'].includes(fact.kind))
            .slice(0, 2)
            .map((fact) => fact.text);
        const productReasons = selection.reasonIds
            .map((id) => reasonById.get(id))
            .filter((reason) => reason && reason.productId === productId)
            .filter((reason) => reason.id.endsWith('_budget'))
            .map((reason) => reason.text);

        const title = (product.code ? product.name + ' (mã ' + product.code + ')' : product.name)
            + (productReasons.length > 0 ? ' — ' + productReasons.join(', ') + '.' : '');
        const conciseFacts = [...new Set(productFacts)]
            .map((text) => text
                .replace('Thông số của ' + describeProduct(product) + ': ', 'Thông số: ')
                .replace('Tính năng của ' + describeProduct(product) + ': ', 'Tính năng: '))
            // Khách hỏi đích danh một trường thì trả đủ; còn đang duyệt thì rút gọn.
            .map((text) => (requestedFields.length > 0
                ? text
                : summarizeFactText(text, { modelToken: getModelToken(product) })))
            .filter(Boolean);
        return { title, details: conciseFacts };
    }).filter(Boolean);

    if (blocks.length === 0) return '';

    // Lời tư vấn đã kiểm chứng thay luôn câu mở đầu: khách cần nghe người nói,
    // không cần nghe máy xướng "Các sản phẩm tìm được".
    const opening = advisory || (selection.answerType === 'comparison'
        ? 'Mình đối chiếu theo dữ liệu hiện có:'
        : 'Các sản phẩm tìm được:');
    const question = selection.questionKey ? buildClarificationReply(selection.questionKey) : '';
    return [opening, formatProductBlocks(blocks), question]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, MAX_REPLY_LENGTH);
}

module.exports = {
    ADVICE_LIMITS,
    ALLOWED_QUESTION_KEYS,
    buildProductEvidence,
    renderEvidenceSelection,
    CONTACT_HINT,
    MAX_REPLY_LENGTH,
    FOLLOW_UP_QUESTION_ORDER,
    buildAdviceReply,
    buildBestEffortReply,
    buildClarificationReply,
    buildComparisonReply,
    buildDataUnavailableReply,
    buildFactualReply,
    buildFeatureFact,
    buildNotFoundReply,
    buildOutOfStockReply,
    buildPolicyReply,
    buildPriceFact,
    buildSpecificationFact,
    buildStockFact,
    buildWarrantyCombinedReply,
    buildWarrantyFact,
    describeProduct,
    formatPrice,
    getPublicPrices,
    pickFollowUpQuestionKey,
};
