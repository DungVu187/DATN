const express = require("express");
const { Order } = require("../models/order");
const { authenticateUser, authenticateAdmin, checkPermission, checkAnyPermission } = require("../middlewares/auth");
const { checkEditOrOwnDraft, isSalesOrderDraft } = require("../middlewares/ownDraft");
require("dotenv").config();

// Sửa nội dung đơn: quyền Sửa, hoặc quyền Thêm với đơn nháp do chính mình tạo
const editOwnDraft = [
  authenticateAdmin,
  checkEditOrOwnDraft({
    editPermission: 'order.edit',
    createPermission: 'order.create',
    Model: Order,
    isDraft: isSalesOrderDraft,
  }),
];
const {
  getCustomerSuggestions,
  getProcessingOrderCount,
  listOrders,
  listUserOrders,
} = require('../controllers/orderReadQueries');
const {
  getAdminOrderDetail,
  getOrderDetail,
} = require('../controllers/orderDetailReads');
const {
  updateOrderCustomer,
  updateOrderImages,
} = require('../controllers/orderMetadata');
const {
  deleteOrderImage,
  uploadOrderImage,
} = require('../controllers/orderMedia');
const { handleInvoiceUpload } = require('../services/orderMedia');
const {
  createAdminDraftOrder,
  createAdminOrder,
  createCustomerOrder,
} = require('../controllers/orderCreation');
const {
  addOrderItem,
  deleteOrderItem,
  reorderOrderItems,
  updateOrderItemQuantity,
} = require('../controllers/orderItemOperations');
const {
  cancelOrder,
  confirmOrderRefund,
  deleteOrder,
  updateOrder,
} = require('../controllers/orderLifecycle');

const router = express.Router();

// API lấy danh sách đơn hàng với phân trang
router.get("/", [authenticateAdmin, checkPermission('order.view')], listOrders);

// API cập nhật trạng thái hoặc thanh toán của đơn hàng
router.get("/customer-suggestions", [authenticateAdmin, checkPermission('order.view')], getCustomerSuggestions);

router.put('/update-order/:_id', [authenticateAdmin, checkPermission('order.edit')], updateOrder);

// Xác nhận đã chuyển khoản hoàn tiền cho đơn đã thanh toán rồi bị hủy
router.put('/:id/refund', [authenticateAdmin, checkPermission('order.edit')], confirmOrderRefund);

// API tạo đơn hàng
router.post("/admin-create-order", [authenticateAdmin, checkPermission('order.create')], createAdminOrder);

router.post("/admin-draft", [authenticateAdmin, checkPermission('order.create')], createAdminDraftOrder);

router.get("/admin-detail/:id", [authenticateAdmin, checkPermission('order.view')], getAdminOrderDetail);

router.post("/:id/items", editOwnDraft, addOrderItem);

router.put("/:id/items/:index", editOwnDraft, updateOrderItemQuantity);

router.delete("/:id/items/:index", editOwnDraft, deleteOrderItem);

router.put("/:id/reorder", editOwnDraft, reorderOrderItems);

router.put("/:id/customer", editOwnDraft, updateOrderCustomer);
router.put("/:id/images", editOwnDraft, updateOrderImages);

// Chỉ tải file lên; việc gắn ảnh vào đơn vẫn qua PUT /:id/images (kiểm tra đơn nháp của mình)
router.post(
  "/upload-image",
  [authenticateAdmin, checkAnyPermission(['order.create', 'order.edit']), handleInvoiceUpload],
  uploadOrderImage,
);

router.delete("/delete-image", [authenticateAdmin, checkPermission('order.edit')], deleteOrderImage);

router.post("/create-order", authenticateUser, createCustomerOrder);
router.get("/userOrders", authenticateUser, listUserOrders);

router.get("/processing-count", getProcessingOrderCount);

router.get('/:_id', authenticateUser, getOrderDetail);
router.delete("/:id", authenticateUser, deleteOrder);

router.put("/:id", authenticateUser, cancelOrder);

module.exports = {
  Order,
  router,
};
