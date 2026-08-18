const { Product } = require('../models/product');
const { validateOrderItemInput } = require('../validators/orderItem');
const { InventoryError } = require('./inventory');
const { isContactOnlyVariant } = require('./productPricing');

function parseOrderPrice(price) {
  if (typeof price === 'number') return price;
  return Number(String(price || '0').replace(/\./g, '').replace(',', '.')) || 0;
}

async function computeOrderTotal(cartItems) {
  let total = 0;
  for (const item of cartItems || []) {
    const product = await Product.findById(item.productId);
    const variant = product?.variant?.[item.variantIndex];
    if (variant) total += parseOrderPrice(variant.price) * (item.quantity || 0);
  }
  return total;
}

async function prepareOrderItemsForCreation(items, {
  enforcePublicProducts = false,
} = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: { status: 400, message: 'Danh sách sản phẩm không hợp lệ' } };
  }

  const preparedItems = [];
  const productCache = new Map();
  const reservedStock = new Map();
  let total = 0;

  for (const rawItem of items) {
    const parsed = validateOrderItemInput(rawItem);
    if (parsed.message) {
      return { error: { status: 400, message: parsed.message } };
    }

    const item = parsed.value;
    let product = productCache.get(item.productId);
    if (!product) {
      product = await Product.findById(item.productId);
      if (product) {
        productCache.set(item.productId, product);
      }
    }
    if (!product) {
      return {
        error: {
          status: 404,
          message: 'Sản phẩm với ID ' + item.productId + ' không tồn tại.',
        },
      };
    }
    if (enforcePublicProducts && product.display !== true) {
      return { error: { status: 403, message: 'Sản phẩm hiện không được phép bán.' } };
    }
    const variant = product.variant[item.variantIndex];
    if (!variant) {
      return {
        error: {
          status: 400,
          message: 'Phiên bản sản phẩm không hợp lệ cho sản phẩm ' + item.productId + '.',
        },
      };
    }
    if (enforcePublicProducts && isContactOnlyVariant(variant)) {
      return {
        error: {
          status: 409,
          message: 'Sản phẩm ' + product.name + ' hiện chỉ nhận liên hệ.',
        },
      };
    }

    const stockKey = product._id.toString() + ':' + item.variantIndex;
    const reservedQuantity = reservedStock.get(stockKey) || 0;
    if (variant.quantityForSale - reservedQuantity < item.quantity) {
      return {
        error: {
          status: 400,
          message: 'Không đủ hàng cho sản phẩm ' + product.name + ', variant ' +
            (variant.color || 'default') + '.',
        },
      };
    }
    reservedStock.set(stockKey, reservedQuantity + item.quantity);

    total += parseOrderPrice(variant.price) * item.quantity;
    preparedItems.push({
      product,
      variant,
      cartItem: item,
    });
  }

  return {
    preparedItems,
    cartItems: preparedItems.map((item) => item.cartItem),
    total,
  };
}

function createReservationAdjustments(preparedItems) {
  return preparedItems.map((item) => ({
    productId: item.product._id,
    variantIndex: item.cartItem.variantIndex,
    expectedVariantId: item.variant._id,
    quantityForSaleDelta: -item.cartItem.quantity,
  }));
}

async function buildOrderStockAdjustments(cartItems, createDeltas, { skipMissing = false } = {}) {
  const adjustments = [];
  const entries = [];

  for (const item of cartItems) {
    const product = await Product.findById(item.productId)
      .select('name variant._id variant.quantityForSale variant.quantityInStorage purchaseCount');
    const variant = product?.variant?.[item.variantIndex];
    if (!product || !variant) {
      if (skipMissing) continue;
      throw new InventoryError(
        !product
          ? 'Không tìm thấy sản phẩm trong đơn hàng.'
          : 'Không tìm thấy phiên bản sản phẩm trong đơn hàng.',
        {
          statusCode: 404,
          code: !product ? 'PRODUCT_NOT_FOUND' : 'VARIANT_NOT_FOUND',
        }
      );
    }

    adjustments.push({
      productId: product._id,
      variantIndex: item.variantIndex,
      expectedVariantId: variant._id,
      ...createDeltas(item),
    });
    entries.push({ item, product });
  }

  return { adjustments, entries };
}

module.exports = {
  buildOrderStockAdjustments,
  computeOrderTotal,
  createReservationAdjustments,
  parseOrderPrice,
  prepareOrderItemsForCreation,
  validateOrderItemInput,
};
