const { IpOrder } = require("../models/iporder");
const { Product } = require("../models/product");
const { StorageHistory } = require("../models/storagehistory");
const {
  InventoryError,
  applyStockAdjustments,
  isVersionConflict,
  rollbackOrThrow,
} = require("../services/inventory");

const toQuantity = (value) => Number(value) || 0;

const createRouteError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getAppliedQuantity = (productItem) => {
  const progress = toQuantity(productItem.quantityRe);
  if (
    productItem.stockAppliedQuantity === undefined ||
    productItem.stockAppliedQuantity === null
  ) {
    return progress;
  }
  const applied = Number(productItem.stockAppliedQuantity);
  if (!Number.isFinite(applied) || applied < 0 || applied > progress) {
    throw createRouteError(409, "Dữ liệu số lượng đã cộng kho của dòng nhập không hợp lệ.");
  }
  return applied;
};

const saveWithStockRollback = async (order, appliedAdjustments) => {
  try {
    return await order.save();
  } catch (error) {
    await rollbackOrThrow(appliedAdjustments, error);
  }
};

const saveStockHistories = async (historyEntries) => {
  for (const historyEntry of historyEntries.filter(Boolean)) {
    try {
      await new StorageHistory(historyEntry).save();
    } catch (logErr) {
      console.error("StorageHistory error (iporder stock adjustment):", logErr.message);
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
    return "Đơn nhập vừa được thay đổi bởi thao tác khác, vui lòng tải lại.";
  }
  return fallback;
};

async function setIpOrderStatusAndQuantity(req, res) {
  try {
    const { status } = req.body;
    if (typeof status !== "boolean") {
      return res.status(400).json({ message: "status phải là boolean." });
    }
    const order = await IpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    let appliedAdjustments = [];
    const historyEntries = [];
    if (status === true) {
      const adjustments = [];
      for (const productItem of order.productList) {
        const product = await Product.findById(productItem.productId)
          .select("name variant._id variant.quantityForSale variant.quantityInStorage");
        if (!product) {
          throw new InventoryError("Product " + productItem.productId + " not found", {
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

        const addQty = productItem.quantity - getAppliedQuantity(productItem);
        if (!Number.isFinite(addQty) || addQty < 0) {
          throw new InventoryError("Số lượng nhập còn lại không hợp lệ.", {
            statusCode: 400,
            code: "INVALID_IMPORT_QUANTITY",
          });
        }
        if (addQty > 0) {
          adjustments.push({
            productId: product._id,
            variantIndex: 0,
            expectedVariantId: variant._id,
            quantityInStorageDelta: addQty,
            quantityForSaleDelta: addQty,
          });
          historyEntries.push({
            productId: productItem.productId,
            productName: product.name,
            quantity: addQty,
            userName: req.user?.name,
            orderId: order._id.toString(),
            orderName: order.orderName,
            note: "Nhập kho (đơn nhập hoàn thành)",
            source: "order_bulk_complete",
          });
        }
        productItem.quantityRe = productItem.quantity;
        productItem.stockAppliedQuantity = productItem.quantity;
        productItem.status = true;
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
    res.status(getRouteErrorStatus(error)).json({
      message: getRouteErrorMessage(error, "Lỗi khi hoàn tất đơn nhập"),
    });
  }
}

async function setIpOrderLineStatusAndQuantity(req, res) {
  try {
    const { status } = req.body;
    if (typeof status !== "boolean") {
      return res.status(400).json({ message: "status phải là boolean." });
    }
    const order = await IpOrder.findById(req.params.id);
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
      return res.json(order);
    }

    const product = await Product.findById(productItem.productId)
      .select("name variant._id variant.quantityForSale variant.quantityInStorage");
    if (!product) {
      return res
        .status(404)
        .json({ message: "Product " + productItem.productId + " not found" });
    }

    const variant = product.variant[0];
    if (!variant) {
      return res.status(400).json({ message: "Sản phẩm không có biến thể" });
    }

    const addQty = productItem.quantity - getAppliedQuantity(productItem);
    if (!Number.isFinite(addQty) || addQty < 0) {
      return res.status(400).json({ message: "Số lượng nhập còn lại không hợp lệ" });
    }
    const appliedAdjustments = addQty > 0
      ? await applyStockAdjustments([{
        productId: product._id,
        variantIndex: 0,
        expectedVariantId: variant._id,
        quantityInStorageDelta: addQty,
        quantityForSaleDelta: addQty,
      }])
      : [];
    productItem.quantityRe = productItem.quantity;
    productItem.stockAppliedQuantity = productItem.quantity;
    productItem.status = true;

    const updatedOrder = await saveWithStockRollback(order, appliedAdjustments);
    if (addQty > 0) {
      await saveStockHistories([{
        productId: productItem.productId,
        productName: product.name,
        quantity: addQty,
        userName: req.user?.name,
        orderId: order._id.toString(),
        orderName: order.orderName,
        note: "Nhập kho (đơn nhập hoàn thành)",
        source: "order_line_complete",
      }]);
    }
    res.json(updatedOrder);
  } catch (error) {
    console.error("Error updating import order item status:", error);
    res.status(getRouteErrorStatus(error)).json({
      message: getRouteErrorMessage(error, "Lỗi server khi cập nhật trạng thái sản phẩm"),
    });
  }
}

module.exports = {
  setIpOrderLineStatusAndQuantity,
  setIpOrderStatusAndQuantity,
};
