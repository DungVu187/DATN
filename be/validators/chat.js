const mongoose = require('mongoose');

const MAX_CHAT_MESSAGE_LENGTH = 2000;
const MAX_CHAT_HISTORY_ITEMS = 10;
const MAX_CHAT_HISTORY_MESSAGE_LENGTH = 1500;
const MAX_SESSION_ID_LENGTH = 128;
const MAX_VISITOR_ID_LENGTH = 128;
const MAX_PATH_LENGTH = 500;

class ChatValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ChatValidationError';
        this.statusCode = 400;
    }
}

function fail(message) {
    throw new ChatValidationError(message);
}

function assertObject(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        fail('Dữ liệu chat phải là một đối tượng hợp lệ.');
    }
}

function optionalText(value, fieldName, maxLength) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') fail(fieldName + ' phải là chuỗi ký tự.');
    const normalized = value.trim();
    if (!normalized) return undefined;
    if (normalized.length > maxLength) {
        fail(fieldName + ' không được vượt quá ' + maxLength + ' ký tự.');
    }
    return normalized;
}

function requiredText(value, fieldName, maxLength) {
    const normalized = optionalText(value, fieldName, maxLength);
    if (!normalized) fail(fieldName + ' không được để trống.');
    return normalized;
}

function normalizeHistory(history) {
    if (history === undefined || history === null) return [];
    if (!Array.isArray(history)) fail('history phải là một mảng.');
    if (history.length > MAX_CHAT_HISTORY_ITEMS) {
        fail('history chỉ được chứa tối đa ' + MAX_CHAT_HISTORY_ITEMS + ' tin nhắn.');
    }

    return history.map((item, index) => {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) {
            fail('history[' + index + '] không hợp lệ.');
        }

        const role = item.role === 'model' ? 'assistant' : item.role;
        if (!['user', 'assistant'].includes(role)) {
            fail('history[' + index + '].role không được hỗ trợ.');
        }

        return {
            role,
            content: requiredText(
                item.content ?? item.message,
                'history[' + index + '].content',
                MAX_CHAT_HISTORY_MESSAGE_LENGTH
            ),
        };
    });
}

function validateChatSendPayload(body) {
    assertObject(body);

    const payload = {
        message: requiredText(body.message, 'message', MAX_CHAT_MESSAGE_LENGTH),
        history: normalizeHistory(body.history),
    };

    const chatSessionId = requiredText(body.chatSessionId, 'chatSessionId', MAX_SESSION_ID_LENGTH);
    const sessionId = optionalText(body.sessionId, 'sessionId', MAX_SESSION_ID_LENGTH);
    const visitorId = requiredText(body.visitorId, 'visitorId', MAX_VISITOR_ID_LENGTH);
    const currentPath = optionalText(body.currentPath, 'currentPath', MAX_PATH_LENGTH);
    const currentProductId = optionalText(body.currentProductId, 'currentProductId', 24);

    if (currentProductId !== undefined && !mongoose.Types.ObjectId.isValid(currentProductId)) {
        fail('currentProductId không phải ObjectId hợp lệ.');
    }

    payload.chatSessionId = chatSessionId;
    if (sessionId !== undefined) payload.sessionId = sessionId;
    payload.visitorId = visitorId;
    if (currentPath !== undefined) payload.currentPath = currentPath;
    if (currentProductId !== undefined) payload.currentProductId = currentProductId;

    return payload;
}

function validateChatHistoryPayload(value) {
    assertObject(value);
    return {
        chatSessionId: requiredText(value.chatSessionId, 'chatSessionId', MAX_SESSION_ID_LENGTH),
        visitorId: requiredText(value.visitorId, 'visitorId', MAX_VISITOR_ID_LENGTH),
    };
}

function validateChatClearPayload(body) {
    return validateChatHistoryPayload(body);
}

module.exports = {
    ChatValidationError,
    MAX_CHAT_HISTORY_ITEMS,
    MAX_CHAT_MESSAGE_LENGTH,
    validateChatClearPayload,
    validateChatHistoryPayload,
    validateChatSendPayload,
};
