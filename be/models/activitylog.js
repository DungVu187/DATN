const mongoose = require("mongoose");

// Định nghĩa schema
const activityLogSchema = new mongoose.Schema({
  userName: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    required: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  },
  productName: {
    type: String,
  },
  details: [
    {
      field: { type: String },
      oldValue: { type: String, default: "" },
      newValue: { type: String, default: "" },
    },
  ],
}, { timestamps: true });

// Tự động xóa log hoạt động sau 90 ngày (90 ngày * 24 giờ * 3600 giây = 7776000 giây)
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

const ActivityLog = mongoose.models.ActivityLog || mongoose.model("ActivityLog", activityLogSchema);

module.exports = {
  ActivityLog,
  activityLogSchema,
};
