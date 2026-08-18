const { EpOrder } = require('../models/eporder');
const {
  resolveUpdatedExportPricing,
  saveExportOrder,
} = require('../services/epOrderPricing');

const toQuantity = (value) => Number(value) || 0;

const createRouteError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getStockAppliedQuantity = (line) => {
  const progress = toQuantity(line?.quantityEx);
  const hasExplicitValue = line?.stockAppliedQuantity !== undefined &&
    line?.stockAppliedQuantity !== null;
  const applied = hasExplicitValue
    ? Number(line.stockAppliedQuantity)
    : progress;
  if (!Number.isFinite(applied) || applied < 0 || applied > progress) {
    throw createRouteError(409, 'Dữ liệu số lượng đã trừ kho của dòng xuất không hợp lệ');
  }
  return applied;
};

async function deleteEpOrderLine(req, res) {
  try {
    const order = await EpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const index = parseInt(req.params.productIndex);
    if (!Number.isInteger(index) || index < 0 || index >= order.productList.length) {
      return res.status(400).json({ message: 'Invalid product index' });
    }
    if (
      toQuantity(order.productList[index].quantityEx) > 0 ||
      getStockAppliedQuantity(order.productList[index]) > 0
    ) {
      return res.status(400).json({
        message: 'Không thể xóa sản phẩm đã phát sinh xuất kho. Hãy hoàn số lượng xuất về 0 trước.',
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

    const updatedOrder = await saveExportOrder(order);
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function reorderEpOrderLines(req, res) {
  try {
    const order = await EpOrder.findById(req.params.id);
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
        typeof item.quantity === 'number' &&
        typeof item.quantityEx === 'number' &&
        typeof item.status === 'boolean'
    );

    if (!isValid) {
      return res.status(400).json({ message: 'Invalid productList format' });
    }

    const toLineKey = (item) => JSON.stringify({
      productId: String(item.productId),
      price: item.price || '',
      importPriceSnapshot: item.importPriceSnapshot || '',
      profitPercent: item.profitPercent ?? null,
      unit: item.unit || '',
      quantity: Number(item.quantity),
      quantityEx: Number(item.quantityEx),
      status: Boolean(item.status),
      note: item.note || '',
      vat: item.vat || '',
    });
    const countLines = (items) => items.reduce((counts, item) => {
      const key = toLineKey(item);
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
    const normalizedCurrentLines = await Promise.all(
      order.productList.map(async (item) => ({
        ...item.toObject(),
        ...await resolveUpdatedExportPricing(item, {}),
      }))
    );
    const currentCounts = countLines(normalizedCurrentLines);
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

    const currentLineBuckets = normalizedCurrentLines.reduce((buckets, item) => {
      const key = toLineKey(item);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
      return buckets;
    }, new Map());
    order.productList = productList.map((item) => {
      const key = toLineKey(item);
      return currentLineBuckets.get(key).shift();
    });

    order.total = order.productList
      .reduce((sum, item) => {
        const priceNum = parseFloat(
          item.price?.replace(/\./g, '').replace(',', '.') || 0
        );
        return sum + priceNum * (item.quantity || 0);
      }, 0)
      .toString();

    const updatedOrder = await saveExportOrder(order);
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

module.exports = {
  deleteEpOrderLine,
  reorderEpOrderLines,
};
