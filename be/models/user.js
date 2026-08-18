const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const canonicalizePhone = (raw) => {
  if (typeof raw !== "string") return null;

  const normalized = raw.replace(/[\s.\-()]/g, "");
  if (normalized.startsWith("+84")) {
    return "0" + normalized.slice(3);
  }
  if (/^84\d{9,10}$/.test(normalized)) {
    return "0" + normalized.slice(2);
  }
  return normalized;
};

const isValidVietnamPhone = (raw) => {
  const phone = canonicalizePhone(raw);
  if (!phone) return false;
  return /^0\d{9,10}$/.test(phone);
};

// Schema cho User (giữ nguyên)
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    lowercase: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: (value) => isValidVietnamPhone(value),
      message: "Số điện thoại không hợp lệ",
    },
  },
  name: {
    type: String,
  },
  cart: [
    {
      productId: {
        type: String,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        default: 1,
      },
      variantIndex: {
        type: Number,
        required: true,
      },
      status: {
        type: Boolean,
        default: true,
      },
    },
  ],
  password: {
    type: String,
    required: true,
  },
  passwordChangedAt: {
    type: Date,
  },
  role: {
    type: String,
    required: true,
    enum: ["superadmin", "admin", "staff", "customer"],
    default: "customer",
  },
  functions: [
    {
      type: String,
    },
  ],
  permissions: [
    {
      type: String,
    },
  ],
  orderTemplate: [
    {
      displayName: {
        type: String,
      },
      note: {
        type: String,
        default: "",
      },
      products: [
        {
          productId: {
            type: String,
          },
          quantity: {
            type: Number,
            default: 1,
          },
        },
      ],
    },
  ],
  addresses: [
    {
      label: { type: String, default: "Địa chỉ" },
      receiverName: { type: String },
      receiverPhone: { type: String },
      provinceCode: { type: String },
      provinceName: { type: String },
      wardCode: { type: String },
      wardName: { type: String },
      addressLine: { type: String },
      addressDetail: { type: String },
      isDefault: { type: Boolean, default: false },
    },
  ],
  resetOtp: {
    type: String,
  },
  resetOtpExpires: {
    type: Date,
  },
});

// Hash mật khẩu trước khi lưu (giữ nguyên)
userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// So sánh mật khẩu (giữ nguyên)
userSchema.methods.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = {
  User,
  userSchema,
  canonicalizePhone,
  isValidVietnamPhone,
};
