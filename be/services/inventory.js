const mongoose = require("mongoose");
const { Product } = require("../models/product");

class InventoryError extends Error {
  constructor(message, { statusCode = 400, code = "INVENTORY_ERROR" } = {}) {
    super(message);
    this.name = "InventoryError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

class InventoryRollbackError extends Error {
  constructor(originalError, rollbackErrors) {
    super("Không thể hoàn tác đầy đủ thay đổi tồn kho.");
    this.name = "InventoryRollbackError";
    this.statusCode = 500;
    this.code = "INVENTORY_ROLLBACK_FAILED";
    this.originalError = originalError;
    this.rollbackErrors = rollbackErrors;
  }
}

const normalizeObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new InventoryError(`${fieldName} không hợp lệ.`, {
      statusCode: 400,
      code: "INVALID_OBJECT_ID",
    });
  }
  return new mongoose.Types.ObjectId(String(value));
};

const normalizeVariantIndex = (value) => {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) {
    throw new InventoryError("Phiên bản sản phẩm không hợp lệ.", {
      statusCode: 400,
      code: "INVALID_VARIANT_INDEX",
    });
  }
  return index;
};

const normalizeDelta = (value, fieldName) => {
  const delta = value === undefined || value === null || value === ""
    ? 0
    : Number(value);
  if (!Number.isFinite(delta)) {
    throw new InventoryError(`${fieldName} phải là một số hợp lệ.`, {
      statusCode: 400,
      code: "INVALID_STOCK_DELTA",
    });
  }
  return delta;
};

const loadVariantIdentity = async ({ productId, variantIndex }) => {
  const product = await Product.findById(productId)
    .select("name variant._id variant.quantityForSale variant.quantityInStorage purchaseCount")
    .lean();

  if (!product) {
    throw new InventoryError(`Không tìm thấy sản phẩm ${productId}.`, {
      statusCode: 404,
      code: "PRODUCT_NOT_FOUND",
    });
  }

  const variant = product.variant?.[variantIndex];
  if (!variant) {
    throw new InventoryError("Không tìm thấy phiên bản sản phẩm.", {
      statusCode: 404,
      code: "VARIANT_NOT_FOUND",
    });
  }

  return {
    product,
    variant,
    variantId: variant._id,
  };
};

const diagnoseFailedAdjustment = async ({
  productId,
  variantIndex,
  variantId,
  quantityForSaleDelta,
  quantityInStorageDelta,
  purchaseCountDelta,
}) => {
  const product = await Product.findById(productId)
    .select("name variant._id variant.quantityForSale variant.quantityInStorage purchaseCount")
    .lean();

  if (!product) {
    throw new InventoryError(`Không tìm thấy sản phẩm ${productId}.`, {
      statusCode: 404,
      code: "PRODUCT_NOT_FOUND",
    });
  }

  const variantAtIndex = product.variant?.[variantIndex];
  const matchingVariants = product.variant?.filter(
    (item) => String(item._id) === String(variantId)
  ) || [];
  if (matchingVariants.length > 1) {
    throw new InventoryError(
      "Dữ liệu phiên bản sản phẩm bị trùng định danh; cần sửa dữ liệu trước khi cập nhật tồn kho.",
      { statusCode: 409, code: "DUPLICATE_VARIANT_ID" }
    );
  }
  const variant = matchingVariants[0];

  if (!variant) {
    const code = variantAtIndex ? "VARIANT_CHANGED" : "VARIANT_NOT_FOUND";
    throw new InventoryError(
      variantAtIndex
        ? "Phiên bản sản phẩm đã thay đổi, vui lòng tải lại dữ liệu."
        : "Không tìm thấy phiên bản sản phẩm.",
      { statusCode: variantAtIndex ? 409 : 404, code }
    );
  }

  if (
    quantityForSaleDelta < 0 &&
    Number(variant.quantityForSale || 0) < Math.abs(quantityForSaleDelta)
  ) {
    throw new InventoryError(
      `Không đủ hàng để bán cho sản phẩm ${product.name}. Tồn khả dụng hiện có: ${Number(variant.quantityForSale || 0)}.`,
      { statusCode: 400, code: "INSUFFICIENT_SALE_STOCK" }
    );
  }

  if (
    quantityInStorageDelta < 0 &&
    Number(variant.quantityInStorage || 0) < Math.abs(quantityInStorageDelta)
  ) {
    throw new InventoryError(
      `Không đủ tồn kho vật lý cho sản phẩm ${product.name}. Tồn hiện có: ${Number(variant.quantityInStorage || 0)}.`,
      { statusCode: 400, code: "INSUFFICIENT_STORAGE_STOCK" }
    );
  }

  if (
    purchaseCountDelta < 0 &&
    Number(product.purchaseCount || 0) < Math.abs(purchaseCountDelta)
  ) {
    throw new InventoryError(
      `Số lượng đã bán của sản phẩm ${product.name} không đủ để hoàn tác.`,
      { statusCode: 409, code: "INSUFFICIENT_PURCHASE_COUNT" }
    );
  }

  throw new InventoryError("Tồn kho vừa được thay đổi bởi thao tác khác, vui lòng thử lại.", {
    statusCode: 409,
    code: "INVENTORY_CONFLICT",
  });
};

