const mongoose = require('mongoose');
const { Order } = require('../models/order');
const { CustomerBehavior } = require('../models/customerbehavior');
const { ChatMessage } = require('../models/chatmessage');
const {
    buildChatContext,
    getStoreInfo,
    getSupportPolicies,
    hydrateProductsByIds,
    toPublicProduct,
} = require('../services/chatContext');
const { analyzeChatMessage, hasExplicitSpecRequest } = require('../services/chatIntent');
const { composeProductReply, composeSupportReply } = require('../services/chatComposer');
const { CatalogUnavailableError, getCatalogMetadata, normalizeChatText } = require('../services/chatCatalog');
const { RELEVANCE, retrieveBroadCandidates } = require('../services/chatRetrieval');
const {
    applyFollowUpContext,
    buildAssistantMemory,
    buildConversationScope,
    loadConversationState,
    mergePendingQuestion,
    resolveReferencedProducts,
} = require('../services/chatConversation');
const { GeminiChatError } = require('../services/geminiChat');
const { verifyAdvisoryText } = require('../services/chatGrounding');
const {
    buildAdviceReply,
    buildBestEffortReply,
    buildClarificationReply,
    buildComparisonReply,
    buildDataUnavailableReply,
    buildFactualReply,
    buildNotFoundReply,
    buildOutOfStockReply,
    buildPolicyReply,
    buildProductEvidence,
    buildWarrantyCombinedReply,
    pickFollowUpQuestionKey,
    renderEvidenceSelection,
} = require('../services/chatReplyTemplates');
const {
    CustomerBehaviorValidationError,
    validateCustomerBehaviorPayload,
} = require('../validators/customerBehavior');
const {
    ChatValidationError,
    validateChatClearPayload,
    validateChatHistoryPayload,
    validateChatSendPayload,
} = require('../validators/chat');

const MAX_RESPONSE_PRODUCTS = 5;
const FACTUAL_FIELDS = ['price', 'stock', 'warranty', 'specifications', 'features'];

function isValidationError(error) {
    return error instanceof CustomerBehaviorValidationError
        || error instanceof mongoose.Error.ValidationError
        || error instanceof mongoose.Error.CastError;
}

const SUPPORT_HOTLINE = '09.0151.3825';
// Hai phương thức đang có ở bước thanh toán (fe/src/pages/cart.jsx); đổi ở đó thì sửa cả ở đây.
const PAYMENT_METHODS_TEXT = 'Thanh toán khi nhận hàng (COD); chuyển khoản qua SePay bằng mã VietQR,'
    + ' đơn tự xác nhận khi tiền vào tài khoản.';

const LOCAL_REPLIES = {
    greeting: 'Chào bạn 👋 Mình là trợ lý NOVA. Bạn đang muốn tìm sản phẩm, hỏi giá, kiểm tra tồn kho hay cần tư vấn kỹ thuật?',
    nonsense_query: 'Mình chưa hiểu câu hỏi. Bạn thử hỏi về sản phẩm, giá, tồn kho, thông số, giao hàng hoặc bảo hành nhé.',
    out_of_scope: 'Mình chỉ hỗ trợ sản phẩm, chính sách mua hàng, giao hàng, bảo hành và đơn hàng của NOVA.',
    human_handoff: 'Bạn có thể gọi hotline ' + SUPPORT_HOTLINE + ' để gặp nhân viên tư vấn, hoặc để lại số điện thoại ở đây để bên mình chủ động liên hệ lại.',
    // Khách vãng lai hỏi đơn: mời đăng nhập ngay trong khung chat, không trả lỗi.
    order_needs_login: 'Bạn đăng nhập giúp mình để mình kiểm tra nhé. Mình cần biết bạn là ai mới tra được đơn hàng,'
        + ' đăng nhập xong bạn hỏi lại câu này là mình trả lời ngay.',
    thanks: 'Không có gì đâu bạn! Cần tìm thêm thiết bị hay hỏi giá, tồn kho thì bạn cứ nhắn mình nhé.',
    ack: 'Dạ vâng. Bạn cần mình hỗ trợ thêm gì nữa không?',
};

/**
 * Hãng để soi "hãng lạ" trong câu model viết: hãng đang bán (lấy từ catalog) cộng vài hãng phổ biến
 * trong ngành mà NOVA không bán — model hay "tiện tay" nhắc tới đúng những hãng này.
 */
const EXTRA_KNOWN_BRANDS = Object.freeze([
    'ABB', 'INVT', 'Fuji', 'Yaskawa', 'Panasonic', 'Allen Bradley', 'Danfoss', 'Honeywell', 'Festo',
    'SMC', 'Cadivi', 'Chint', 'Hitachi', 'Toshiba', 'Keyence', 'Sick', 'Fotek', 'Rockwell', 'Eaton',
]);
const knownBrandsOf = (catalog) => [...(catalog?.brands || []), ...EXTRA_KNOWN_BRANDS];

/** answerType của chế độ hỗ trợ chung đổi về tập giá trị frontend/evaluator đang dùng. */
const toPublicAnswerType = (answerType) => (answerType === 'general' ? 'direct' : answerType);

async function getOwnOrderStatuses(user) {
    if (!user?.phone) return [];
    return Order.find({ userPhone: user.phone })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('orderCode status state paymentStatus createdAt total')
        .lean();
}

function buildOrderReply(orders, orderAction = 'status') {
    if (orders.length === 0) {
        return orderAction === 'cancel'
            ? 'Mình chưa tìm thấy đơn hàng nào gắn với tài khoản của bạn nên chưa có đơn nào để hủy.'
            : 'Mình chưa tìm thấy đơn hàng nào gắn với tài khoản của bạn.';
    }
    const lines = orders.map((order) => {
        const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString('vi-VN') : '';
        return 'Đơn ' + (order.orderCode || 'chưa có mã') + ': trạng thái ' + (order.status || order.state || 'đang xử lý')
            + ', thanh toán ' + (order.paymentStatus || 'chưa cập nhật') + (date ? ', ngày ' + date : '') + '.';
    });
    // Chatbot không có quyền ghi: phải nói rõ kẻo khách tưởng đã hủy xong.
    if (orderAction === 'cancel') {
        lines.push('');
        lines.push('Mình chưa hủy đơn trực tiếp được. Bạn nhắn mã đơn muốn hủy kèm số điện thoại,'
            + ' hoặc gọi ' + SUPPORT_HOTLINE + ' để nhân viên xác nhận giúp bạn nhé.');
    }
    return lines.join('\n');
}

function getAuthenticatedUserId(req) {
    return req.user?.userId || req.user?._id;
}

function buildChatHistoryFilter(payload, req) {
    return buildConversationScope({
        chatSessionId: payload.chatSessionId,
        visitorId: payload.visitorId,
        userId: getAuthenticatedUserId(req),
    });
}

async function respondWithStoredChat(req, res, payload) {
    const { chatPayload, memory, ...response } = payload;
    const userId = getAuthenticatedUserId(req);
    const metadata = {
        chatSessionId: chatPayload.chatSessionId,
        visitorId: chatPayload.visitorId,
        ...(userId ? { userId } : {}),
        intent: payload.intent,
    };
    const assistantMetadata = {
        ...metadata,
        ...(payload.answerType ? { answerType: payload.answerType } : {}),
        fallback: payload.fallback === true,
        ...(Number.isFinite(payload.latencyMs) ? { latencyMs: payload.latencyMs } : {}),
        ...(Number.isFinite(payload.totalLatencyMs) ? { totalLatencyMs: payload.totalLatencyMs } : {}),
        needsHuman: payload.needsHuman === true,
        ...(memory ? { memory } : {}),
    };
    try {
        await ChatMessage.insertMany([
            { ...metadata, role: 'user', content: chatPayload.message },
            { ...assistantMetadata, role: 'assistant', content: payload.reply },
        ]);
    } catch (error) {
        // Lỗi lưu lịch sử không được chặn câu trả lời chính cho khách.
        console.error('Error storing chat history:', error);
    }
    return res.json({ success: 1, ...response });
}

