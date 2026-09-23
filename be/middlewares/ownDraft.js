const mongoose = require("mongoose");
const { hasPermission } = require("./auth");

// Người có quyền "Sửa" được sửa mọi đơn; người chỉ có quyền "Thêm" chỉ được
// soạn tiếp đơn nháp do chính mình tạo (để quyền Thêm không tạo ra đơn rỗng vô dụng).
// Phải đặt SAU authenticateAdmin để có req.user.
const isOwnDraft = (order, user, isDraft) =>
  Boolean(order?.createdBy) &&
  String(order.createdBy) === String(user?._id) &&
  isDraft(order);

const checkEditOrOwnDraft = ({ editPermission, createPermission, Model, isDraft, idParam = "id" }) =>
  async (req, res, next) => {
    const user = req.user;
    if (hasPermission(user, editPermission)) return next();

    const deny = () => res.status(403).json({
      message: "Access denied, missing permission: " + editPermission,
    });
    if (!hasPermission(user, createPermission)) return deny();

    const orderId = req.params[idParam];
    if (!mongoose.isValidObjectId(orderId)) return deny();

    try {
      const order = await Model.findById(orderId).select("createdBy status state").lean();
      // Không lộ việc đơn có tồn tại hay không với người thiếu quyền Sửa
      if (!order) return deny();
      if (!isOwnDraft(order, user, isDraft)) {
        return res.status(403).json({
          message: "Bạn chỉ có quyền Thêm nên chỉ được sửa đơn nháp do chính mình tạo.",
        });
      }
      return next();
    } catch (error) {
      console.error("Error in checkEditOrOwnDraft:", error.message);
      return res.status(500).json({ message: "Lỗi kiểm tra quyền sửa đơn" });
    }
  };

// Đơn bán: còn "nháp" khi chưa chuyển sang giao hàng và chưa huỷ
const isSalesOrderDraft = (order) => order.status === "Processing" && order.state !== "Cancelled";
// Đơn nhập/xuất: còn "nháp" khi chưa hoàn tất (status = false)
const isInventoryOrderDraft = (order) => order.status !== true;

module.exports = {
  checkEditOrOwnDraft,
  isInventoryOrderDraft,
  isOwnDraft,
  isSalesOrderDraft,
};
