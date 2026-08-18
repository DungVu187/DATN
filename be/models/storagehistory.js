const mongoose = require("mongoose");

// Định nghĩa schema
const storageHistorySchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    productName: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    userName: {
        type: String
    },
    orderId: {
        type: String
    },
    orderName: {
        type: String
    },
    note: {
        type: String,
        default: ""
    },
    isAIScan: {
        type: Boolean,
        default: false
    },
    source: {
        type: String,
        enum: [
            "order_line_manual",
            "order_line_complete",
            "order_bulk_complete",
            "product_manual",
            "online_sale",
            "online_sale_revert",
        ],
        default: undefined,
    }
}, { timestamps: true });

const StorageHistory = mongoose.models.StorageHistory || mongoose.model("StorageHistory", storageHistorySchema);

module.exports = {
    StorageHistory,
    storageHistorySchema,
};
