const { IpOrder } = require('../models/iporder');

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
    throw createRouteError(409, 'Dữ liệu số lượng đã cộng kho của dòng nhập không hợp lệ.');
  }
  return applied;
};

async function deleteIpOrderLine(req, res) {
  try {
    const order = await IpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const index = parseInt(req.params.productIndex);
    if (!Number.isInteger(index) || index < 0 || index >= order.productList.length) {
      return res.status(400).json({ message: 'Invalid product index' });
    }
    if (
      toQuantity(order.productList[index].quantityRe) > 0 ||
      getAppliedQuantity(order.productList[index]) > 0
    ) {
      return res.status(400).json({
        message: 'Không thể xóa sản phẩm đã phát sinh nhập kho. Hãy điều chỉnh số lượng nhập về 0 trước.',
      });
    }
    order.productList.splice(index, 1);

    order.total = order.productList
      .reduce((sum, item) => {
        const priceNum = parseFloat(
          item.price?.replace(/\./g, '').replace(',', '.') || 0
        );
        return sum + priceNum * (item.quantity || 0);
      }, 0)
      .toString();

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function reorderIpOrderLines(req, res) {
  try {
    const order = await IpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const { productList } = req.body;
    if (!Array.isArray(productList)) {
      return res
        .status(400)
        .json({ message: 'productList must be an array' });
    }

    const isValid = productList.every(
      (item) =>
        item.productId &&
        typeof item.price === 'string' &&
        typeof item.unit === 'string' &&
        Number.isInteger(item.quantity) &&
        item.quantity >= 0 &&
        typeof item.quantityRe === 'number' &&
        Number.isFinite(item.quantityRe) &&
        item.quantityRe >= 0 &&
        item.quantityRe <= item.quantity &&
        typeof item.status === 'boolean'
    );

    if (!isValid) {
      return res.status(400).json({ message: 'Invalid productList format' });
    }

    const toLineKey = (item) => JSON.stringify({
      productId: String(item.productId),
      price: item.price || '',
      unit: item.unit || '',
      quantity: Number(item.quantity),
      quantityRe: Number(item.quantityRe),
      status: Boolean(item.status),
      note: item.note || '',
      vat: item.vat || '',
    });
    const countLines = (items) => items.reduce((counts, item) => {
      const key = toLineKey(item);
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
    const currentCounts = countLines(order.productList);
    const reorderedCounts = countLines(productList);
    const isSameLines = currentCounts.size === reorderedCounts.size &&
      [...currentCounts.entries()].every(
        ([key, count]) => reorderedCounts.get(key) === count
      );
    if (!isSameLines) {
      return res.status(400).json({
        message: 'API sắp xếp chỉ được thay đổi thứ tự sản phẩm.',
      });
    }

    const currentLineBuckets = order.productList.reduce((buckets, item) => {
      const key = toLineKey(item);
      const bucket = buckets.get(key) || [];
      bucket.push(item);
      buckets.set(key, bucket);
      return buckets;
    }, new Map());
    order.productList = productList.map((item) => {
      const currentLine = currentLineBuckets.get(toLineKey(item)).shift();
      return currentLine.toObject();
    });

    order.total = order.productList
      .reduce((sum, item) => {
        const priceNum = parseFloat(
          item.price?.replace(/\./g, '').replace(',', '.') || 0
        );
        return sum + priceNum * (item.quantity || 0);
      }, 0)
      .toString();

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

module.exports = {
  deleteIpOrderLine,
  reorderIpOrderLines,
};
