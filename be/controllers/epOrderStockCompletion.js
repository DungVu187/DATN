const { EpOrder } = require("../models/eporder");
const { Product } = require("../models/product");
const { StorageHistory } = require("../models/storagehistory");
const {
  InventoryError,
  applyStockAdjustments,
  isVersionConflict,
  rollbackOrThrow,
} = require("../services/inventory");
const { saveExportOrder } = require("../services/epOrderPricing");

const toQuantity = (value) => Number(value) || 0;

const createRouteError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseExportLineQuantities = (line) => {
  const quantity = Number(line?.quantity);
  const quantityEx = line?.quantityEx === undefined || line?.quantityEx === null
    ? 0
    : Number(line.quantityEx);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw createRouteError(400, "Số lượng cần xuất phải là số nguyên lớn hơn 0");
  }
  if (!Number.isInteger(quantityEx) || quantityEx < 0 || quantityEx > quantity) {
    throw createRouteError(400, "Số lượng đã xuất phải nằm trong khoảng từ 0 đến số lượng cần xuất");
  }
  return { quantity, quantityEx };
};

const getStockAppliedQuantity = (line) => {
  const progress = toQuantity(line?.quantityEx);
  const hasExplicitValue = line?.stockAppliedQuantity !== undefined &&
    line?.stockAppliedQuantity !== null;
  const applied = hasExplicitValue
    ? Number(line.stockAppliedQuantity)
    : progress;
  if (!Number.isFinite(applied) || applied < 0 || applied > progress) {
    throw createRouteError(409, "Dữ liệu số lượng đã trừ kho của dòng xuất không hợp lệ");
  }
  return applied;
};

const saveWithStockRollback = async (order, appliedAdjustments) => {
  try {
    return await saveExportOrder(order);
  } catch (error) {
    await rollbackOrThrow(appliedAdjustments, error);
  }
};

const saveStockHistories = async (historyEntries) => {
  for (const historyEntry of historyEntries.filter(Boolean)) {
    try {
      await new StorageHistory(historyEntry).save();
    } catch (logErr) {
      console.error("StorageHistory error (eporder stock adjustment):", logErr.message);
    }
  }
};

const getRouteErrorStatus = (error) => {
  if (error?.statusCode) return error.statusCode;
  if (isVersionConflict(error)) return 409;
  return 500;
};

const getRouteErrorMessage = (error, fallback) => {
  if (error?.statusCode) return error.message;
  if (isVersionConflict(error)) {
    return "Đơn xuất vừa được thay đổi bởi thao tác khác, vui lòng tải lại.";
  }
  return fallback;
};

async function setEpOrderStatusAndQuantity(req, res) {
  try {
    const { status } = req.body;
    if (typeof status !== "boolean") {
      return res.status(400).json({ message: "status phải là boolean" });
    }
    const order = await EpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    let appliedAdjustments = [];
    const historyEntries = [];
    if (status === true) {
      const adjustments = [];
      for (let index = 0; index < order.productList.length; index++) {
        const productItem = order.productList[index];
        const product = await Product.findById(productItem.productId)
          .select("name variant._id variant.quantityForSale variant.quantityInStorage");
        if (!product) {
          throw new InventoryError(`Product ${productItem.productId} not found`, {
            statusCode: 404,
            code: "PRODUCT_NOT_FOUND",
          });
        }

        const variant = product.variant[0];
        if (!variant) {
          throw new InventoryError("Sản phẩm không có biến thể", {
            statusCode: 400,
            code: "VARIANT_NOT_FOUND",
          });
        }
        const { quantity, quantityEx } = parseExportLineQuantities(productItem);
        const currentApplied = getStockAppliedQuantity(productItem);
        const untrackedQuantity = Math.max(0, quantityEx - currentApplied);
        const targetApplied = Math.max(0, quantity - untrackedQuantity);
        const requiredQty = targetApplied - currentApplied;

        if (!Number.isFinite(requiredQty) || requiredQty < 0) {
          throw new InventoryError("Số lượng xuất còn lại không hợp lệ.", {
            statusCode: 400,
            code: "INVALID_EXPORT_QUANTITY",
          });
        }

        if (requiredQty > 0) {
          adjustments.push({
            productId: product._id,
            variantIndex: 0,
            expectedVariantId: variant._id,
            quantityInStorageDelta: -requiredQty,
            quantityForSaleDelta: -requiredQty,
          });
          historyEntries.push({
            productId: productItem.productId,
            productName: product.name,
            quantity: -requiredQty,
            userName: req.user?.name,
            orderId: order._id.toString(),
            orderName: order.orderName,
            note: "Xuất kho (đơn xuất hoàn thành)",
            source: "order_bulk_complete",
          });
        }

        productItem.status = true;
        productItem.quantityEx = quantity;
        productItem.stockAppliedQuantity = targetApplied;
      }

      appliedAdjustments = await applyStockAdjustments(adjustments);
      order.status = true;
      order.completedAt = new Date();
    } else {
      order.status = false;
      order.completedAt = null;
    }

    const updatedOrder = await saveWithStockRollback(order, appliedAdjustments);
    await saveStockHistories(historyEntries);
    res.json(updatedOrder);
  } catch (error) {
    console.error(error);
    res.status(getRouteErrorStatus(error)).json({
      message: getRouteErrorMessage(error, "Lỗi khi hoàn tất đơn xuất"),
    });
  }
}

