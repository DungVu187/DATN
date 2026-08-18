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
    images: [{ type: String }]
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
