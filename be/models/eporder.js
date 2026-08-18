const mongoose = require("mongoose");

const epOrderSchema = new mongoose.Schema(
  {
    orderName: { type: String, default: "" },
    note: { type: String, default: "" },
    userName: { type: String, required: true },
    productList: [
      {
        status: { type: Boolean, default: 0 },
        productId: { type: String },
        price: { type: String },
        importPriceSnapshot: { type: String, default: "" },
        profitPercent: { type: Number, min: 0, max: 100, default: undefined },
        unit: { type: String },
        quantity: {
          type: Number,
          default: 0,
          min: 0,
        },
        quantityEx: {
          type: Number,
          default: 0,
          min: 0,
        },
        stockAppliedQuantity: { type: Number, min: 0, default: undefined },
        stockUpdateSkipped: { type: Boolean, default: false },
        note: { type: String },
        vat: { type: String, default: "" },
      },
    ],
    images: [{ type: String }],
    total: { type: String, default: "0" },
    status: { type: Boolean, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true }
);

epOrderSchema.pre("save", function (next) {
  if (this.productList && this.productList.length > 0) {
    this.total = this.productList
      .reduce((sum, item) => {
        const priceNum = parseFloat(
          item.price?.replace(/\./g, "").replace(",", ".") || 0
        );
        return sum + priceNum * (item.quantity || 0);
      }, 0)
      .toString();
  } else {
    this.total = "0";
  }
  next();
});

const EpOrder = mongoose.model("EpOrder", epOrderSchema);

module.exports = {
  EpOrder,
  epOrderSchema,
};
