const mongoose = require('mongoose');
const {
    ChatMessage,
    MAX_ASKED_QUESTION_KEYS,
    MAX_FOCUSED_PRODUCTS,
    MAX_LAST_USER_MESSAGE_LENGTH,
    MAX_SHOWN_PRODUCTS,
} = require('../models/chatmessage');

const MAX_HISTORY_MESSAGES = 10;

const toObjectId = (value) => {
    const normalized = String(value || '').trim().slice(0, 24);
    return mongoose.Types.ObjectId.isValid(normalized) ? new mongoose.Types.ObjectId(normalized) : null;
};

const toIdString = (value) => (value ? String(value) : '');

/** Cùng phạm vi với lịch sử chat: phiên + visitor + đúng chủ sở hữu (hoặc guest chưa đăng nhập). */
function buildConversationScope({ chatSessionId, visitorId, userId }) {
    return {
        chatSessionId,
        visitorId,
        userId: userId || { $exists: false },
    };
}

/**
 * Nạp ngữ cảnh hội thoại từ lịch sử đã lưu phía server.
 * Client history chỉ là text chưa tin cậy nên không dùng để xác nhận giá, quyền hay trạng thái.
 */
async function loadConversationState({ chatSessionId, visitorId, userId, limit = MAX_HISTORY_MESSAGES }) {
    const scope = buildConversationScope({ chatSessionId, visitorId, userId });
    let messages = [];
    let degraded = false;

    try {
        messages = await ChatMessage.find(scope)
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit)
            .select('role content intent answerType memory createdAt')
            .lean();
        messages.reverse();
    } catch (error) {
        // Lịch sử lỗi không được làm hỏng câu trả lời; lượt này chỉ mất ngữ cảnh cũ.
        console.error('Error loading conversation state:', error);
        degraded = true;
    }

    const assistantWithMemory = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant' && message.memory);
    const memory = assistantWithMemory?.memory || null;

    const latestShown = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant' && message.memory?.shownProductIds?.length);

    // Gom từ toàn bộ lịch sử chứ không chỉ lượt cuối: một lượt trả lời thành công xen giữa
    // không được xoá ký ức rằng bot đã hỏi câu đó rồi.
    const askedQuestionKeys = [...new Set(
        messages.flatMap((message) => (message.role === 'assistant' ? message.memory?.askedQuestionKeys || [] : [])),
    )].slice(-MAX_ASKED_QUESTION_KEYS);

    return {
        askedQuestionKeys,
        lastUserMessage: String(memory?.lastUserMessage || '').slice(0, MAX_LAST_USER_MESSAGE_LENGTH),
        degraded,
        messages,
        memory,
        focusedProductIds: (memory?.focusedProductIds || []).map(toIdString).filter(Boolean).slice(0, MAX_FOCUSED_PRODUCTS),
        shownProductIds: (latestShown?.memory?.shownProductIds || []).map(toIdString).filter(Boolean).slice(0, MAX_SHOWN_PRODUCTS),
        selectedVariants: (memory?.selectedVariants || []).map((item) => ({
            productId: toIdString(item.productId),
            variantId: toIdString(item.variantId),
        })).filter((item) => item.productId),
        pendingQuestion: memory?.pendingQuestion || null,
    };
}

/**
 * Chọn đối tượng khách đang hỏi theo thứ tự ưu tiên ở mục 6.2 kế hoạch.
 * Trả về danh sách ID cần hydrate lại, kèm nguồn và cờ cần hỏi lại.
 */
