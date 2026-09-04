const mongoose = require('mongoose');
const { CUSTOMER_BEHAVIOR_EVENT_TYPES } = require('../models/customerbehavior');

const MAX_EVENTS_PER_REQUEST = 20;
const MAX_VISITOR_ID_LENGTH = 128;
const MAX_SESSION_ID_LENGTH = 128;
const MAX_QUERY_LENGTH = 300;
const MAX_PATH_LENGTH = 500;

class CustomerBehaviorValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CustomerBehaviorValidationError';
        this.statusCode = 400;
    }
}

function fail(message) {
    throw new CustomerBehaviorValidationError(message);
}

function assertPlainObject(value, fieldName) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        fail(`${fieldName} phải là một đối tượng hợp lệ.`);
    }
}

function normalizeRequiredText(value, fieldName, maxLength) {
    if (typeof value !== 'string') {
        fail(`${fieldName} phải là chuỗi ký tự.`);
    }

    const normalized = value.trim();
    if (!normalized) {
        fail(`${fieldName} không được để trống.`);
    }
    if (normalized.length > maxLength) {
        fail(`${fieldName} không được vượt quá ${maxLength} ký tự.`);
    }

    return normalized;
}

function normalizeOptionalText(value, fieldName, maxLength) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') {
        fail(`${fieldName} phải là chuỗi ký tự.`);
    }

    const normalized = value.trim();
    if (!normalized) return undefined;
    if (normalized.length > maxLength) {
        fail(`${fieldName} không được vượt quá ${maxLength} ký tự.`);
    }

    return normalized;
}

function normalizeBehaviorEvent(event, index) {
    assertPlainObject(event, `events[${index}]`);

    if (!CUSTOMER_BEHAVIOR_EVENT_TYPES.includes(event.eventType)) {
        fail(`events[${index}].eventType không được hỗ trợ.`);
    }

    const normalized = {
        visitorId: normalizeRequiredText(event.visitorId, `events[${index}].visitorId`, MAX_VISITOR_ID_LENGTH),
        sessionId: normalizeRequiredText(event.sessionId, `events[${index}].sessionId`, MAX_SESSION_ID_LENGTH),
        eventType: event.eventType,
    };

    const productId = normalizeOptionalText(event.productId, `events[${index}].productId`, 24);
    if (productId !== undefined) {
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            fail(`events[${index}].productId không phải ObjectId hợp lệ.`);
        }
        normalized.productId = productId;
    }

    const query = normalizeOptionalText(event.query, `events[${index}].query`, MAX_QUERY_LENGTH);
    const path = normalizeOptionalText(event.path, `events[${index}].path`, MAX_PATH_LENGTH);
    if (['view_product', 'click_product', 'add_to_cart'].includes(event.eventType) && !normalized.productId) {
        fail(`events[${index}].productId là bắt buộc với ${event.eventType}.`);
    }
    if (event.eventType === 'search_product' && !query) {
        fail(`events[${index}].query là bắt buộc với search_product.`);
    }
    if (query !== undefined) normalized.query = query;
    if (path !== undefined) normalized.path = path;

    return normalized;
}

function validateCustomerBehaviorPayload(body) {
    assertPlainObject(body, 'body');

    const rawEvents = Array.isArray(body.events)
        ? body.events
        : [body];

    if (rawEvents.length === 0) {
        fail('Danh sách events không được để trống.');
    }
    if (rawEvents.length > MAX_EVENTS_PER_REQUEST) {
        fail(`Mỗi request chỉ được gửi tối đa ${MAX_EVENTS_PER_REQUEST} event.`);
    }

    return {
        events: rawEvents.map(normalizeBehaviorEvent),
    };
}

module.exports = {
    CustomerBehaviorValidationError,
    MAX_EVENTS_PER_REQUEST,
    validateCustomerBehaviorPayload,
};
