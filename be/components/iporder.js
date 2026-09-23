const express = require("express");
const { IpOrder } = require("../models/iporder");
const { authenticateAdmin, checkPermission, checkAnyPermission } = require("../middlewares/auth");
const { checkEditOrOwnDraft, isInventoryOrderDraft } = require("../middlewares/ownDraft");

// Sửa nội dung đơn: quyền Sửa, hoặc quyền Thêm với đơn nháp do chính mình tạo.
// Các thao tác đổi trạng thái (nhập kho) vẫn chỉ dành cho quyền Sửa.
const editOwnDraft = [
  authenticateAdmin,
  checkEditOrOwnDraft({
    editPermission: "iporder.edit",
    createPermission: "iporder.create",
    Model: IpOrder,
    isDraft: isInventoryOrderDraft,
  }),
];
const {
  listIpOrderProducts,
  listIpOrders,
} = require('../controllers/ipOrderReadQueries');
const { getIpOrderDetail } = require('../controllers/ipOrderDetailReads');
const {
  updateIpOrderMetadata,
  updateIpOrderName,
} = require('../controllers/ipOrderMetadata');
const {
  deleteIpOrderLine,
  reorderIpOrderLines,
} = require('../controllers/ipOrderLineOperations');
const {
  deleteIpOrder,
  updateIpOrderLineStatus,
  updateIpOrderStatus,
} = require('../controllers/inventoryOrderLifecycle');
const {
  setIpOrderLineStatusAndQuantity,
  setIpOrderStatusAndQuantity,
} = require('../controllers/ipOrderStockCompletion');
const {
  addIpOrderLine,
  createIpOrder,
  updateIpOrderLine,
} = require('../controllers/ipOrderMutations');
const router = express.Router();
const {
  uploadInventoryOrderInvoice,
} = require('../services/inventoryOrderMedia');
const {
  deleteIpOrderImage,
  uploadInventoryOrderImage,
} = require('../controllers/inventoryOrderMedia');

router.get("/orders", [authenticateAdmin, checkPermission("iporder.view")], listIpOrders);

router.post(
  "/orders",
  [authenticateAdmin, checkPermission("iporder.create")],
  createIpOrder
);

router.post(
  "/orders/:id/products",
  editOwnDraft,
  addIpOrderLine
);

router.delete(
  "/orders/:id/products/:productIndex",
  editOwnDraft,
  deleteIpOrderLine
);

router.put("/orders/:id", editOwnDraft, updateIpOrderMetadata);

router.delete(
  "/orders/:id",
  [authenticateAdmin, checkPermission("iporder.delete")],
  deleteIpOrder
);

router.put(
  "/orders/:id/status",
  [authenticateAdmin, checkPermission("iporder.edit")],
  updateIpOrderStatus
);

router.put(
  "/orders/:id/setStatusAndQuantity",
  [authenticateAdmin, checkPermission("iporder.edit")],
  setIpOrderStatusAndQuantity
);

router.put(
  "/orders/:id/products/:productIndex/status",
  [authenticateAdmin, checkPermission("iporder.edit")],
  updateIpOrderLineStatus
);

router.put(
  "/orders/:id/products/:productIndex/setStatusAndQuantity",
  [authenticateAdmin, checkPermission("iporder.edit")],
  setIpOrderLineStatusAndQuantity
);

router.get("/orders/:id", [authenticateAdmin, checkPermission("iporder.view")], getIpOrderDetail);

router.put(
  "/orders/:id/products/:productIndex",
  editOwnDraft,
  updateIpOrderLine
);

router.put(
  "/orders/:id/name",
  editOwnDraft,
  updateIpOrderName
);

router.put(
  "/orders/:id/reorder",
  editOwnDraft,
  reorderIpOrderLines
);

router.get("/products", [authenticateAdmin, checkPermission("iporder.view")], listIpOrderProducts);

// Chỉ tải file lên; việc gắn ảnh vào đơn vẫn qua PUT /orders/:id (kiểm tra đơn nháp của mình)
router.post(
  "/upload-image",
  [authenticateAdmin, checkAnyPermission(["iporder.create", "iporder.edit"]), uploadInventoryOrderInvoice.single("invoice")],
  uploadInventoryOrderImage
);

router.delete(
  "/delete-image",
  [authenticateAdmin, checkPermission("iporder.edit")],
  deleteIpOrderImage
);

module.exports = {
  IpOrder,
  router,
};
