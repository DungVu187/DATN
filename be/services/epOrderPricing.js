const { Product } = require('../models/product');
const { parseProductNumber } = require('./productPricing');

function createPricingError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeProfitPercent(value, fallback = 0) {
  const parsed = value === undefined || value === null || value === ''
    ? Number(fallback)
    : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw createPricingError(400, '% lợi nhuận phải nằm trong khoảng từ 0 đến 100');
  }
  return Math.round(parsed * 100) / 100;
}

function formatSnapshotPrice(value) {
  return String(Math.max(0, Math.round(parseProductNumber(value))));
}

function calculateExportPrice(importPriceSnapshot, profitPercent) {
  const importPrice = parseProductNumber(importPriceSnapshot);
  return String(Math.max(0, Math.round(importPrice * (1 + profitPercent / 100))));
}

async function loadProductPricing(productId) {
  const product = await Product.findById(productId)
    .select('variant.importPrice variant.earn')
    .lean();
  if (!product) {
    throw createPricingError(404, 'Product ' + productId + ' not found');
  }
  const variant = product.variant?.[0];
  if (!variant) {
    throw createPricingError(400, 'Sản phẩm không có biến thể');
  }
  return variant;
}

function getExistingPricingBase(line, variant) {
  const profitPercent = normalizeProfitPercent(
    line.profitPercent,
    variant?.earn ?? 0
  );
  const hasStoredSnapshot = line.importPriceSnapshot !== undefined &&
    line.importPriceSnapshot !== null &&
    line.importPriceSnapshot !== '';
  let importPriceSnapshot = hasStoredSnapshot
    ? parseProductNumber(line.importPriceSnapshot)
    : 0;
  if (!hasStoredSnapshot) {
    const productImportPrice = parseProductNumber(variant?.importPrice);
    const currentExportPrice = parseProductNumber(line.price);
    importPriceSnapshot = productImportPrice > 0
      ? productImportPrice
      : currentExportPrice / (1 + profitPercent / 100);
  }

  const normalizedSnapshot = formatSnapshotPrice(importPriceSnapshot);
  return {
    importPriceSnapshot: normalizedSnapshot,
    profitPercent,
    price: line.price !== undefined && line.price !== null && line.price !== ''
      ? String(Math.max(0, Math.round(parseProductNumber(line.price))))
      : calculateExportPrice(normalizedSnapshot, profitPercent),
  };
}

async function resolveNewExportPricing(line) {
  const variant = await loadProductPricing(line.productId);
  const hasExplicitSnapshot = line.importPriceSnapshot !== undefined &&
    line.importPriceSnapshot !== null &&
    line.importPriceSnapshot !== '';
  const profitPercent = normalizeProfitPercent(
    line.profitPercent,
    variant.earn ?? 0
  );

  if (hasExplicitSnapshot) {
    const importPriceSnapshot = formatSnapshotPrice(line.importPriceSnapshot);
    return {
      importPriceSnapshot,
      profitPercent,
      price: calculateExportPrice(importPriceSnapshot, profitPercent),
    };
  }

  const productImportPrice = parseProductNumber(variant.importPrice);
  if (productImportPrice > 0 || line.price === undefined) {
    const importPriceSnapshot = formatSnapshotPrice(productImportPrice);
    return {
      importPriceSnapshot,
      profitPercent,
      price: calculateExportPrice(importPriceSnapshot, profitPercent),
    };
  }

  const legacyPrice = parseProductNumber(line.price);
  const importPriceSnapshot = formatSnapshotPrice(
    legacyPrice / (1 + profitPercent / 100)
  );
  return {
    importPriceSnapshot,
    profitPercent,
    price: String(Math.max(0, Math.round(legacyPrice))),
  };
}

async function resolveUpdatedExportPricing(line, updates) {
  const hasStoredSnapshot = line.importPriceSnapshot !== undefined &&
    line.importPriceSnapshot !== null &&
    line.importPriceSnapshot !== '';
  const hasStoredProfit = line.profitPercent !== undefined &&
    line.profitPercent !== null &&
    line.profitPercent !== '';
  const variant = hasStoredSnapshot && hasStoredProfit
    ? null
    : await loadProductPricing(line.productId);
  const base = getExistingPricingBase(line, variant);

  if (updates.profitPercent !== undefined) {
    const profitPercent = normalizeProfitPercent(updates.profitPercent);
    return {
      importPriceSnapshot: base.importPriceSnapshot,
      profitPercent,
      price: calculateExportPrice(base.importPriceSnapshot, profitPercent),
    };
  }

  if (updates.price !== undefined) {
    const requestedPrice = parseProductNumber(updates.price);
    const importPrice = parseProductNumber(base.importPriceSnapshot);
    if (importPrice <= 0) {
      const importPriceSnapshot = formatSnapshotPrice(
        requestedPrice / (1 + base.profitPercent / 100)
      );
      return {
        importPriceSnapshot,
        profitPercent: base.profitPercent,
        price: String(Math.max(0, Math.round(requestedPrice))),
      };
    }
    const profitPercent = normalizeProfitPercent(
      ((requestedPrice / importPrice) - 1) * 100
    );
    return {
      importPriceSnapshot: base.importPriceSnapshot,
      profitPercent,
      price: calculateExportPrice(base.importPriceSnapshot, profitPercent),
    };
  }

  return base;
}

async function ensureOrderPricingSnapshots(order) {
  await Promise.all((order.productList || []).map(async (line) => {
    const hasSnapshot = line.importPriceSnapshot !== undefined &&
      line.importPriceSnapshot !== null &&
      line.importPriceSnapshot !== '';
    const hasProfit = line.profitPercent !== undefined &&
      line.profitPercent !== null &&
      line.profitPercent !== '';
    const hasPrice = line.price !== undefined &&
      line.price !== null &&
      line.price !== '';
    if (hasSnapshot && hasProfit && hasPrice) return;

    const pricing = await resolveUpdatedExportPricing(line, {});
    line.importPriceSnapshot = pricing.importPriceSnapshot;
    line.profitPercent = pricing.profitPercent;
    line.price = pricing.price;
  }));
  return order;
}

async function saveExportOrder(order) {
  await ensureOrderPricingSnapshots(order);
  return order.save();
}

module.exports = {
  calculateExportPrice,
  ensureOrderPricingSnapshots,
  formatSnapshotPrice,
  getExistingPricingBase,
  loadProductPricing,
  normalizeProfitPercent,
  resolveNewExportPricing,
  resolveUpdatedExportPricing,
  saveExportOrder,
};
