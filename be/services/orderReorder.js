const { validateOrderItemInput } = require('../validators/orderItem');

const REORDER_ONLY_MESSAGE = 'API sắp xếp chỉ được thay đổi thứ tự, không được đổi sản phẩm hoặc số lượng.';

function buildOrderLineKey(item) {
  return String(item.productId) + ':' + Number(item.variantIndex) + ':' + Number(item.quantity);
}

function countOrderLines(items) {
  return items.reduce((counts, item) => {
    const key = buildOrderLineKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
}

function hasSameOrderLines(currentItems, reorderedItems) {
  const currentLineCounts = countOrderLines(currentItems);
  const reorderedLineCounts = countOrderLines(reorderedItems);

  return currentLineCounts.size === reorderedLineCounts.size &&
    [...currentLineCounts.entries()].every(
      ([key, count]) => reorderedLineCounts.get(key) === count
    );
}

function prepareOrderReorderItems(currentItems, rawItems) {
  if (!Array.isArray(rawItems)) {
    return { error: { status: 400, message: 'Danh sách sản phẩm không hợp lệ' } };
  }

  const cartItems = [];
  for (const item of rawItems) {
    const parsed = validateOrderItemInput(item);
    if (parsed.message) {
      return { error: { status: 400, message: parsed.message } };
    }
    cartItems.push(parsed.value);
  }

  if (!hasSameOrderLines(currentItems, cartItems)) {
    return { error: { status: 400, message: REORDER_ONLY_MESSAGE } };
  }

  return { cartItems };
}

module.exports = {
  REORDER_ONLY_MESSAGE,
  buildOrderLineKey,
  countOrderLines,
  hasSameOrderLines,
  prepareOrderReorderItems,
};
