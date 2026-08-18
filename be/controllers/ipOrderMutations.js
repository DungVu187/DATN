const mongoose = require("mongoose");
const { IpOrder } = require("../models/iporder");
const { Product } = require("../models/product");
const { StorageHistory } = require("../models/storagehistory");
const {
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

const hasOwn = (object, field) =>
  Object.prototype.hasOwnProperty.call(object || {}, field);

const validateLineQuantities = ({ quantity, quantityRe }) => {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw createRouteError(400, "Số lượng đặt phải là số nguyên lớn hơn hoặc bằng 0.");
  }
  if (
    typeof quantityRe !== "number" ||
    !Number.isFinite(quantityRe) ||
    quantityRe < 0 ||
    quantityRe > quantity
  ) {
    throw createRouteError(
      400,
      "Số lượng đã nhập phải nằm trong khoảng từ 0 đến số lượng đặt."
    );
  }
};

const sanitizeLineForCreate = (rawLine, { forceZeroProgress = false } = {}) => {
  if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) {
    throw createRouteError(400, "Dữ liệu sản phẩm trong đơn nhập không hợp lệ.");
  }
  const quantityRe = forceZeroProgress ? 0 : (rawLine.quantityRe ?? 0);
  validateLineQuantities({ quantity: rawLine.quantity, quantityRe });
  if (!mongoose.Types.ObjectId.isValid(rawLine.productId)) {
    throw createRouteError(400, "Mã sản phẩm không hợp lệ.");
  }

  return {
    productId: String(rawLine.productId),
    price: typeof rawLine.price === "string" ? rawLine.price : "",
    unit: typeof rawLine.unit === "string" ? rawLine.unit : "",
    quantity: rawLine.quantity,
    quantityRe,
    stockAppliedQuantity: forceZeroProgress ? 0 : quantityRe,
    status: forceZeroProgress ? false : quantityRe === rawLine.quantity,
    note: typeof rawLine.note === "string" ? rawLine.note : "",
    vat: typeof rawLine.vat === "string" ? rawLine.vat : "",
  };
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

