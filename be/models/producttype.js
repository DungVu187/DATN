const mongoose = require("mongoose");
const { isValidProductTypeIcon } = require('../utils/productType');

const productTypeSchema = new mongoose.Schema(
  {
    Type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    icon: {
      type: String,
      trim: true,
      maxlength: 120,
      validate: {
        validator: isValidProductTypeIcon,
        message: "Icon loại sản phẩm không hợp lệ",
      },
    },
  },
  { timestamps: true },
);

const Type = mongoose.models.Type || mongoose.model("Type", productTypeSchema);

module.exports = {
  Type,
  productTypeSchema,
};
