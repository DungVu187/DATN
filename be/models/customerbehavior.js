const mongoose = require('mongoose');

const CUSTOMER_BEHAVIOR_EVENT_TYPES = [
    'view_product',
    'search_product',
    'click_product',
    'add_to_cart',
    'start_checkout',
];

const customerBehaviorSchema = new mongoose.Schema({
    visitorId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 128,
        index: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
    },
    sessionId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 128,
    },
    eventType: {
        type: String,
        required: true,
        enum: CUSTOMER_BEHAVIOR_EVENT_TYPES,
        index: true,
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        index: true,
    },
    query: {
        type: String,
        trim: true,
        maxlength: 300,
    },
    path: {
        type: String,
        trim: true,
        maxlength: 500,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true,
    },
}, {
    versionKey: false,
});

// Tự động loại dữ liệu hành vi cũ sau 90 ngày để giới hạn dữ liệu lưu trữ.
customerBehaviorSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
customerBehaviorSchema.index({ visitorId: 1, createdAt: -1 });
customerBehaviorSchema.index({ userId: 1, createdAt: -1 });

const CustomerBehavior = mongoose.models.CustomerBehavior
    || mongoose.model('CustomerBehavior', customerBehaviorSchema);

module.exports = {
    CustomerBehavior,
    customerBehaviorSchema,
    CUSTOMER_BEHAVIOR_EVENT_TYPES,
};
