const express = require("express");
const { EpOrder } = require("../models/eporder");
const { authenticateAdmin, checkPermission, checkAnyPermission } = require("../middlewares/auth");
const { checkEditOrOwnDraft, isInventoryOrderDraft } = require("../middlewares/ownDraft");

// Sửa nội dung đơn: quyền Sửa, hoặc quyền Thêm với đơn nháp do chính mình tạo.
// Các thao tác đổi trạng thái (xuất kho) vẫn chỉ dành cho quyền Sửa.
const editOwnDraft = [
  authenticateAdmin,
  checkEditOrOwnDraft({
    editPermission: "eporder.edit",
    createPermission: "eporder.create",
    Model: EpOrder,
    isDraft: isInventoryOrderDraft,
  }),
];
const {
  listEpOrderProducts,
  listEpOrders,
} = require('../controllers/epOrderReadQueries');
const { getEpOrderDetail } = require('../controllers/epOrderDetailReads');
const {
  updateEpOrderMetadata,
  updateEpOrderName,
} = require('../controllers/epOrderMetadata');
const {
  deleteEpOrderLine,
  reorderEpOrderLines,
} = require('../controllers/epOrderLineOperations');
const {
  deleteEpOrder,
  updateEpOrderLineStatus,
  updateEpOrderStatus,
} = require('../controllers/inventoryOrderLifecycle');
const {
  setEpOrderLineStatusAndQuantity,
  setEpOrderStatusAndQuantity,
} = require('../controllers/epOrderStockCompletion');
const {
  addEpOrderLine,
  createEpOrder,
  updateEpOrderLine,
} = require('../controllers/epOrderMutations');
const router = express.Router();
const {
  uploadInventoryOrderInvoice,
} = require('../services/inventoryOrderMedia');
const {
  deleteEpOrderImage,
  uploadInventoryOrderImage,
} = require('../controllers/inventoryOrderMedia');

router.get("/orders", [authenticateAdmin, checkPermission("eporder.view")], listEpOrders);

router.post(
  "/orders",
  [authenticateAdmin, checkPermission("eporder.create")],
  createEpOrder
);

router.post(
  "/orders/:id/products",
  editOwnDraft,
  addEpOrderLine
);

router.delete(
  "/orders/:id/products/:productIndex",
  editOwnDraft,
  deleteEpOrderLine
);

router.put("/orders/:id", editOwnDraft, updateEpOrderMetadata);

router.delete(
  "/orders/:id",
  [authenticateAdmin, checkPermission("eporder.delete")],
  deleteEpOrder
);

router.put(
  "/orders/:id/status",
  [authenticateAdmin, checkPermission("eporder.edit")],
  updateEpOrderStatus
);

router.put(
  "/orders/:id/setStatusAndQuantity",
  [authenticateAdmin, checkPermission("eporder.edit")],
  setEpOrderStatusAndQuantity
);

router.put(
  "/orders/:id/products/:productIndex/status",
  [authenticateAdmin, checkPermission("eporder.edit")],
  updateEpOrderLineStatus
);

router.put(
  "/orders/:id/products/:productIndex/setStatusAndQuantity",
  [authenticateAdmin, checkPermission("eporder.edit")],
  setEpOrderLineStatusAndQuantity
);

router.get("/orders/:id", [authenticateAdmin, checkPermission("eporder.view")], getEpOrderDetail);

router.put(
  "/orders/:id/products/:productIndex",
  editOwnDraft,
  updateEpOrderLine
);

router.put(
  "/orders/:id/name",
  editOwnDraft,
  updateEpOrderName
);

router.put(
  "/orders/:id/reorder",
  editOwnDraft,
  reorderEpOrderLines
);

router.get("/products", [authenticateAdmin, checkPermission("eporder.view")], listEpOrderProducts);

// Chỉ tải file lên; việc gắn ảnh vào đơn vẫn qua PUT /orders/:id (kiểm tra đơn nháp của mình)
router.post(
  "/upload-image",
  [authenticateAdmin, checkAnyPermission(["eporder.create", "eporder.edit"]), uploadInventoryOrderInvoice.single("invoice")],
  uploadInventoryOrderImage
);

router.delete(
  "/delete-image",
  [authenticateAdmin, checkPermission("eporder.edit")],
  deleteEpOrderImage
);

module.exports = {
  EpOrder,
  router,
};
