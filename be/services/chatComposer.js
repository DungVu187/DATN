/**
 * Nhờ Gemini VIẾT câu trả lời trên bằng chứng backend đưa, rồi soi lại trước khi cho khách thấy.
 *
 * Phân công trong kiến trúc lai:
 *   - Backend (luật + DB) quyết định đối tượng, nạp dữ liệu công khai, trả thẳng các câu dữ kiện
 *     đã rõ món (giá/tồn/bảo hành), đơn hàng, và là nơi DUY NHẤT sở hữu dữ kiện.
 *   - Model chỉ làm phần ngôn ngữ: hiểu câu nối tiếp, diễn đạt tự nhiên, tư vấn trên dữ liệu có sẵn.
 *   - chatGrounding soi từng con số / mã / hãng / lời hứa; sai một chỗ là bỏ, caller quay về đường cũ.
 * Hàm ở đây không bao giờ ném lỗi model ra ngoài: kết quả `ok: false` nghĩa là "tự trả lời bằng luật".
 */
const { GeminiChatError, generateEvidenceSelection } = require('./geminiChat');
const { verifyReplyText } = require('./chatGrounding');
const { buildProductEvidence } = require('./chatReplyTemplates');

const MAX_PROMPT_HISTORY = 8;
const MAX_HISTORY_CONTENT_LENGTH = 600;
// Bảng thông số đầy đủ của 8 món làm prompt phình vài chục KB, model chậm hẳn đi.
// Bản gửi model được cắt ngắn; bản đối chiếu grounding vẫn giữ đầy đủ.
const MAX_PROMPT_FACT_LENGTH = 600;
const MAX_PROMPT_POLICY_SECTION_LENGTH = 700;
const MAX_COMPOSE_PRODUCTS = 8;

/** Lịch sử lấy từ server (đã đúng phạm vi), không dùng history client gửi lên. */
function buildPromptHistory(messages = []) {
    return messages
        .filter((message) => ['user', 'assistant'].includes(message.role) && message.content)
        .slice(-MAX_PROMPT_HISTORY)
        .map((message) => ({
            role: message.role,
            content: String(message.content).slice(0, MAX_HISTORY_CONTENT_LENGTH),
        }));
}

const userTextsOf = (question, messages = []) => [
    question,
    ...messages.filter((message) => message.role === 'user').map((message) => message.content),
];

function trimFactsForPrompt(evidence) {
    return {
        ...evidence,
        facts: evidence.facts.map((fact) => ({
            ...fact,
            text: String(fact.text || '').slice(0, MAX_PROMPT_FACT_LENGTH),
        })),
    };
}

function logRejection(label, violations) {
    // Chỉ ghi mã vi phạm (vd so_la:24) để chẩn đoán; không log prompt hay câu của khách.
    console.warn('[chat] Bỏ câu trả lời model (' + label + '): ' + violations.slice(0, 6).join(', '));
}

async function callModel(options) {
    const startedAt = Date.now();
    try {
        const selection = await generateEvidenceSelection(options);
        return { selection: selection || null, latencyMs: Date.now() - startedAt };
    } catch (error) {
        if (!(error instanceof GeminiChatError)) throw error;
        return { selection: null, error, latencyMs: Date.now() - startedAt };
    }
}

/**
 * Câu trả lời về sản phẩm. `products` là toàn bộ ứng viên backend cho phép nhắc tới;
 * `shownProductIds` là thứ tự thẻ khách đã thấy ở lượt trước để model hiểu "cái thứ hai".
 */
async function composeProductReply({
    question, products = [], shownProductIds = [], messages = [], analysis = null,
    task = 'search', hints = {}, knownBrands = [], supportHotline = '',
}) {
    const candidates = products.slice(0, MAX_COMPOSE_PRODUCTS);
    const evidence = buildProductEvidence(candidates, {
        requestedTypes: analysis?.constraints?.types || [],
        requestedBrands: analysis?.constraints?.brands || [],
    });
    const shownIndex = new Map(shownProductIds.map((id, index) => [String(id), index + 1]));
    evidence.products = evidence.products.map((product) => ({
        ...product,
        ...(shownIndex.has(String(product.productId)) ? { shownPosition: shownIndex.get(String(product.productId)) } : {}),
    }));
    if (Object.keys(hints).length > 0) evidence.hints = hints;
    // Hàng cần báo giá thì bot sẽ mời gọi hotline; số đó phải nằm trong bằng chứng mới qua được kiểm chứng.
    if (supportHotline) evidence.store = { hotline: supportHotline };

    const promptEvidence = trimFactsForPrompt(evidence);
    const { selection, error, latencyMs } = await callModel({
        mode: 'product',
        question,
        task,
        evidence: promptEvidence,
        history: buildPromptHistory(messages),
    });
    if (!selection) return { ok: false, error, latencyMs };
    if (!selection.reply) return { ok: false, selection, latencyMs };

    const verified = verifyReplyText(selection.reply, {
        evidence,
        userTexts: userTextsOf(question, messages),
        knownBrands,
    });
    if (!verified.text) {
        logRejection('san_pham', verified.violations);
        return { ok: false, selection, latencyMs, violations: verified.violations };
    }

    const byId = new Map(candidates.map((product) => [String(product.productId), product]));
    const picked = selection.productIds.map((id) => byId.get(String(id))).filter(Boolean).slice(0, 3);
    return {
        ok: true,
        reply: verified.text,
        products: picked,
        answerType: selection.answerType,
        needsHuman: selection.needsHuman,
        latencyMs,
        // Caller có thể vẫn chọn dựng câu từ template (vd hàng chỉ gần đúng) nên trả kèm lựa chọn gốc.
        selection,
    };
}

/** Câu hỏi chung: cửa hàng, chính sách, kiến thức ngành, xã giao, hoặc câu ngoài phạm vi. */
async function composeSupportReply({
    question, policies = [], store = {}, productTypes = [], messages = [], knownBrands = [],
}) {
    const evidence = { store, policies, productTypes, products: [], facts: [], reasons: [], questionKeys: [] };
    const promptEvidence = {
        ...evidence,
        policies: policies.map((policy) => ({
            title: policy.title,
            summary: policy.summary,
            sections: (policy.sections || []).map((section) => ({
                title: section.title,
                content: String(section.content || '').slice(0, MAX_PROMPT_POLICY_SECTION_LENGTH),
            })),
        })),
    };

    const { selection, error, latencyMs } = await callModel({
        mode: 'support',
        question,
        task: 'general_support',
        evidence: promptEvidence,
        history: buildPromptHistory(messages),
    });
    if (!selection?.reply) return { ok: false, error, latencyMs };
    if (!['general', 'out_of_scope'].includes(selection.answerType)) return { ok: false, selection, latencyMs };

    const verified = verifyReplyText(selection.reply, {
        evidence,
        userTexts: userTextsOf(question, messages),
        knownBrands,
    });
    if (!verified.text) {
        logRejection('ho_tro', verified.violations);
        return { ok: false, selection, latencyMs, violations: verified.violations };
    }
    return {
        ok: true,
        reply: verified.text,
        answerType: selection.answerType,
        needsHuman: selection.needsHuman,
        latencyMs,
    };
}

module.exports = {
    MAX_COMPOSE_PRODUCTS,
    buildPromptHistory,
    composeProductReply,
    composeSupportReply,
};
