const mongoose = require("mongoose");
const { EpOrder } = require("../models/eporder");
const { Product } = require("../models/product");
const { StorageHistory } = require("../models/storagehistory");
const {
  applyStockAdjustments,
  isVersionConflict,
  rollbackOrThrow,
} = require("../services/inventory");
const {
  resolveNewExportPricing,
  resolveUpdatedExportPricing,
  saveExportOrder,
} = require("../services/epOrderPricing");

const toQuantity = (value) => Number(value) || 0;

const createRouteError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const adjustExportStock = async ({ productId, delta, req, order, note, isAIScan, source }) => {
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
    quantityInStorageDelta: -delta,
    quantityForSaleDelta: -delta,
  }]);

  return {
    appliedAdjustments,
    historyData: {
      productId,
      productName: product.name,
      quantity: -delta,
      userName: req.user?.name,
      orderId: order._id.toString(),
      orderName: order.orderName,
      note,
      isAIScan: !!isAIScan,
      source,
    },
  };
};

const EXPORT_LINE_EDITABLE_FIELDS = ["unit", "quantity", "quantityEx", "note", "vat"];

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

const pickExportLineFields = (line) => EXPORT_LINE_EDITABLE_FIELDS.reduce(
  (picked, field) => {
    if (line?.[field] !== undefined) picked[field] = line[field];
    return picked;
  },
  {}
);

const buildNewExportLine = async (line, stockAppliedQuantity, stockUpdateSkipped = false) => {
  const { quantity, quantityEx } = parseExportLineQuantities(line);
  if (!mongoose.Types.ObjectId.isValid(line?.productId)) {
    throw createRouteError(400, "Mã sản phẩm không hợp lệ");
  }
  const pricing = await resolveNewExportPricing(line);
  return {
    productId: String(line.productId),
    ...pickExportLineFields(line),
    ...pricing,
    quantity,
    quantityEx,
    status: quantityEx === quantity,
    stockAppliedQuantity,
    stockUpdateSkipped,
  };
};

const assertSkippableAIScanExport = async (line) => {
  if (line?.skipStockUpdate !== true || line?.isAIScan !== true) {
    throw createRouteError(400, "Không được phép bỏ qua cập nhật tồn kho");
  }
  const product = await Product.findById(line.productId)
    .select("variant.quantityForSale variant.quantityInStorage");
  const variant = product?.variant?.[0];
  if (!product || !variant) {
    throw createRouteError(404, "Không tìm thấy sản phẩm hoặc phiên bản sản phẩm");
  }
  if (toQuantity(variant.quantityForSale) !== 0 || toQuantity(variant.quantityInStorage) !== 0) {
    throw createRouteError(
      400,
      "Chỉ được bỏ qua tồn kho cho sản phẩm mới do AI tạo và chưa có tồn"
    );
  }
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

async function createEpOrder(req, res) {
  try {
    const userName = req.user.name;
    const { productList, orderName, note } = req.body;
    if (productList !== undefined && !Array.isArray(productList)) {
      throw createRouteError(400, "productList phải là một mảng");
    }
    const normalizedProductList = await Promise.all((productList || []).map(async (line) => {
      const { quantityEx } = parseExportLineQuantities(line);
      if (
        quantityEx !== 0 ||
        (Object.prototype.hasOwnProperty.call(line, "status") && line.status !== false)
      ) {
        throw createRouteError(
          400,
          "Đơn xuất mới chỉ được khởi tạo với số lượng đã xuất bằng 0"
        );
      }
      return buildNewExportLine(line, 0, false);
    }));
    const newOrder = new EpOrder({
      orderName: orderName || "",
      note: typeof note === "string" ? note : "",
      userName,
      productList: normalizedProductList,
    });

    if (normalizedProductList.length > 0) {
      newOrder.total = normalizedProductList
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

async function addEpOrderLine(req, res) {
  try {
    const order = await EpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const newProduct = req.body;
    const { quantityEx } = parseExportLineQuantities(newProduct);
    const requestedSkip = newProduct.skipStockUpdate !== undefined;
    const shouldSkipStockUpdate = requestedSkip && newProduct.skipStockUpdate === true;
    if (requestedSkip && typeof newProduct.skipStockUpdate !== "boolean") {
      throw createRouteError(400, "skipStockUpdate phải là boolean");
    }
    if (shouldSkipStockUpdate) {
      await assertSkippableAIScanExport(newProduct);
    }
    const stockDelta = shouldSkipStockUpdate ? 0 : quantityEx;
    let stockResult = { appliedAdjustments: [], historyData: null };
    if (stockDelta > 0) {
      stockResult = await adjustExportStock({
        productId: newProduct.productId,
        delta: stockDelta,
        req,
        order,
        note: newProduct.isAIScan ? "Xuất kho (AI scan đơn xuất)" : "Xuất kho (thêm sản phẩm đơn xuất)",
        isAIScan: newProduct.isAIScan,
        source: newProduct.isAIScan ? undefined : "order_line_manual",
      });
    }

    order.productList.push(await buildNewExportLine(
      newProduct,
      stockDelta,
      shouldSkipStockUpdate
    ));
    const updatedOrder = await saveWithStockRollback(
      order,
      stockResult.appliedAdjustments
    );
    await saveStockHistories([stockResult.historyData]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(getRouteErrorStatus(error)).json({
      message: getRouteErrorMessage(error, "Lỗi khi thêm sản phẩm vào đơn xuất"),
    });
  }
}

async function updateEpOrderLine(req, res) {
  try {
    const order = await EpOrder.findById(req.params.id);
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
    if (
      req.body.productId !== undefined &&
      String(req.body.productId) !== String(currentProduct.productId)
    ) {
      return res.status(400).json({
        message: "Không được đổi sản phẩm của dòng đã tạo; hãy xóa dòng cũ và thêm dòng mới",
      });
    }

    const editableFields = pickExportLineFields(req.body);
    const pricing = await resolveUpdatedExportPricing(currentProduct, req.body);
    const candidateLine = {
      ...currentProduct.toObject(),
      ...editableFields,
      ...pricing,
    };
    const { quantity, quantityEx } = parseExportLineQuantities(candidateLine);
    const currentProgress = toQuantity(currentProduct.quantityEx);
    const currentApplied = getStockAppliedQuantity(currentProduct);
    const untrackedQuantity = Math.max(0, currentProgress - currentApplied);
    const targetApplied = Math.max(0, quantityEx - untrackedQuantity);
    const stockDelta = targetApplied - currentApplied;
    let stockResult = { appliedAdjustments: [], historyData: null };
    if (stockDelta !== 0) {
      stockResult = await adjustExportStock({
        productId: currentProduct.productId,
        delta: stockDelta,
        req,
        order,
        note: stockDelta > 0 ? "Xuất kho (cập nhật đơn xuất)" : "Hoàn kho (cập nhật đơn xuất)",
        isAIScan: req.body.isAIScan,
        source: req.body.isAIScan ? undefined : "order_line_manual",
      });
    }

    order.productList[productIndex] = {
      ...order.productList[productIndex].toObject(),
      ...editableFields,
      ...pricing,
      productId: currentProduct.productId,
      quantity,
      quantityEx,
      status: quantityEx === quantity,
      stockAppliedQuantity: targetApplied,
    };

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
      message: getRouteErrorMessage(error, "Lỗi khi cập nhật đơn xuất"),
    });
  }
}

module.exports = {
  addEpOrderLine,
  createEpOrder,
  updateEpOrderLine,
};
