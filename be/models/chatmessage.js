const mongoose = require('mongoose');

const CHAT_MESSAGE_ROLES = ['user', 'assistant'];
const CHAT_HISTORY_TTL_SECONDS = 30 * 24 * 60 * 60;
// Hội thoại chỉ cần giữ 30 ngày; dữ liệu hành vi tổng hợp có chính sách 90 ngày riêng.

const CHAT_MEMORY_VERSION = 1;
const MAX_FOCUSED_PRODUCTS = 2;
const MAX_SHOWN_PRODUCTS = 5;
const MAX_SELECTED_VARIANTS = 2;
const MAX_ASKED_QUESTION_KEYS = 3;
const MAX_LAST_USER_MESSAGE_LENGTH = 500;

/**
 * Bộ nhớ tham chiếu của một lượt trả lời.
 * Chỉ lưu ID và câu hỏi đang chờ; giá và tồn kho luôn nạp mới từ Product ở lượt sau.
 */
const chatMemorySchema = new mongoose.Schema({
    version: { type: Number, default: CHAT_MEMORY_VERSION },
    focusedProductIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        default: undefined,
        validate: {
            validator: (value) => !value || value.length <= MAX_FOCUSED_PRODUCTS,
            message: 'focusedProductIds chỉ giữ tối đa ' + MAX_FOCUSED_PRODUCTS + ' sản phẩm.',
        },
    },
    shownProductIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        default: undefined,
        validate: {
            validator: (value) => !value || value.length <= MAX_SHOWN_PRODUCTS,
            message: 'shownProductIds chỉ giữ tối đa ' + MAX_SHOWN_PRODUCTS + ' sản phẩm.',
        },
    },
    selectedVariants: {
        type: [{
            _id: false,
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            variantId: { type: mongoose.Schema.Types.ObjectId },
        }],
        default: undefined,
        validate: {
            validator: (value) => !value || value.length <= MAX_SELECTED_VARIANTS,
            message: 'selectedVariants chỉ giữ tối đa ' + MAX_SELECTED_VARIANTS + ' lựa chọn.',
        },
    },
    // Các câu hỏi làm rõ đã phát trong phiên: hỏi lại đúng câu khách vừa trả lời là lỗi nặng nhất.
    askedQuestionKeys: {
        type: [String],
        default: undefined,
        validate: {
            validator: (value) => !value || value.length <= MAX_ASKED_QUESTION_KEYS,
            message: 'askedQuestionKeys chỉ giữ tối đa ' + MAX_ASKED_QUESTION_KEYS + ' câu hỏi.',
        },
    },
    // Câu khách nói ngay trước khi bot hỏi lại, để lượt sau ghép ngữ cảnh mà không mất nhu cầu cũ.
    lastUserMessage: { type: String, trim: true, maxlength: MAX_LAST_USER_MESSAGE_LENGTH },
    pendingQuestion: {
        type: {
            _id: false,
            key: { type: String, trim: true, maxlength: 64 },
            summary: { type: String, trim: true, maxlength: 400 },
            types: { type: [String], default: undefined },
            brands: { type: [String], default: undefined },
            technicalTokens: { type: [String], default: undefined },
        },
        default: undefined,
    },
}, { _id: false });

const chatMessageSchema = new mongoose.Schema({
    chatSessionId: { type: String, required: true, trim: true, maxlength: 128, index: true },
    visitorId: { type: String, required: true, trim: true, maxlength: 128, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    role: { type: String, required: true, enum: CHAT_MESSAGE_ROLES },
    content: { type: String, required: true, trim: true, maxlength: 3000 },
    intent: { type: String, trim: true, maxlength: 64, index: true },
    answerType: { type: String, trim: true, maxlength: 32 },
    fallback: { type: Boolean, default: false },
    latencyMs: { type: Number, min: 0 },
    totalLatencyMs: { type: Number, min: 0 },
    needsHuman: { type: Boolean, default: false },
    memory: { type: chatMemorySchema, default: undefined },
    createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false });

chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: CHAT_HISTORY_TTL_SECONDS });
chatMessageSchema.index({ chatSessionId: 1, createdAt: 1 });
chatMessageSchema.index({ visitorId: 1, chatSessionId: 1, createdAt: 1 });

const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);

module.exports = {
    ChatMessage,
    CHAT_HISTORY_TTL_SECONDS,
    CHAT_MEMORY_VERSION,
    CHAT_MESSAGE_ROLES,
    MAX_ASKED_QUESTION_KEYS,
    MAX_FOCUSED_PRODUCTS,
    MAX_LAST_USER_MESSAGE_LENGTH,
    MAX_SELECTED_VARIANTS,
    MAX_SHOWN_PRODUCTS,
    chatMemorySchema,
    chatMessageSchema,
};