async function getChatHistory(req, res) {
    try {
        const payload = validateChatHistoryPayload(req.query);
        const filter = buildChatHistoryFilter(payload, req);
        const messages = await ChatMessage.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(100)
            .select('role content intent answerType fallback latencyMs needsHuman createdAt')
            .lean();
        return res.json({ success: 1, messages: messages.reverse() });
    } catch (error) {
        if (error instanceof ChatValidationError) {
            return res.status(400).json({ success: 0, message: error.message });
        }
        console.error('Error loading chat history:', error);
        return res.status(500).json({ success: 0, message: 'Không thể tải lịch sử chat lúc này.' });
    }
}

/** Card gợi ý luôn kèm lý do đã kiểm chứng từ dữ liệu, không phải chữ tự do của model. */
function describeCardReason(product, analysis) {
    const reasons = [];
    if (analysis?.constraints?.types?.includes(product.type)) reasons.push('đúng nhóm ' + product.type);
    if (analysis?.constraints?.brands?.includes(product.brand)) reasons.push('đúng hãng ' + product.brand);
    if (reasons.length === 0 && product.type) reasons.push('cùng nhóm ' + product.type);
    if (product.availability === 'available') reasons.push('đang còn hàng');
    else if (product.availability === 'contact_for_price') reasons.push('còn hàng, cần liên hệ báo giá');
    else reasons.push('hiện hết hàng');
    return reasons.join(', ') + '.';
}

