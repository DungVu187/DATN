const express = require("express");
const { IpOrder } = require("../models/iporder");
const { authenticateAdmin, checkPermission } = require("../middlewares/auth");
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
  [authenticateAdmin, checkPermission("iporder.edit")],
  addIpOrderLine
);

router.delete(
  "/orders/:id/products/:productIndex",
  [authenticateAdmin, checkPermission("iporder.edit")],
  deleteIpOrderLine
);

router.put("/orders/:id", [authenticateAdmin, checkPermission("iporder.edit")], updateIpOrderMetadata);

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
  [authenticateAdmin, checkPermission("iporder.edit")],
  updateIpOrderLine
);

router.put(
  "/orders/:id/name",
  [authenticateAdmin, checkPermission("iporder.edit")],
  updateIpOrderName
);

router.put(
  "/orders/:id/reorder",
  [authenticateAdmin, checkPermission("iporder.edit")],
  reorderIpOrderLines
);

router.get("/products", [authenticateAdmin, checkPermission("iporder.view")], listIpOrderProducts);

router.post(
  "/upload-image",
  [authenticateAdmin, checkPermission("iporder.edit"), uploadInventoryOrderInvoice.single("invoice")],
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