function resolveReferencedProducts({ analysis, state, currentProductId }) {
    const reference = analysis?.reference || { kind: 'none', ordinal: null };
    const shown = state?.shownProductIds || [];
    const focused = state?.focusedProductIds || [];

    // 1. Mã hoặc tên rõ trong câu hiện tại luôn thắng ngữ cảnh cũ.
    if (analysis?.entities?.codes?.length > 0 || analysis?.entities?.hasCatalogMatch) {
        return { productIds: [], source: 'current_message', ambiguous: false };
    }

    // 2. "Sản phẩm đang xem" dùng đúng trang hiện tại; thứ tự ordinal theo danh sách đã hiển thị.
    if (reference.kind === 'current_page') {
        return currentProductId
            ? { productIds: [currentProductId], source: 'current_page', ambiguous: false }
            : { productIds: focused.slice(0, 1), source: 'focus', ambiguous: focused.length === 0 };
    }
    if (reference.kind === 'ordinal') {
        if (shown.length === 0) return { productIds: [], source: 'ordinal', ambiguous: true };
        const index = reference.ordinal === -1 ? shown.length - 1 : reference.ordinal - 1;
        const picked = shown[index];
        return picked
            ? { productIds: [picked], source: 'ordinal', ambiguous: false }
            : { productIds: [], source: 'ordinal', ambiguous: true };
    }
    if (reference.kind === 'ordinals') {
        // "cái 1 với cái 2": lấy đúng các vị trí khách chỉ trong danh sách thẻ đã hiện.
        const picked = (reference.ordinals || [])
            .map((ordinal) => shown[ordinal === -1 ? shown.length - 1 : ordinal - 1])
            .filter(Boolean);
        return picked.length === (reference.ordinals || []).length && picked.length >= 2
            ? { productIds: [...new Set(picked)], source: 'ordinals', ambiguous: false }
            : { productIds: [], source: 'pair', ambiguous: true };
    }
    if (reference.kind === 'pair') {
        if (focused.length === 2) return { productIds: focused, source: 'focus_pair', ambiguous: false };
        if (shown.length === 2) return { productIds: shown, source: 'shown_pair', ambiguous: false };
        // Vừa đưa nhiều món thì phải hỏi cặp nào, không tự chọn hai món đầu.
        return { productIds: [], source: 'pair', ambiguous: true };
    }

    // 3. "Cái này" dùng focus cũ khi chỉ có đúng một đối tượng rõ.
    if (reference.kind === 'contextual') {
        if (focused.length === 1) return { productIds: focused, source: 'focus', ambiguous: false };
        if (currentProductId) return { productIds: [currentProductId], source: 'current_page', ambiguous: false };
        if (shown.length === 1) return { productIds: shown, source: 'shown', ambiguous: false };
        return { productIds: [], source: 'contextual', ambiguous: true };
    }

    // 4. Câu không có từ tham chiếu: dùng focus, rồi mới tới trang đang xem.
    // Danh sách đã hiển thị trước đó không làm câu mới trở nên mơ hồ.
    if (focused.length > 0) return { productIds: focused, source: 'focus', ambiguous: false };
    if (currentProductId) return { productIds: [currentProductId], source: 'current_page', ambiguous: false };
    if (shown.length === 1) return { productIds: shown, source: 'shown', ambiguous: false };
    return { productIds: [], source: 'none', ambiguous: false };
}

const MAX_FOLLOW_UP_LENGTH = 600;

/**
 * Khách vừa trả lời câu hỏi làm rõ thì bot phải tiếp nhận cả nhu cầu đã nêu ở lượt trước.
 * Ghép câu cũ vào câu mới để TRA CỨU (retrieval tự phân tích lại từ văn bản, không đọc
 * analysis có sẵn), còn ý định và trường được hỏi vẫn theo câu mới — khách đang nói tiếp.
 * Chỉ ghép khi câu cũ thật sự mang nhóm hàng/mã/chức năng: ghép một câu rỗng nghĩa
 * ("tôi muốn tư vấn sản phẩm cần mua") chỉ làm nhiễu cụm tìm kiếm.
 */
function applyFollowUpContext({ message, analysis, state, analyze }) {
    const unchanged = { retrievalMessage: message, analysis };
    const previous = String(state?.lastUserMessage || '').trim();
    if (!previous || !state?.pendingQuestion || typeof analyze !== 'function') return unchanged;
    // Câu mới đã tự nêu được món/nhóm thì đứng một mình là đủ rõ.
    if (analysis?.entities?.hasCatalogMatch || (analysis?.entities?.codes || []).length > 0) return unchanged;

    const previousAnalysis = analyze(previous);
    const carriesNeed = previousAnalysis?.entities?.hasCatalogMatch
        || (previousAnalysis?.entities?.codes || []).length > 0
        || (previousAnalysis?.entities?.functionalTypes || []).length > 0;
    if (!carriesNeed) return unchanged;

    const retrievalMessage = (previous + '. ' + message).slice(0, MAX_FOLLOW_UP_LENGTH);
    const combined = analyze(retrievalMessage);
    if (!combined?.entities) return unchanged;

    const resolved = combined.entities.hasCatalogMatch || combined.entities.codes.length > 0;
    return {
        retrievalMessage,
        analysis: {
            ...analysis,
            entities: combined.entities,
            constraints: combined.constraints,
            hasIndustrySignal: analysis.hasIndustrySignal || combined.hasIndustrySignal,
            resolution: resolved ? 'resolved' : analysis.resolution,
            resolutionReason: resolved ? 'follow_up_merge' : analysis.resolutionReason,
            mergedFromPendingQuestion: state.pendingQuestion.key || true,
        },
    };
}