function buildResponseProducts(products, analysis) {
    const seen = new Set();
    return products
        .filter((product) => {
            const id = String(product?.productId || '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .slice(0, MAX_RESPONSE_PRODUCTS)
        .map((product) => ({ ...product, reason: describeCardReason(product, analysis) }));
}

/**
 * "Tôi cần thiết bị đóng cắt, điện áp 380V, công suất 15kW" là khách NÊU RÀNG BUỘC,
 * không phải xin đọc datasheet. Đọc nhầm thành câu hỏi thông số thì bot đổ nguyên bảng
 * thông số của một món ra rồi dừng — đúng kiểu trả lời khô khan, không tư vấn gì.
 * Giá / tồn kho / bảo hành thì ngược lại: khách nhắc tới là thật sự muốn biết.
 * Khớp được nhóm hàng (Đồng Hồ) KHÔNG có nghĩa là khách đã chỉ đúng một món: "đồng hồ đo
 * điện áp 3 pha, loại nào dễ đọc" vẫn là câu nhờ tư vấn, nên chỉ giữ thông số khi khách
 * gọi thẳng tên tài liệu.
 */
function pickFactualFields(analysis, { hasSpecificProduct = true } = {}) {
    const fields = analysis.requestedFields.filter((field) => FACTUAL_FIELDS.includes(field));
    if (analysis.task !== 'advice') return fields;
    if (hasExplicitSpecRequest(analysis.normalized)) return fields;
    if (hasSpecificProduct && analysis.entities.codes.length > 0) return fields;
    return fields.filter((field) => !['specifications', 'features'].includes(field));
}

const formatTechnicalToken = (token) => String(token).replace(/(\d)([a-z])/i, '$1 $2');

const TECHNICAL_UNIT_ALIASES = Object.freeze({
    v: 'v(?:dc|ac)?', vdc: 'v(?:dc|ac)?', vac: 'v(?:dc|ac)?', kw: 'kw', a: 'a',
});

/**
 * Tên hàng có ghi con số cùng đơn vị nhưng khác giá trị khách hỏi hay không.
 * Cần kiểm tra riêng vì 151/275 sản phẩm có specifications máy sinh kiểu
 * "Điện áp hoạt động định mức: 24 V DC hoặc 220 V AC tiêu chuẩn" — cứ dò trong specs
 * thì điện áp nào cũng thấy "khớp", khách hỏi van 24V lại được trả van 220V mà không hay.
 */
function nameContradictsToken(product, token) {
    const asked = /^(\d+(?:[.,]\d+)?)\s*(vdc|vac|kw|v|a)$/i.exec(String(token).trim());
    if (!asked) return false;
    const unitPattern = TECHNICAL_UNIT_ALIASES[asked[2].toLowerCase()];
    const value = Number(asked[1].replace(',', '.'));
    if (!unitPattern || !Number.isFinite(value) || value <= 0) return false;

    const name = String(product.name || '');
    const number = '(\\d+(?:[.,]\\d+)?)';
    const toNumber = (raw) => Number(String(raw).replace(',', '.'));
    // Dải "380-500V" hay "(7A - 11A)" phủ giá trị khách hỏi; đừng cảnh báo nhầm hàng vốn đã đúng.
    // Lookbehind chặn mã hàng bị đọc nhầm thành dải: "PHS530D-03-220V" không phải "03 đến 220V".
    const rangePattern = '(?<![-\\w])' + number + '\\s*(?:' + unitPattern + ')?\\s*-\\s*' + number + '\\s*' + unitPattern + '\\b';
    const covered = [...name.matchAll(new RegExp(rangePattern, 'gi'))]
        .some((match) => toNumber(match[1]) <= value && value <= toNumber(match[2]));
    if (covered) return false;

    const stated = [...name.matchAll(new RegExp(number + '\\s*' + unitPattern + '\\b', 'gi'))]
        .map((match) => toNumber(match[1]))
        .filter((found) => Number.isFinite(found) && found > 0);
    if (stated.length === 0) return false;
    return !stated.some((found) => Math.abs(found - value) <= value * 0.02);
}

/**
 * Dải giá trị trong bảng thông số có phủ đúng con số khách hỏi hay không.
 * Phải kiểm riêng vì so chuỗi kiểu "380v" không bao giờ khớp "380-440V": S-T35 ghi rõ
 * "AC-3, 380-440V" mà vẫn bị dán nhãn "chưa xác minh 380 V" — bot tự phủ nhận đúng câu
 * trả lời của chính nó.
 */
function specsCoverToken(product, token) {
    const asked = /^(\d+(?:[.,]\d+)?)\s*(vdc|vac|kw|v|a)$/i.exec(String(token).trim());
    if (!asked) return false;
    const unitPattern = TECHNICAL_UNIT_ALIASES[asked[2].toLowerCase()];
    const value = Number(asked[1].replace(',', '.'));
    if (!unitPattern || !Number.isFinite(value) || value <= 0) return false;

    const text = [product.specifications, product.features, product.name].filter(Boolean).join(' ');
    const number = '(\\d+(?:[.,]\\d+)?)';
    const toNumber = (raw) => Number(String(raw).replace(',', '.'));
    const rangePattern = '(?<![-\\w])' + number + '\\s*(?:' + unitPattern + ')?\\s*-\\s*' + number + '\\s*' + unitPattern + '\\b';
    return [...text.matchAll(new RegExp(rangePattern, 'gi'))]
        .some((match) => toNumber(match[1]) <= value && value <= toNumber(match[2]));
}

/** Ràng buộc kỹ thuật không tìm thấy trong thông số phải được nói rõ là chưa xác minh. */
function findUnverifiedConstraints(products, analysis) {
    const tokens = analysis.constraints.technicalTokens || [];
    if (tokens.length === 0) return [];
    const compact = (value) => normalizeChatText(value).replace(/\s+/g, '');
    const productMatchesToken = (product, token) => {
        if (nameContradictsToken(product, token)) return false;
        if (specsCoverToken(product, token)) return true;
        return compact([
            product.specifications, product.description, product.features, product.name,
        ].filter(Boolean).join(' ')).includes(compact(token));
    };
    return tokens
        .filter((token) => !products.some((product) => productMatchesToken(product, token)))
        .map(formatTechnicalToken);
}

/**
 * Tên riêng nước ngoài khách nhắc mà bên mình không bán ("so sánh biến tần Schneider với INVT").
 * Không tra được bằng danh mục — hãng không bán thì không có trong DB để mà khớp — nên nhận
 * dạng bằng âm vị học: tiếng Việt không có âm tiết nào ba phụ âm liền (trừ "ngh") hay không
 * nguyên âm, nên token kiểu "invt"/"abb" gần như chắc chắn là tên hãng.
 */
function findUnknownBrandTokens(products, analysis) {
    const candidates = (analysis.entities?.remainingTokens || [])
        .filter((token) => /^[a-z]{3,12}$/.test(token) && !token.startsWith('ngh'))
        .filter((token) => !/[aeiouy]/.test(token) || /[bcdfghjklmnpqrstvwxz]{3,}/.test(token));
    if (candidates.length === 0) return [];

    const haystack = normalizeChatText(products
        .map((product) => [product.name, product.brand, product.code, product.type].filter(Boolean).join(' '))
        .join(' '));
    return [...new Set(candidates.filter((token) => !haystack.includes(token)))]
        .slice(0, 2)
        .map((token) => token.toUpperCase());
}

/** Nói thật khi danh mục không có đúng thứ khách hỏi, thay vì chào món gần giống như thể là đúng. */
const WEAK_MATCH_OPENING = 'Danh mục bên mình hiện chưa có món nào đúng hẳn mô tả của bạn. '
    + 'Mình đưa nhóm gần nhất về công năng để bạn tham khảo, nếu chưa đúng ý thì bạn mô tả thêm giúp mình nhé.';

/**
 * Câu hỏi chung (cửa hàng, chính sách, kiến thức ngành, câu ngoài phạm vi) do model trả lời
 * trên thông tin cửa hàng và chính sách thật trong DB. Trả null khi model không dùng được
 * hoặc câu trả lời bị kiểm chứng loại — caller dùng câu có sẵn như trước.
 */
async function answerWithSupport({ payload, analysis, state }) {
    let policies = [];
    let store = {};
    try {
        [policies, store] = await Promise.all([getSupportPolicies(payload.message), getStoreInfo()]);
    } catch (error) {
        // Không đọc được cấu hình cửa hàng thì không để model đoán; quay về câu có sẵn.
        console.error('Chat support context unavailable:', error.message);
        return null;
    }
    const composed = await composeSupportReply({
        question: payload.message,
        policies,
        store: { ...store, hotline: SUPPORT_HOTLINE, paymentMethods: PAYMENT_METHODS_TEXT },
        productTypes: analysis.catalog?.types || [],
        messages: state?.messages || [],
        knownBrands: knownBrandsOf(analysis.catalog),
    });
    if (!composed.ok) return null;
    return {
        ...(composed.answerType === 'out_of_scope' ? { intent: 'out_of_scope' } : {}),
        reply: composed.reply,
        products: [],
        answerType: toPublicAnswerType(composed.answerType),
        needsHuman: composed.needsHuman === true,
        fallback: false,
        latencyMs: composed.latencyMs,
    };
}

/**
 * Điều backend đã biết chắc, đưa kèm bằng chứng để model không phải đoán:
 * khách cần gì, ràng buộc nào chưa đối chiếu được, có món đúng hẳn hay chỉ gần đúng.
 */
function buildComposeHints({ analysis, unverifiedPhrases = [], weakMatch = false, extra = {} }) {
    const hints = { ...extra };
    const understood = describeUnderstoodNeed(analysis);
    if (understood.length > 0) hints.customerNeed = understood;
    if (unverifiedPhrases.length > 0) hints.unverifiedConstraints = unverifiedPhrases;
    if (weakMatch) hints.exactMatch = false;
    return hints;
}

/**
 * Nhánh tư vấn, theo thứ tự ưu tiên:
 *   1. Model viết câu trả lời và câu đó qua được kiểm chứng (chatGrounding) -> dùng nguyên câu.
 *   2. Model chỉ chọn ID bằng chứng (hoặc câu viết bị loại) -> backend dựng câu từ lựa chọn.
 *   3. Model lỗi / hết quota / quá giờ -> tư vấn cục bộ từ dữ liệu đã nạp.
 */
async function buildAdviceAnswer({
    analysis, context, messages = [], shownProductIds = [], requestedFields = [],
}) {
    const candidates = context.products.length > 0 ? context.products : context.similarProducts;
    // Đã nói thẳng là chưa có đúng hàng thì thôi lưu ý "thông số chưa xác minh" nữa:
    // hai câu cùng một ý, dán liền nhau chỉ làm câu trả lời rối.
    // Chỉ ràng buộc SỐ chưa đối chiếu được mới đáng cảnh báo. Cụm mô tả bị nới ra khi truy vấn
    // (retrieval.unverifiedPhrases) không phải "thông số chưa xác minh" — dán câu cảnh báo đó vào
    // mọi câu trả lời cùng nhóm khiến bot tự nghi ngờ cả những món nó vừa khớp đúng thông số.
    const weakMatch = context.retrieval?.weakMatch === true;
    const unverifiedPhrases = weakMatch ? [] : findUnverifiedConstraints(candidates, analysis);
    const unverifiedNote = unverifiedPhrases.length > 0
        ? '\n\nLưu ý: các thông số kỹ thuật bạn nêu chưa được xác minh đầy đủ trong dữ liệu sản phẩm, nên đây chỉ là lựa chọn tham khảo. Bạn cần kiểm tra lại thông số trước khi mua hoặc lắp đặt.'
        : '';
    const evidence = buildProductEvidence(candidates, {
        requestedTypes: analysis.constraints.types,
        requestedBrands: analysis.constraints.brands,
    });

    const startedAt = Date.now();
    try {
        const composed = await composeProductReply({
            question: context.question,
            products: candidates,
            shownProductIds,
            messages,
            analysis,
            task: analysis.task,
            hints: buildComposeHints({ analysis, unverifiedPhrases, weakMatch }),
            knownBrands: knownBrandsOf(analysis.catalog),
            supportHotline: SUPPORT_HOTLINE,
        });
        // Chỉ-cùng-nhóm-công-năng là chỗ model tự tin nguy hiểm nhất ("mình gợi ý PLC này cho lò sấy"):
        // kiểm tra số/mã không bắt được nhận định, nên nhánh này luôn dựng câu từ template.
        // Ràng buộc chưa đối chiếu được đã nằm trong hints.unverifiedConstraints và prompt bắt model
        // nói rõ; không dán thêm câu lưu ý máy móc vì nó hay mâu thuẫn với chính câu model vừa viết.
        if (composed.ok && !weakMatch) {
            return {
                reply: composed.reply.slice(0, 3000),
                products: composed.products,
                answerType: composed.answerType,
                needsHuman: composed.needsHuman,
                latencyMs: composed.latencyMs,
                fallback: false,
                modelReply: true,
            };
        }
        if (!composed.selection) throw composed.error || new GeminiChatError('Không có lựa chọn từ model.', 'EMPTY_SELECTION');
        const selection = composed.selection;
        // Backend đã xác định rõ đối tượng và có ứng viên: không để model đổi thành câu hỏi lại.
        if (selection.answerType === 'clarification') {
            // Câu hỏi lại tự viết bị loại thì questionKey rỗng; đã có ứng viên nên hỏi thông số,
            // không hỏi "bạn đang hỏi sản phẩm nào".
            const questionKey = selection.questionKey || 'need_specs';
            return {
                reply: buildClarificationReply(questionKey), products: [],
                answerType: 'clarification', questionKey,
                needsHuman: selection.needsHuman, latencyMs: Date.now() - startedAt, fallback: false,
            };
        }
        if (selection.answerType === 'not_found') {
            return {
                reply: buildNotFoundReply({}), products: [], answerType: 'not_found',
                needsHuman: selection.needsHuman, latencyMs: Date.now() - startedAt, fallback: false,
            };
        }
        // Giọng tư vấn do model viết chỉ được dùng sau khi từng con số, từng mã hàng trong đó
        // được đối chiếu với evidence. Không đạt thì bỏ im lặng, quay về câu mở đầu mặc định.
        const { text: verifiedAdvisory } = verifyAdvisoryText(selection.advisory, { evidence });
        // Chỉ tìm được hàng "cùng công năng" thì câu dẫn tự tin của model là thứ nguy hiểm nhất:
        // nó biến "shop không có bộ điều khiển nhiệt độ" thành "mình gợi ý PLC này cho lò sấy".
        // Kiểm tra grounding không bắt được vì đó là nhận định, không phải con số.
        const advisory = weakMatch ? WEAK_MATCH_OPENING : verifiedAdvisory;
        // Chỉ những trường khách thật sự hỏi mới in đầy đủ; còn lại rút gọn vài dòng đầu,
        // đổ nguyên bảng thông số của 2-3 món vào bong bóng chat thì không ai đọc nổi.
        const rendered = renderEvidenceSelection(selection, evidence, { requestedFields, advisory });
        if (!rendered) throw new GeminiChatError('Lựa chọn không dựng được câu trả lời.', 'EMPTY_SELECTION');
        const selectedProducts = selection.productIds
            .slice(0, 3)
            .map((productId) => candidates.find((product) => product.productId === productId))
            .filter(Boolean);
        return {
            reply: (rendered + unverifiedNote).slice(0, 3000),
            products: selectedProducts.length > 0 ? selectedProducts : candidates,
            answerType: selection.answerType,
            needsHuman: selection.needsHuman,
            latencyMs: Date.now() - startedAt,
            fallback: false,
            advisory,
        };
    } catch (error) {
        if (!(error instanceof GeminiChatError)) throw error;
        // Chỉ ghi mã lỗi để chẩn đoán; không log prompt, key hay dữ liệu khách.
        console.error('Chat advice degraded to local reply:', error.code);
        // Model lỗi nhưng dữ liệu đã nạp đủ: vẫn trả tư vấn cục bộ, không báo lỗi hệ thống.
        return {
            reply: buildAdviceReply(candidates, { unverifiedPhrases }),
            products: candidates.slice(0, 3),
            answerType: 'advice',
            needsHuman: false,
            latencyMs: Date.now() - startedAt,
            fallback: true,
        };
    }
}

/**
 * Focus chỉ ghi khi đã xác định rõ đối tượng (một món, hoặc đúng hai món đang so sánh).
 * Danh sách kết quả tìm kiếm chỉ được lưu vào shownProductIds theo đúng thứ tự card.
 */
function buildProductMemory({
    products, focusedProducts = null, analysis, pendingQuestionKey,
    askedQuestionKeys = [], lastUserMessage = '',
}) {
    const shownProductIds = products.map((product) => product.productId);
    const focusSource = focusedProducts || (products.length === 1 ? products : []);
    return buildAssistantMemory({
        focusedProductIds: focusSource.map((product) => product.productId),
        shownProductIds,
        askedQuestionKeys,
        lastUserMessage,
        pendingQuestion: pendingQuestionKey
            ? {
                key: pendingQuestionKey,
                summary: analysis.normalized.slice(0, 400),
                types: analysis.constraints.types,
                brands: analysis.constraints.brands,
                technicalTokens: analysis.constraints.technicalTokens,
            }
            : null,
    });
}

/** Nói lại cho khách biết bot đã tiếp nhận được gì, bằng đúng dữ liệu đã trích được. */
function describeUnderstoodNeed(analysis) {
    const constraints = analysis.constraints || {};
    const formatNumber = (value) => String(Number(Number(value).toFixed(2)));
    const types = (constraints.types || []).length > 0 ? constraints.types : (constraints.functionalTypes || []);
    const technical = constraints.technicalConstraints || {};

    const parts = [];
    if (types.length > 0) parts.push('thiết bị nhóm ' + types.slice(0, 3).join(' / '));
    if ((constraints.brands || []).length > 0) parts.push('hãng ' + constraints.brands.slice(0, 2).join(', '));
    if (Number.isFinite(technical.power) && technical.power > 0) parts.push('công suất ' + formatNumber(technical.power) + ' kW');
    if (Number.isFinite(technical.voltage) && technical.voltage > 0) parts.push('điện áp ' + formatNumber(technical.voltage) + ' V');
    if (Number.isFinite(technical.current) && technical.current > 0) parts.push('dòng ' + formatNumber(technical.current) + ' A');
    return parts;
}

async function handleProductRequest({
    req, res, payload, analysis, state, requestStartedAt, retrievalMessage = null,
}) {
    const reference = resolveReferencedProducts({
        analysis,
        state,
        currentProductId: payload.currentProductId,
    });

    const context = await buildChatContext({
        message: retrievalMessage || payload.message,
        analysis,
        catalog: analysis.catalog || null,
        referencedProductIds: reference.productIds,
        currentProductId: payload.currentProductId,
        currentPath: payload.currentPath,
    });

    const respond = (result) => respondWithStoredChat(req, res, {
        chatPayload: payload,
        intent: analysis.primaryIntent,
        totalLatencyMs: Date.now() - requestStartedAt,
        ...result,
    });

    const askedQuestionKeys = state?.askedQuestionKeys || [];
    const messages = state?.messages || [];
    const previousShown = state?.shownProductIds || [];

    /** Chọn lại trong danh sách vừa hiện thì giữ nguyên thứ tự thẻ cũ, để lượt sau "cái thứ hai" vẫn đúng. */
    const memoryAfterComposed = (responseProducts, answerType) => {
        const ids = responseProducts.map((product) => product.productId);
        const subsetOfShown = ids.length > 0 && ids.every((id) => previousShown.includes(id));
        // Model tự hỏi lại ("1 pha hay 3 pha?") thì phải nhớ nhu cầu đang dở, để câu trả lời
        // cụt lượt sau ("3 pha") được ghép với câu trước thay vì bị hiểu là một câu mới vô nghĩa.
        const pendingQuestion = answerType === 'clarification'
            ? {
                key: 'model_question',
                summary: analysis.normalized.slice(0, 400),
                types: analysis.constraints.types,
                brands: analysis.constraints.brands,
                technicalTokens: analysis.constraints.technicalTokens,
            }
            : null;
        return buildAssistantMemory({
            focusedProductIds: ids.length <= 2 ? ids : [],
            shownProductIds: subsetOfShown ? previousShown : ids,
            askedQuestionKeys,
            lastUserMessage: payload.message,
            pendingQuestion,
        });
    };

    const respondComposed = (answer) => {
        const responseProducts = buildResponseProducts(answer.products || [], analysis);
        return respond({
            // Câu nối tiếp ("loại npn") không có từ khóa nào nên classifier gắn "ngoài phạm vi";
            // đã trả lời bằng hàng thì thống kê phải ghi đúng là câu hỏi sản phẩm.
            ...(['out_of_scope', 'nonsense_query'].includes(analysis.primaryIntent) ? { intent: 'product_search' } : {}),
            reply: answer.reply,
            products: responseProducts,
            answerType: answer.answerType,
            needsHuman: answer.needsHuman === true,
            fallback: false,
            latencyMs: answer.latencyMs,
            memory: memoryAfterComposed(responseProducts, answer.answerType),
        });
    };

    /** Để model viết câu trả lời trên một pool ứng viên; null nghĩa là đi tiếp đường luật cũ. */
    const tryComposed = async ({ products, task, hints = {} }) => {
        if (!products || products.length === 0) return null;
        const composed = await composeProductReply({
            question: payload.message,
            products,
            shownProductIds: previousShown,
            messages,
            analysis,
            task,
            hints: buildComposeHints({ analysis, extra: hints }),
            knownBrands: knownBrandsOf(analysis.catalog),
            supportHotline: SUPPORT_HOTLINE,
        });
        return composed.ok ? respondComposed(composed) : null;
    };

    /** Hàng cùng nhóm khách gọi tên, bỏ điều kiện hãng khi hãng đó không có món nào. */
    const loadGroupCandidates = async () => {
        const constraints = analysis.constraints || {};
        const types = (constraints.types || []).length > 0 ? constraints.types : (constraints.functionalTypes || []);
        if (types.length === 0) return [];
        const query = { types, technicalConstraints: constraints.technicalConstraints || null, limit: 6 };
        let found = await retrieveBroadCandidates({ ...query, brands: constraints.brands || [] });
        if (found.length === 0 && (constraints.brands || []).length > 0) found = await retrieveBroadCandidates(query);
        return found.map(toPublicProduct).filter(Boolean);
    };

    /**
     * Ứng viên cho câu nối tiếp không tự nêu món: các thẻ vừa hiện (nạp lại giá/tồn mới)
     * cộng hàng tra theo câu trước + câu này ("Có biến tần không" + "loại 3 pha").
     */
    const loadFollowUpPool = async () => {
        const { products: shownRaw } = await hydrateProductsByIds(previousShown);
        const shown = shownRaw.map(toPublicProduct).filter(Boolean);
        const previousUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
        let extra = [];
        if (previousUserMessage) {
            const combined = (previousUserMessage + '. ' + payload.message).slice(0, 600);
            const combinedAnalysis = analyzeChatMessage(combined, { catalog: analysis.catalog || null });
            if (combinedAnalysis.entities.hasCatalogMatch || combinedAnalysis.entities.codes.length > 0) {
                const combinedContext = await buildChatContext({
                    message: combined,
                    analysis: { ...combinedAnalysis, task: 'search' },
                    catalog: analysis.catalog || null,
                    includeSimilar: false,
                });
                extra = combinedContext.products;
            }
        }
        const seen = new Set();
        return [...shown, ...extra]
            .filter((product) => product?.productId && !seen.has(product.productId) && seen.add(product.productId))
            .slice(0, 8);
    };

    /**
     * Khách đã trả lời câu hỏi này rồi thì cấm hỏi lại: phải cố trả lời bằng dữ liệu đang có.
     * Pool ứng viên do backend dựng rồi mới đưa qua model chọn bằng chứng, nên hợp đồng
     * "model chỉ được chọn ID trong tập backend đưa" vẫn nguyên vẹn.
     */
    const respondBestEffort = async () => {
        const constraints = analysis.constraints || {};
        const poolTypes = (constraints.types || []).length > 0
            ? constraints.types
            : (constraints.functionalTypes || []);
        // Hàng gần đúng cũng là hàng: thà đưa ứng viên cùng nhóm kèm lý do còn hơn im lặng.
        const retrieved = context.products.length > 0 ? context.products : (context.similarProducts || []);
        const pool = retrieved.length > 0
            ? retrieved
            : (await retrieveBroadCandidates({
                types: poolTypes,
                brands: constraints.brands || [],
                sections: constraints.sections || [],
                technicalConstraints: constraints.technicalConstraints || null,
            })).map(toPublicProduct).filter(Boolean);

        if (pool.length === 0) {
            // Không còn gì để gợi ý thì vẫn hỏi, nhưng phải là một câu KHÁC.
            const nextKey = pickFollowUpQuestionKey(askedQuestionKeys) || 'missing_object';
            return respond({
                reply: buildClarificationReply(nextKey),
                products: [],
                answerType: 'clarification',
                needsHuman: false,
                memory: buildProductMemory({
                    products: [],
                    analysis,
                    pendingQuestionKey: nextKey,
                    askedQuestionKeys: [...askedQuestionKeys, nextKey],
                    lastUserMessage: payload.message,
                }),
            });
        }

        const adviceAnswer = await buildAdviceAnswer({
            analysis,
            context: { ...context, products: pool, similarProducts: [] },
            // Nhánh này là khách vừa bổ sung nhu cầu, thông số nêu ra là ràng buộc chứ không
            // phải yêu cầu đọc datasheet, nên không in nguyên bảng thông số.
            requestedFields: pickFactualFields(analysis, { hasSpecificProduct: false }),
            messages,
            shownProductIds: previousShown,
        });
        // Model đã tự viết câu trả lời có gắn hàng (và câu đó qua kiểm chứng): dùng luôn.
        // Câu model viết mà vẫn là hỏi lại thì không nhận — nhánh này là khách đã trả lời rồi.
        if (adviceAnswer.modelReply && adviceAnswer.products.length > 0
            && !['clarification', 'not_found'].includes(adviceAnswer.answerType)) {
            return respondComposed(adviceAnswer);
        }
        // Model được phép xin làm rõ, nhưng không phải ở nhánh này — đã hỏi rồi.
        const modelBody = adviceAnswer.answerType === 'clarification' || adviceAnswer.answerType === 'not_found'
            ? ''
            : adviceAnswer.reply;
        // Lời tư vấn đã kiểm chứng nằm ngay đầu câu model dựng; tách ra để nó đóng vai câu mở đầu,
        // nếu không sẽ có hai đoạn mở bài nói cùng một ý chồng lên nhau.
        const advisory = modelBody ? (adviceAnswer.advisory || '') : '';
        const modelDetails = advisory && modelBody.startsWith(advisory)
            ? modelBody.slice(advisory.length).trim()
            : modelBody;
        const selected = modelBody && adviceAnswer.products.length > 0 ? adviceAnswer.products : pool;
        const responseProducts = buildResponseProducts(selected, analysis);
        // Khách đã nêu thông số tải rồi thì hỏi lại "điện áp, công suất bao nhiêu" là vô duyên:
        // coi ô đó đã điền để câu hỏi tiếp theo chuyển sang thứ thật sự còn thiếu.
        const technical = (analysis.constraints || {}).technicalConstraints || {};
        const hasTechnicalSlot = ['power', 'voltage', 'current']
            .some((field) => Number.isFinite(technical[field]) && technical[field] > 0);
        const filledQuestionKeys = hasTechnicalSlot
            ? [...askedQuestionKeys, 'need_specs']
            : askedQuestionKeys;
        return respond({
            reply: buildBestEffortReply(responseProducts, {
                understood: describeUnderstoodNeed(analysis),
                askedQuestionKeys: filledQuestionKeys,
                // Model đã tự đính cảnh báo chưa xác minh vào câu của nó, không lặp lại.
                unverifiedPhrases: modelBody ? [] : (context.retrieval?.unverifiedPhrases || []),
                body: modelDetails,
                advisory,
            }),
            products: responseProducts,
            answerType: 'advice',
            needsHuman: false,
            fallback: adviceAnswer.fallback,
            latencyMs: adviceAnswer.latencyMs,
            memory: buildProductMemory({
                products: responseProducts,
                analysis,
                askedQuestionKeys,
                lastUserMessage: payload.message,
            }),
        });
    };

    // Chỉ cấm hỏi lại khi khách THỰC SỰ đưa thêm thông tin. Khách nói một câu rỗng nghĩa
    // hoặc đổi sang món khác mà chưa nêu tên thì hỏi lại vẫn là hành vi đúng.
    const messageAddsInformation = (analysis.entities.technicalTokens || []).length > 0
        || (analysis.entities.functionalGroups || []).length > 0
        || analysis.entities.types.length > 0
        || analysis.entities.brands.length > 0
        || analysis.entities.codes.length > 0;

    /** Mọi câu hỏi làm rõ đều đi qua đây để không bao giờ hỏi lại đúng câu khách vừa trả lời. */
    const respondClarification = ({ key, products = [], memoryProducts = [] }) => {
        if (askedQuestionKeys.includes(key) && messageAddsInformation) return respondBestEffort();
        return respond({
            reply: buildClarificationReply(key),
            products,
            answerType: 'clarification',
            needsHuman: false,
            memory: buildProductMemory({
                products: memoryProducts,
                analysis,
                pendingQuestionKey: key,
                askedQuestionKeys: [...askedQuestionKeys, key],
                lastUserMessage: payload.message,
            }),
        });
    };

    if (context.retrievalFailed) {
        return respond({
            reply: buildDataUnavailableReply(),
            products: [],
            answerType: 'not_found',
            needsHuman: false,
            fallback: true,
        });
    }

    // Câu nối tiếp không tự nêu món ("loại 3 pha", "cái rẻ nhất giá bao nhiêu", "loại npn"):
    // trước đây rơi vào câu hỏi lại chung chung hoặc "ngoài phạm vi" dù khách vừa xem danh sách.
    // Giờ model đọc lịch sử + danh sách thẻ vừa hiện để trả lời tiếp mạch; lỗi thì đi đường cũ.
    const ownSubject = analysis.entities.hasCatalogMatch || analysis.entities.codes.length > 0;
    if (!ownSubject && reference.productIds.length === 0 && !reference.ambiguous && previousShown.length > 0) {
        const answered = await tryComposed({ products: await loadFollowUpPool(), task: 'follow_up' });
        if (answered) return answered;
    }

    // Chỉ nhận diện được nhóm/nhãn hiệu chưa đủ để tự chọn sản phẩm cho khách.
    // Với câu hỏi tư vấn chung, phải thu thập mục đích và thông số trước.
    const hasSpecificProduct = analysis.entities.codes.length > 0
        || (analysis.entities.hasCatalogMatch && context.products.some((product) => product.code));
    const factualFields = pickFactualFields(analysis, { hasSpecificProduct });
    const isGeneralRecommendation = analysis.task === 'advice'
        || analysis.task === 'compare'
        || (analysis.task === 'search' && factualFields.length === 0);
    const hasUsageSignal = (analysis.entities.technicalTokens || []).length > 0
        || (analysis.hasIndustrySignal && analysis.entities.types.length === 0);
    if (isGeneralRecommendation && !hasSpecificProduct && !hasUsageSignal
        && (analysis.entities.types.length > 0 || analysis.entities.brands.length > 0)) {
        // Có hàng cùng nhóm thì model giới thiệu vài món kèm MỘT câu hỏi đúng loại hàng
        // (PLC hỏi số I/O, aptomat hỏi dòng tải) thay cho câu "đóng cắt, bảo vệ hay đo lường" dùng chung.
        const exactMatch = context.products.length > 0;
        const answered = await tryComposed({
            products: exactMatch ? context.products : await loadGroupCandidates(),
            task: 'advice',
            // Không món nào đủ điều kiện (vd đúng nhóm nhưng sai hãng): model phải nói rõ là chưa có.
            hints: exactMatch ? {} : { exactMatch: false },
        });
        if (answered) return answered;
        return respondClarification({ key: 'need_usage' });
    }

    // Cần làm rõ: chưa biết khách hỏi món nào.
    if (context.products.length === 0) {
        if (reference.ambiguous) {
            const key = reference.source === 'pair' ? 'ambiguous_pair'
                : reference.source === 'ordinal' ? 'ambiguous_ordinal' : 'missing_object';
            return respondClarification({ key });
        }
        if (context.retrieval?.missingCodes?.length > 0) {
            return respond({
                reply: buildNotFoundReply({
                    missingCodes: context.retrieval.missingCodes,
                    nearCodeProducts: context.retrieval.nearCodeProducts,
                }),
                products: [],
                answerType: 'not_found',
                needsHuman: false,
            });
        }
        // Nhận ra nhóm hàng nhưng không món nào đủ điều kiện ("relay thời gian Omron", "cảm biến quang"):
        // nói thẳng là chưa có rồi giới thiệu hàng cùng nhóm đang bán, thay vì một câu "không tìm thấy" cụt.
        if ((analysis.constraints.types || []).length > 0) {
            const answered = await tryComposed({
                products: await loadGroupCandidates(),
                task: 'not_found',
                hints: { exactMatch: false },
            });
            if (answered) return answered;
        }
        // Đã tra cứu có kiểm soát mà không có gì liên quan ngành: lúc này mới chốt ngoài phạm vi.
        const searchedNothingRelated = context.retrieval?.queried === true
            && !analysis.entities.hasCatalogMatch
            && analysis.entities.codes.length === 0
            && !analysis.hasIndustrySignal
            && analysis.task !== 'advice'
            && analysis.task !== 'compare';
        if (searchedNothingRelated) {
            // "Giá bitcoin" mang chữ "giá" nên đi vào nhánh hàng hóa; model từ chối lịch sự
            // (hoặc trả lời nếu đó thật ra là câu hỏi về cửa hàng), lỗi thì dùng câu có sẵn.
            const support = await answerWithSupport({ payload, analysis, state });
            return respond(support || {
                intent: 'out_of_scope',
                reply: LOCAL_REPLIES.out_of_scope,
                products: [],
                answerType: 'out_of_scope',
                needsHuman: false,
            });
        }
        // Khách nói theo công trình/hệ thống ("trạm trộn bê tông cần những thiết bị gì"): danh mục có
        // section đúng tên đó thì đưa hàng của section cho model tư vấn; còn không thì để model giải thích
        // bằng kiến thức chung và hỏi thêm, thay cho câu hỏi "đóng cắt, bảo vệ hay đo lường" dùng chung.
        if ((analysis.entities.sections || []).length > 0) {
            const sectionPool = (await retrieveBroadCandidates({ sections: analysis.entities.sections, limit: 8 }))
                .map(toPublicProduct).filter(Boolean);
            const answered = await tryComposed({ products: sectionPool, task: 'advice' });
            if (answered) return answered;
        }
        if (!ownSubject && (analysis.hasIndustrySignal || analysis.task === 'advice')) {
            const support = await answerWithSupport({ payload, analysis, state });
            if (support && support.answerType !== 'out_of_scope') {
                return respond({ ...support, intent: analysis.primaryIntent });
            }
        }
        // Câu không tự nêu được đối tượng thì hỏi lại đúng điểm còn thiếu.
        const hasOwnSubject = analysis.entities.hasCatalogMatch || analysis.entities.codes.length > 0;
        const hasTechnicalNeed = (analysis.entities.technicalTokens || []).length > 0;
        if (!hasOwnSubject && !hasTechnicalNeed) {
            // "Tủ điện nhà xưởng cần những thiết bị gì" là hỏi tư vấn, không phải quên nói tên hàng:
            // hỏi "bạn đang hỏi sản phẩm nào" là cụt đường, hỏi theo chức năng thì khách trả lời được.
            const key = analysis.task === 'advice' || analysis.task === 'compare' || analysis.hasIndustrySignal
                ? 'need_usage'
                : 'missing_object';
            return respondClarification({ key });
        }
        if (analysis.task === 'advice' || analysis.task === 'compare' || analysis.hasIndustrySignal) {
            return respondClarification({ key: 'need_usage' });
        }
        return respond({
            reply: buildNotFoundReply({
                types: analysis.constraints.types,
                brands: analysis.constraints.brands,
            }),
            products: [],
            answerType: 'not_found',
            needsHuman: false,
        });
    }

    // So sánh chỉ chạy khi có đúng hai đối tượng rõ.
    if (analysis.task === 'compare') {
        if (context.products.length !== 2) {
            // "Biến tần với khởi động mềm khác gì nhau" là hỏi khái niệm hai loại thiết bị, không phải
            // chỉ vào hai thẻ; chỉ khi khách thật sự nhắc "hai cái này" mới cần hỏi lại cặp nào.
            const referenceKind = analysis.reference?.kind || 'none';
            if (referenceKind === 'none' || referenceKind === 'contextual') {
                const answered = await tryComposed({ products: context.products, task: 'compare' });
                if (answered) return answered;
            }
            return respondClarification({
                key: 'ambiguous_pair',
                products: buildResponseProducts(context.products, analysis),
                memoryProducts: context.products.slice(0, MAX_RESPONSE_PRODUCTS),
            });
        }
        const responseProducts = buildResponseProducts(context.products, analysis);
        return respond({
            reply: buildComparisonReply(context.products, factualFields, {
                missingMentions: findUnknownBrandTokens(context.products, analysis),
            }),
            products: responseProducts,
            answerType: 'comparison',
            needsHuman: false,
            memory: buildProductMemory({
                products: responseProducts,
                focusedProducts: responseProducts,
                analysis,
            }),
        });
    }

    // Dữ kiện được hỏi rõ: renderer cục bộ trả lời, không gọi model chỉ để lặp dữ liệu.
    if (factualFields.length > 0) {
        // Chỉ trả thẳng khi biết CHẮC khách hỏi món nào. "Mua 10 cái contactor có giảm giá không"
        // hay "loadcell Keli bao nhiêu tiền" chỉ nêu nhóm hàng; báo giá món đứng đầu danh sách
        // là trả lời một câu khách không hỏi. Khi đó để model trả lời trên cả danh sách.
        const definiteTarget = reference.productIds.length > 0
            || context.retrieval?.relevance === RELEVANCE.EXACT
            || context.products.length === 1;
        if (!definiteTarget) {
            const answered = await tryComposed({ products: context.products, task: 'details' });
            if (answered) return answered;
            // Model không dùng được: vẫn không báo riêng món đầu, mà nêu dữ kiện của vài món đầu danh sách.
            const listed = buildResponseProducts(context.products.slice(0, 3), analysis);
            return respond({
                reply: listed.map((product) => '- ' + buildFactualReply(product, factualFields).replace(/\n/g, ' ')).join('\n'),
                products: listed,
                answerType: 'direct',
                needsHuman: false,
                fallback: true,
                memory: buildProductMemory({ products: listed, analysis }),
            });
        }
        const target = context.products[0];
        const reply = target.availability === 'out_of_stock' && factualFields.length === 1 && factualFields[0] === 'stock'
            ? buildOutOfStockReply(target, context.similarProducts)
            : buildFactualReply(target, factualFields);
        const responseProducts = buildResponseProducts([target], analysis);
        return respond({
            reply,
            products: responseProducts,
            answerType: 'direct',
            needsHuman: false,
            // Trả lời về một món chọn ra từ danh sách ("cái đầu tiên có bao nhiêu I/O") thì danh sách
            // khách đang xem vẫn còn đó: giữ thứ tự thẻ cũ để "so sánh cái 1 với cái 2" lượt sau còn đúng.
            memory: reference.productIds.length > 0 && previousShown.length > 1
                ? buildAssistantMemory({
                    focusedProductIds: responseProducts.map((product) => product.productId),
                    shownProductIds: previousShown,
                    askedQuestionKeys,
                })
                : buildProductMemory({ products: responseProducts, analysis }),
        });
    }

    const adviceAnswer = await buildAdviceAnswer({
        analysis,
        context,
        requestedFields: factualFields,
        messages,
        shownProductIds: previousShown,
    });
    if (adviceAnswer.modelReply && !(['clarification', 'not_found'].includes(adviceAnswer.answerType)
        && askedQuestionKeys.length > 0 && messageAddsInformation)) {
        return respondComposed(adviceAnswer);
    }
    // Model cũng không được phép hỏi lại đúng câu khách vừa trả lời. Và khi bot đã hỏi
    // một lần, khách đã bổ sung thông tin, backend lại đang cầm sẵn ứng viên thì hỏi
    // thêm câu nữa — hay tệ hơn là báo "không tìm thấy" — vẫn là trả lời lòng vòng.
    // Backend đã có bằng chứng thì model không được phủ nhận, phải đưa hàng ra.
    const hasCandidates = context.products.length > 0 || (context.similarProducts || []).length > 0;
    const modelRefusedToAnswer = adviceAnswer.answerType === 'clarification'
        || adviceAnswer.answerType === 'not_found';
    if (modelRefusedToAnswer
        && askedQuestionKeys.length > 0
        && messageAddsInformation
        && (askedQuestionKeys.includes(adviceAnswer.questionKey) || hasCandidates)) {
        return respondBestEffort();
    }
    const responseProducts = buildResponseProducts(adviceAnswer.products, analysis);
    const nextAskedKeys = adviceAnswer.questionKey
        ? [...askedQuestionKeys, adviceAnswer.questionKey]
        : askedQuestionKeys;
    return respond({
        reply: adviceAnswer.reply,
        products: responseProducts,
        answerType: adviceAnswer.answerType,
        needsHuman: adviceAnswer.needsHuman,
        fallback: adviceAnswer.fallback,
        latencyMs: adviceAnswer.latencyMs,
        memory: buildProductMemory({
            products: responseProducts,
            analysis,
            pendingQuestionKey: adviceAnswer.questionKey,
            askedQuestionKeys: nextAskedKeys,
            lastUserMessage: adviceAnswer.questionKey ? payload.message : '',
        }),
    });
}

async function sendChatMessage(req, res) {
    const requestStartedAt = Date.now();
    try {
        const payload = validateChatSendPayload(req.body);
        const userId = getAuthenticatedUserId(req);

        let catalog = null;
        try {
            catalog = await getCatalogMetadata();
        } catch (error) {
            // Không đổi lỗi danh mục thành "ngoài phạm vi"; nhánh độc lập vẫn chạy.
            if (!(error instanceof CatalogUnavailableError)) throw error;
            console.error('Catalog metadata unavailable:', error.message);
        }

        const state = await loadConversationState({
            chatSessionId: payload.chatSessionId,
            visitorId: payload.visitorId,
            userId,
        });

        const analyze = (text) => analyzeChatMessage(text, {
            catalog,
            hasStoredFocus: state.focusedProductIds.length > 0 || state.shownProductIds.length > 0,
            currentProductId: payload.currentProductId,
        });
        const baseAnalysis = analyze(payload.message);
        // Khách vừa trả lời câu hỏi làm rõ: gộp ngữ cảnh trước khi merge pendingQuestion,
        // vì retrieval tự phân tích lại từ văn bản chứ không đọc analysis có sẵn.
        const followUp = applyFollowUpContext({
            message: payload.message,
            analysis: baseAnalysis,
            state,
            analyze,
        });
        const analysis = { ...mergePendingQuestion(followUp.analysis, state.pendingQuestion), catalog };

        const respond = (result) => respondWithStoredChat(req, res, {
            chatPayload: payload,
            intent: analysis.primaryIntent,
            totalLatencyMs: Date.now() - requestStartedAt,
            ...result,
        });

        if (analysis.primaryIntent === 'order_status_query') {
            // Chưa đăng nhập thì không chạm tới dữ liệu đơn, chỉ mời đăng nhập.
            if (!req.user) {
                return await respond({
                    reply: LOCAL_REPLIES.order_needs_login,
                    products: [],
                    answerType: 'clarification',
                    needsHuman: false,
                });
            }
            const orders = await getOwnOrderStatuses(req.user);
            return await respond({
                reply: buildOrderReply(orders, analysis.orderAction),
                products: [],
                answerType: 'direct',
                needsHuman: false,
            });
        }

        if (analysis.primaryIntent === 'human_handoff') {
            return await respond({
                reply: LOCAL_REPLIES.human_handoff,
                products: [],
                answerType: 'direct',
                needsHuman: true,
            });
        }

        if (analysis.primaryIntent === 'nonsense_query') {
            return await respond({
                reply: LOCAL_REPLIES.nonsense_query,
                products: [],
                answerType: 'clarification',
                needsHuman: false,
            });
        }

        if (analysis.primaryIntent === 'greeting') {
            return await respond({
                reply: LOCAL_REPLIES[analysis.smallTalk] || LOCAL_REPLIES.greeting,
                products: [],
                answerType: 'direct',
                needsHuman: false,
            });
        }

        // Bảo hành của một món khác chính sách bảo hành chung; hỏi cả hai thì trả cả hai.
        if (analysis.primaryIntent === 'warranty_query' && analysis.warrantyScope !== 'product') {
            // Chỉ hỏi chính sách chung thì trả lời đúng ý hỏi trên văn bản chính sách. Hỏi cả thời hạn
            // của một món ("both") vẫn dựng từ DB vì phải tách rõ hai nguồn dữ kiện.
            if (analysis.warrantyScope === 'policy') {
                const support = await answerWithSupport({ payload, analysis, state });
                if (support && support.answerType !== 'out_of_scope') {
                    return await respond({ ...support, intent: analysis.primaryIntent });
                }
            }
            const context = await buildChatContext({
                message: payload.message,
                analysis: null,
                currentProductId: analysis.warrantyScope === 'both' ? payload.currentProductId : undefined,
                currentPath: payload.currentPath,
                includeSimilar: false,
            });
            return await respond({
                reply: analysis.warrantyScope === 'both'
                    ? buildWarrantyCombinedReply(context.currentProduct, context.policies)
                    : buildPolicyReply(context.policies),
                products: [],
                answerType: 'direct',
                needsHuman: false,
            });
        }

        if (['policy_query', 'shipping_query'].includes(analysis.primaryIntent)) {
            // "Giao hàng mất mấy ngày", "có xuất VAT không": trả lời đúng ý hỏi trên văn bản chính sách
            // thật; trước đây bot chép nguyên 3 mục chính sách đầu tiên dù khách hỏi một ý rất cụ thể.
            const support = await answerWithSupport({ payload, analysis, state });
            // Luật đã nhận ra đây là câu hỏi chính sách thì model không được chốt "ngoài phạm vi".
            if (support && support.answerType !== 'out_of_scope') {
                return await respond({ ...support, intent: analysis.primaryIntent });
            }
            const context = await buildChatContext({
                message: payload.message,
                analysis: null,
                currentPath: payload.currentPath,
                includeSimilar: false,
            });
            return await respond({
                reply: buildPolicyReply(context.policies),
                products: [],
                answerType: 'direct',
                needsHuman: false,
            });
        }

        if (analysis.resolution === 'out_of_scope') {
            // "Shop ở đâu", "PLC là gì", "sản phẩm nào bán chạy": không có tên hàng nhưng vẫn là việc
            // của cửa hàng. Model trả lời hoặc từ chối lịch sự; lỗi thì dùng câu có sẵn như trước.
            const support = await answerWithSupport({ payload, analysis, state });
            return await respond(support || {
                intent: 'out_of_scope',
                reply: LOCAL_REPLIES.out_of_scope,
                products: [],
                answerType: 'out_of_scope',
                needsHuman: false,
            });
        }

        return await handleProductRequest({
            req, res, payload, analysis, state, requestStartedAt,
            retrievalMessage: followUp.retrievalMessage,
        });
    } catch (error) {
        if (error instanceof ChatValidationError || isValidationError(error)) {
            return res.status(400).json({ success: 0, message: error.message });
        }
        console.error('Error processing chat message:', error);
        return res.status(500).json({ success: 0, message: 'Trợ lý đang tạm thời không phản hồi. Vui lòng thử lại sau.' });
    }
}

async function clearChat(req, res) {
    try {
        const payload = validateChatClearPayload(req.body);
        const filter = buildChatHistoryFilter(payload, req);
        const result = await ChatMessage.deleteMany(filter);
        return res.json({
            success: 1,
            message: 'Đã xóa lịch sử phiên chat.',
            deleted: result.deletedCount,
        });
    } catch (error) {
        if (error instanceof ChatValidationError) {
            return res.status(400).json({ success: 0, message: error.message });
        }
        console.error('Error clearing chat history:', error);
        return res.status(500).json({ success: 0, message: 'Không thể xóa lịch sử chat lúc này.' });
    }
}

async function recordCustomerBehavior(req, res) {
    try {
        const { events } = validateCustomerBehaviorPayload(req.body);

        // userId luôn lấy từ cookie đã xác thực, không tin giá trị frontend gửi lên.
        const authenticatedUserId = req.user?.userId || req.user?._id;
        const documents = events.map((event) => ({
            ...event,
            ...(authenticatedUserId ? { userId: authenticatedUserId } : {}),
        }));

        const createdEvents = await CustomerBehavior.insertMany(documents, { ordered: true });

        return res.status(201).json({
            success: 1,
            accepted: createdEvents.length,
        });
    } catch (error) {
        if (isValidationError(error)) {
            return res.status(400).json({
                success: 0,
                message: error.message,
            });
        }

        console.error('Error recording customer behavior:', error);
        return res.status(500).json({
            success: 0,
            message: 'Không thể lưu hành vi khách hàng lúc này.',
        });
    }
}

module.exports = {
    clearChat,
    getChatHistory,
    recordCustomerBehavior,
    sendChatMessage,
};