const adjustVariantStock = async ({
  productId,
  variantIndex = 0,
  expectedVariantId,
  quantityForSaleDelta = 0,
  quantityInStorageDelta = 0,
  purchaseCountDelta = 0,
}) => {
  const normalizedProductId = normalizeObjectId(productId, "Mã sản phẩm");
  const normalizedIndex = normalizeVariantIndex(variantIndex);
  const saleDelta = normalizeDelta(quantityForSaleDelta, "quantityForSaleDelta");
  const storageDelta = normalizeDelta(quantityInStorageDelta, "quantityInStorageDelta");
  const soldDelta = normalizeDelta(purchaseCountDelta, "purchaseCountDelta");

  let variantId = expectedVariantId;
  if (!variantId) {
    const identity = await loadVariantIdentity({
      productId: normalizedProductId,
      variantIndex: normalizedIndex,
    });
    variantId = identity.variantId;
  }
  variantId = normalizeObjectId(variantId, "Mã phiên bản sản phẩm");

  if (saleDelta === 0 && storageDelta === 0 && soldDelta === 0) {
    const product = await Product.findById(normalizedProductId);
    if (!product) {
      throw new InventoryError(`Không tìm thấy sản phẩm ${normalizedProductId}.`, {
        statusCode: 404,
        code: "PRODUCT_NOT_FOUND",
      });
    }
    return { product, variantId };
  }

  const variantConditions = { _id: variantId };
  if (saleDelta < 0) {
    variantConditions.quantityForSale = { $gte: Math.abs(saleDelta) };
  }
  if (storageDelta < 0) {
    variantConditions.quantityInStorage = { $gte: Math.abs(storageDelta) };
  }

  const filter = {
    _id: normalizedProductId,
    variant: { $elemMatch: variantConditions },
    $expr: {
      $eq: [
        {
          $size: {
            $filter: {
              input: { $ifNull: ["$variant", []] },
              as: "candidate",
              cond: { $eq: ["$$candidate._id", variantId] },
            },
          },
        },
        1,
      ],
    },
  };
  if (soldDelta < 0) {
    filter.purchaseCount = { $gte: Math.abs(soldDelta) };
  }

  const increments = {};
  if (saleDelta !== 0) {
    increments["variant.$[target].quantityForSale"] = saleDelta;
  }
  if (storageDelta !== 0) {
    increments["variant.$[target].quantityInStorage"] = storageDelta;
  }
  if (soldDelta !== 0) {
    increments.purchaseCount = soldDelta;
  }

  const updateOptions = {
    new: true,
    runValidators: true,
  };
  if (saleDelta !== 0 || storageDelta !== 0) {
    updateOptions.arrayFilters = [{ "target._id": variantId }];
  }

  const product = await Product.findOneAndUpdate(
    filter,
    { $inc: increments },
    updateOptions
  );

  if (!product) {
    await diagnoseFailedAdjustment({
      productId,
      variantIndex: normalizedIndex,
      variantId,
      quantityForSaleDelta: saleDelta,
      quantityInStorageDelta: storageDelta,
      purchaseCountDelta: soldDelta,
    });
  }

  return { product, variantId };
};

const normalizeAdjustment = (adjustment) => ({
  productId: normalizeObjectId(adjustment.productId, "Mã sản phẩm"),
  variantIndex: normalizeVariantIndex(adjustment.variantIndex ?? 0),
  expectedVariantId: adjustment.expectedVariantId,
  quantityForSaleDelta: normalizeDelta(
    adjustment.quantityForSaleDelta,
    "quantityForSaleDelta"
  ),
  quantityInStorageDelta: normalizeDelta(
    adjustment.quantityInStorageDelta,
    "quantityInStorageDelta"
  ),
  purchaseCountDelta: normalizeDelta(
    adjustment.purchaseCountDelta,
    "purchaseCountDelta"
  ),
});

const invertAdjustment = (adjustment) => ({
  productId: adjustment.productId,
  variantIndex: adjustment.variantIndex,
  expectedVariantId: adjustment.expectedVariantId,
  quantityForSaleDelta: -adjustment.quantityForSaleDelta,
  quantityInStorageDelta: -adjustment.quantityInStorageDelta,
  purchaseCountDelta: -adjustment.purchaseCountDelta,
});

const rollbackStockAdjustments = async (appliedAdjustments) => {
  const rollbackErrors = [];

  for (const adjustment of [...appliedAdjustments].reverse()) {
    try {
      await adjustVariantStock(invertAdjustment(adjustment));
    } catch (error) {
      rollbackErrors.push({ adjustment, error });
    }
  }

  return rollbackErrors;
};

const applyStockAdjustments = async (adjustments) => {
  const appliedAdjustments = [];

  try {
    for (const rawAdjustment of adjustments) {
      const adjustment = normalizeAdjustment(rawAdjustment);
      const result = await adjustVariantStock(adjustment);
      appliedAdjustments.push({
        ...adjustment,
        expectedVariantId: result.variantId,
      });
    }
  } catch (error) {
    const rollbackErrors = await rollbackStockAdjustments(appliedAdjustments);
    if (rollbackErrors.length > 0) {
      throw new InventoryRollbackError(error, rollbackErrors);
    }
    throw error;
  }

  return appliedAdjustments;
};

const rollbackOrThrow = async (appliedAdjustments, originalError) => {
  const rollbackErrors = await rollbackStockAdjustments(appliedAdjustments);
  if (rollbackErrors.length > 0) {
    throw new InventoryRollbackError(originalError, rollbackErrors);
  }
  throw originalError;
};

const isVersionConflict = (error) => error?.name === "VersionError";

module.exports = {
  InventoryError,
  InventoryRollbackError,
  adjustVariantStock,
  applyStockAdjustments,
  isVersionConflict,
  rollbackOrThrow,
  rollbackStockAdjustments,
};
