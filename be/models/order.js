const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model("Counter", counterSchema);

const orderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      unique: true
    },
    // Draft admin co the tao truoc thong tin khach; route nhap that van validate phone.
    userPhone: {
      type: String,
      default: "",
    },
    userName: {
      type: String,
    },
    customerEmail: {
      type: String,
      default: "",
    },
    cartItems: [
      {
        productId: { type: String, require: true },
        variantIndex: { type: Number, require: true },
        quantity: { type: Number, require: true },
      },
    ],
    total: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
      default: "Processing",
      enum: ["Processing", "Delivering", "Completed"]
    },
    payment: {
      type: Boolean,
      default: false
    },
    paymentMethod: {
      type: String,
      enum: ["COD", "SEPAY"],
      default: "COD",
    },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PENDING", "UNDERPAID", "PAID", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"],
      default: "UNPAID",
    },
    paymentReference: {
      type: String,
      default: null,
      index: true,
    },
    paymentTransactionId: {
      type: String,
      default: undefined,
    },
    paymentAmount: {
      type: Number,
      default: 0,
    },
    paymentReceivedAmount: {
      type: Number,
      default: 0,
    },
    paymentExpiresAt: {
      type: Date,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    checkoutNote: {
      type: String,
      default: "",
      maxlength: 500,
    },
    shippingAddress: {
      addressId: { type: String, default: "" },
      label: { type: String, default: "" },
      receiverName: { type: String, default: "" },
      receiverPhone: { type: String, default: "" },
      provinceCode: { type: String, default: "" },
      provinceName: { type: String, default: "" },
      wardCode: { type: String, default: "" },
      wardName: { type: String, default: "" },
      addressLine: { type: String, default: "" },
      addressDetail: { type: String, default: "" },
    },
    state: {
      type: String,
      required: true,
      default: "Processing",
      enum: ["Processing", "Cancelled"]
    },
    completedAt: {
      type: Date,
      default: null
    },
    images: [{ type: String }],
    // Tài khoản quản trị tạo đơn (null với đơn khách tự đặt) — dùng cho quyền sửa đơn nháp của mình
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true, optimisticConcurrency: true }
);

const Order = mongoose.model("Order", orderSchema);

module.exports = {
  Order,
  orderSchema,
  Counter,
  counterSchema,
};