async function setEpOrderLineStatusAndQuantity(req, res) {
  try {
    const { status } = req.body;
    if (typeof status !== "boolean") {
      return res.status(400).json({ message: "status phải là boolean" });
    }
    const order = await EpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const productIndex = parseInt(req.params.productIndex);
    if (
      isNaN(productIndex) ||
      productIndex < 0 ||
      productIndex >= order.productList.length
    ) {
      return res.status(400).json({ message: "Invalid product index" });
    }

    const productItem = order.productList[productIndex];
    if (status !== true || productItem.status === true) {
      const normalizedOrder = await saveExportOrder(order);
      return res.json(normalizedOrder);
    }

    const product = await Product.findById(productItem.productId)
      .select("name variant._id variant.quantityForSale variant.quantityInStorage");
    if (!product) {
      return res
        .status(404)
        .json({ message: `Product ${productItem.productId} not found` });
    }

    const variant = product.variant[0];
    if (!variant) {
      return res.status(400).json({ message: "Sản phẩm không có biến thể" });
    }

    const { quantity, quantityEx } = parseExportLineQuantities(productItem);
    const currentApplied = getStockAppliedQuantity(productItem);
    const untrackedQuantity = Math.max(0, quantityEx - currentApplied);
    const targetApplied = Math.max(0, quantity - untrackedQuantity);
    const requiredQty = targetApplied - currentApplied;

    if (!Number.isFinite(requiredQty) || requiredQty < 0) {
      return res.status(400).json({ message: "Số lượng xuất còn lại không hợp lệ" });
    }

    const appliedAdjustments = requiredQty > 0
      ? await applyStockAdjustments([{
        productId: product._id,
        variantIndex: 0,
        expectedVariantId: variant._id,
        quantityInStorageDelta: -requiredQty,
        quantityForSaleDelta: -requiredQty,
      }])
      : [];
    productItem.quantityEx = quantity;
    productItem.status = true;
    productItem.stockAppliedQuantity = targetApplied;

    const updatedOrder = await saveWithStockRollback(order, appliedAdjustments);
    if (requiredQty > 0) {
      await saveStockHistories([{
        productId: productItem.productId,
        productName: product.name,
        quantity: -requiredQty,
        userName: req.user?.name,
        orderId: order._id.toString(),
        orderName: order.orderName,
        note: "Xuất kho (đơn xuất hoàn thành)",
        source: "order_line_complete",
      }]);
    }
    res.json(updatedOrder);
  } catch (error) {
    console.error("Error updating export order item status:", error);
    res.status(getRouteErrorStatus(error)).json({
      message: getRouteErrorMessage(error, "Lỗi server khi cập nhật trạng thái sản phẩm"),
    });
  }
}

module.exports = {
  setEpOrderLineStatusAndQuantity,
  setEpOrderStatusAndQuantity,
};