/** Câu trả lời ngắn cho câu hỏi đang chờ được gộp lại với nhu cầu trước đó. */
function mergePendingQuestion(analysis, pendingQuestion) {
    if (!pendingQuestion) return analysis;
    const hasNewEntity = analysis?.entities?.hasCatalogMatch || analysis?.entities?.codes?.length > 0;
    if (hasNewEntity) return analysis; // Đổi nhóm/món mới rõ thì bỏ điều kiện cũ.

    const merged = { ...analysis };
    merged.entities = {
        ...analysis.entities,
        types: [...new Set([...(analysis.entities.types || []), ...(pendingQuestion.types || [])])],
        brands: [...new Set([...(analysis.entities.brands || []), ...(pendingQuestion.brands || [])])],
        technicalTokens: [...new Set([
            ...(analysis.entities.technicalTokens || []),
            ...(pendingQuestion.technicalTokens || []),
        ])],
    };
    merged.entities.hasCatalogMatch = merged.entities.types.length > 0 || merged.entities.brands.length > 0;
    merged.constraints = {
        ...analysis.constraints,
        types: merged.entities.types,
        brands: merged.entities.brands,
        technicalTokens: merged.entities.technicalTokens,
        technicalConstraints: merged.entities.technicalConstraints || analysis.constraints?.technicalConstraints || null,
    };
    merged.mergedFromPendingQuestion = pendingQuestion.key || true;
    if (merged.entities.hasCatalogMatch) {
        merged.resolution = 'resolved';
        merged.resolutionReason = 'pending_question_merge';
    }
    return merged;
}

/** Bộ nhớ ghi kèm câu trả lời: chỉ ID và câu hỏi đang chờ, không lưu giá/tồn kho. */
function buildAssistantMemory({
    focusedProductIds = [],
    shownProductIds = [],
    selectedVariants = [],
    pendingQuestion = null,
    askedQuestionKeys = [],
    lastUserMessage = '',
} = {}) {
    const focused = focusedProductIds.map(toObjectId).filter(Boolean).slice(0, MAX_FOCUSED_PRODUCTS);
    const shown = shownProductIds.map(toObjectId).filter(Boolean).slice(0, MAX_SHOWN_PRODUCTS);
    const variants = selectedVariants
        .map((item) => ({ productId: toObjectId(item?.productId), variantId: toObjectId(item?.variantId) }))
        .filter((item) => item.productId && item.variantId)
        .slice(0, 2);

    const asked = [...new Set((askedQuestionKeys || []).map((key) => String(key || '').slice(0, 64)).filter(Boolean))]
        .slice(-MAX_ASKED_QUESTION_KEYS);
    const previousMessage = String(lastUserMessage || '').trim().slice(0, MAX_LAST_USER_MESSAGE_LENGTH);

    const memory = {};
    if (focused.length > 0) memory.focusedProductIds = focused;
    if (shown.length > 0) memory.shownProductIds = shown;
    if (variants.length > 0) memory.selectedVariants = variants;
    if (asked.length > 0) memory.askedQuestionKeys = asked;
    if (previousMessage) memory.lastUserMessage = previousMessage;
    if (pendingQuestion?.key) {
        memory.pendingQuestion = {
            key: String(pendingQuestion.key).slice(0, 64),
            summary: String(pendingQuestion.summary || '').slice(0, 400),
            ...(pendingQuestion.types?.length ? { types: pendingQuestion.types.slice(0, 5) } : {}),
            ...(pendingQuestion.brands?.length ? { brands: pendingQuestion.brands.slice(0, 5) } : {}),
            ...(pendingQuestion.technicalTokens?.length
                ? { technicalTokens: pendingQuestion.technicalTokens.slice(0, 6) }
                : {}),
        };
    }
    return Object.keys(memory).length > 0 ? memory : undefined;
}

module.exports = {
    MAX_FOLLOW_UP_LENGTH,
    MAX_HISTORY_MESSAGES,
    applyFollowUpContext,
    buildAssistantMemory,
    buildConversationScope,
    loadConversationState,
    mergePendingQuestion,
    resolveReferencedProducts,
};