const adjustImportStock = async ({ productId, delta, req, order, note, isAIScan, source }) => {
  if (!delta) return { appliedAdjustments: [], historyData: null };

  const product = await Product.findById(productId)
    .select("name variant._id variant.quantityForSale variant.quantityInStorage");
  if (!product) {
    throw createRouteError(404, `Product ${productId} not found`);
  }

  const variant = product.variant[0];
  if (!variant) {
    throw createRouteError(400, "Sản phẩm không có biến thể");
  }

  const appliedAdjustments = await applyStockAdjustments([{
    productId,
    variantIndex: 0,
    expectedVariantId: variant._id,
    quantityInStorageDelta: delta,
    quantityForSaleDelta: delta,
  }]);

  return {
    appliedAdjustments,
    historyData: {
      productId,
      productName: product.name,
      quantity: delta,
      userName: req.user?.name,
      orderId: order._id.toString(),
      orderName: order.orderName,
      note,
      isAIScan: !!isAIScan,
      source,
    },
  };
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

async function createIpOrder(req, res) {
  try {
    const userName = req.user.name;
    const { productList, orderName, note } = req.body;
    if (productList !== undefined && !Array.isArray(productList)) {
      throw createRouteError(400, "productList phải là một mảng.");
    }

    const sanitizedProductList = (productList || []).map((rawLine) => {
      if (
        (hasOwn(rawLine, "quantityRe") && rawLine.quantityRe !== 0) ||
        (hasOwn(rawLine, "status") && rawLine.status !== false)
      ) {
        throw createRouteError(
          400,
          "Đơn nhập mới chỉ được chứa sản phẩm chưa phát sinh nhập kho."
        );
      }
      return sanitizeLineForCreate(rawLine, { forceZeroProgress: true });
    });
    const newOrder = new IpOrder({
      orderName: orderName || "",
      note: typeof note === "string" ? note : "",
      userName,
      productList: sanitizedProductList,
    });

    if (sanitizedProductList.length > 0) {
      newOrder.total = sanitizedProductList
        .reduce((sum, item) => {
          const priceNum = parseFloat(
            item.price?.replace(/\./g, "").replace(",", ".") || 0
          );
          return sum + priceNum * (item.quantity || 0);
        }, 0)
        .toString();
    }

    const savedOrder = await newOrder.save();
    res.status(201).json(savedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function addIpOrderLine(req, res) {
  try {
    const order = await IpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const rawProduct = req.body || {};
    const isAIScan = rawProduct.isAIScan === true;
    const newProduct = sanitizeLineForCreate(rawProduct);
    const stockDelta = newProduct.quantityRe;
    let stockResult = { appliedAdjustments: [], historyData: null };
    if (stockDelta > 0) {
      stockResult = await adjustImportStock({
        productId: newProduct.productId,
        delta: stockDelta,
        req,
        order,
        note: isAIScan ? "Nhập kho (AI scan đơn nhập)" : "Nhập kho (thêm sản phẩm đơn nhập)",
        isAIScan,
        source: isAIScan ? undefined : "order_line_manual",
      });
    }
    order.productList.push(newProduct);

    // Tính toán lại tổng tiền của đơn hàng
    order.total = order.productList
      .reduce((sum, item) => {
        const priceNum = parseFloat(
          item.price?.replace(/\./g, "").replace(",", ".") || 0
        );
        return sum + priceNum * (item.quantity || 0);
      }, 0)
      .toString();

    const updatedOrder = await saveWithStockRollback(
      order,
      stockResult.appliedAdjustments
    );
    await saveStockHistories([stockResult.historyData]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(getRouteErrorStatus(error)).json({
      message: getRouteErrorMessage(error, "Lỗi khi thêm sản phẩm vào đơn nhập"),
    });
  }
}

async function updateIpOrderLine(req, res) {
  try {
    const order = await IpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const productIndex = parseInt(req.params.productIndex);
    if (
      isNaN(productIndex) ||
      productIndex < 0 ||
      productIndex >= order.productList.length
    ) {
      return res.status(404).json({ message: "Product index not found" });
    }

    const currentProduct = order.productList[productIndex];
    const rawUpdate = req.body || {};
    if (
      hasOwn(rawUpdate, "productId") &&
      String(rawUpdate.productId) !== String(currentProduct.productId)
    ) {
      return res.status(400).json({
        message: "Không thể thay đổi sản phẩm của một dòng đơn nhập hiện có.",
      });
    }

    const targetQuantity = hasOwn(rawUpdate, "quantity")
      ? rawUpdate.quantity
      : currentProduct.quantity;
    const targetProgress = hasOwn(rawUpdate, "quantityRe")
      ? rawUpdate.quantityRe
      : toQuantity(currentProduct.quantityRe);
    validateLineQuantities({
      quantity: targetQuantity,
      quantityRe: targetProgress,
    });

    const currentProgress = toQuantity(currentProduct.quantityRe);
    const currentApplied = getAppliedQuantity(currentProduct);
    const untrackedQuantity = currentProgress - currentApplied;
    const targetApplied = Math.max(0, targetProgress - untrackedQuantity);
    const stockDelta = targetApplied - currentApplied;
    const isAIScan = rawUpdate.isAIScan === true;
    const updatedProduct = {
      ...currentProduct.toObject(),
      quantity: targetQuantity,
      quantityRe: targetProgress,
      stockAppliedQuantity: targetApplied,
      status: targetProgress === targetQuantity,
    };
    for (const field of ["price", "unit", "note", "vat"]) {
      if (!hasOwn(rawUpdate, field)) continue;
      if (typeof rawUpdate[field] !== "string") {
        throw createRouteError(400, `${field} phải là chuỗi.`);
      }
      updatedProduct[field] = rawUpdate[field];
    }
    order.productList[productIndex] = updatedProduct;

    let stockResult = { appliedAdjustments: [], historyData: null };
    if (stockDelta !== 0) {
      stockResult = await adjustImportStock({
        productId: currentProduct.productId,
        delta: stockDelta,
        req,
        order,
        note: stockDelta > 0 ? "Nhập kho (cập nhật đơn nhập)" : "Điều chỉnh giảm nhập kho",
        isAIScan,
        source: isAIScan ? undefined : "order_line_manual",
      });
    }

    order.total = order.productList
      .reduce((sum, item) => {
        const priceNum = parseFloat(
          item.price?.replace(/\./g, "").replace(",", ".") || 0
        );
        return sum + priceNum * (item.quantity || 0);
      }, 0)
      .toString();

    const updatedOrder = await saveWithStockRollback(
      order,
      stockResult.appliedAdjustments
    );
    await saveStockHistories([stockResult.historyData]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(getRouteErrorStatus(error)).json({
      message: getRouteErrorMessage(error, "Lỗi khi cập nhật đơn nhập"),
    });
  }
}

module.exports = {
  addIpOrderLine,
  createIpOrder,
  updateIpOrderLine,
};

