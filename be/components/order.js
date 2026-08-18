const express = require("express");
const { Order } = require("../models/order");
const { authenticateUser, authenticateAdmin, checkPermission } = require("../middlewares/auth");
require("dotenv").config();
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
  deleteOrder,
  updateOrder,
} = require('../controllers/orderLifecycle');

const router = express.Router();

// API lấy danh sách đơn hàng với phân trang
router.get("/", [authenticateAdmin, checkPermission('order.view')], listOrders);

// API cập nhật trạng thái hoặc thanh toán của đơn hàng
router.get("/customer-suggestions", [authenticateAdmin, checkPermission('order.view')], getCustomerSuggestions);

router.put('/update-order/:_id', [authenticateAdmin, checkPermission('order.edit')], updateOrder);

// API tạo đơn hàng
router.post("/admin-create-order", [authenticateAdmin, checkPermission('order.create')], createAdminOrder);

router.post("/admin-draft", [authenticateAdmin, checkPermission('order.create')], createAdminDraftOrder);

router.get("/admin-detail/:id", [authenticateAdmin, checkPermission('order.view')], getAdminOrderDetail);

router.post("/:id/items", [authenticateAdmin, checkPermission('order.edit')], addOrderItem);

router.put("/:id/items/:index", [authenticateAdmin, checkPermission('order.edit')], updateOrderItemQuantity);

router.delete("/:id/items/:index", [authenticateAdmin, checkPermission('order.edit')], deleteOrderItem);

router.put("/:id/reorder", [authenticateAdmin, checkPermission('order.edit')], reorderOrderItems);

router.put("/:id/customer", [authenticateAdmin, checkPermission('order.edit')], updateOrderCustomer);
router.put("/:id/images", [authenticateAdmin, checkPermission('order.edit')], updateOrderImages);

router.post(
  "/upload-image",
  [authenticateAdmin, checkPermission('order.edit'), handleInvoiceUpload],
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
