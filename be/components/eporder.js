const express = require("express");
const { EpOrder } = require("../models/eporder");
const { authenticateAdmin, checkPermission } = require("../middlewares/auth");
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
  [authenticateAdmin, checkPermission("eporder.edit")],
  addEpOrderLine
);

router.delete(
  "/orders/:id/products/:productIndex",
  [authenticateAdmin, checkPermission("eporder.edit")],
  deleteEpOrderLine
);

router.put("/orders/:id", [authenticateAdmin, checkPermission("eporder.edit")], updateEpOrderMetadata);

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
  [authenticateAdmin, checkPermission("eporder.edit")],
  updateEpOrderLine
);

router.put(
  "/orders/:id/name",
  [authenticateAdmin, checkPermission("eporder.edit")],
  updateEpOrderName
);

router.put(
  "/orders/:id/reorder",
  [authenticateAdmin, checkPermission("eporder.edit")],
  reorderEpOrderLines
);

router.get("/products", [authenticateAdmin, checkPermission("eporder.view")], listEpOrderProducts);

router.post(
  "/upload-image",
  [authenticateAdmin, checkPermission("eporder.edit"), uploadInventoryOrderInvoice.single("invoice")],
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
