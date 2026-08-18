const { IpOrder } = require('../models/iporder');
const { EpOrder } = require('../models/eporder');
const { saveExportOrder } = require('../services/epOrderPricing');

const toQuantity = (value) => Number(value) || 0;

const createRouteError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getImportAppliedQuantity = (line) => {
  const progress = toQuantity(line.quantityRe);
  if (line.stockAppliedQuantity === undefined || line.stockAppliedQuantity === null) {
    return progress;
  }
  const applied = Number(line.stockAppliedQuantity);
  if (!Number.isFinite(applied) || applied < 0 || applied > progress) {
    throw createRouteError(409, 'Dữ liệu số lượng đã cộng kho của dòng nhập không hợp lệ.');
  }
  return applied;
};

const getExportAppliedQuantity = (line) => {
  const progress = toQuantity(line?.quantityEx);
  const hasExplicitValue = line?.stockAppliedQuantity !== undefined &&
    line?.stockAppliedQuantity !== null;
  const applied = hasExplicitValue ? Number(line.stockAppliedQuantity) : progress;
  if (!Number.isFinite(applied) || applied < 0 || applied > progress) {
    throw createRouteError(409, 'Dữ liệu số lượng đã trừ kho của dòng xuất không hợp lệ');
  }
  return applied;
};

const isImportLineFullyApplied = (line) =>
  toQuantity(line.quantityRe) === toQuantity(line.quantity) &&
  getImportAppliedQuantity(line) === toQuantity(line.quantity);

const isExportLineFullyApplied = (line) => {
  const quantity = toQuantity(line?.quantity);
  const progress = toQuantity(line?.quantityEx);
  if (progress !== quantity) return false;
  return getExportAppliedQuantity(line) === quantity || line?.stockUpdateSkipped === true;
};

async function deleteIpOrder(req, res) {
  try {
    const order = await IpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (
      order.productList.some(
        (item) => toQuantity(item.quantityRe) > 0 || getImportAppliedQuantity(item) > 0
      )
    ) {
      return res.status(400).json({
        message: 'Không thể xóa đơn đã phát sinh nhập kho. Hãy hoàn tác các dòng nhập trước.',
      });
    }

    await order.deleteOne();
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function deleteEpOrder(req, res) {
  try {
    const order = await EpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.productList.some(
      (item) => toQuantity(item.quantityEx) > 0 || getExportAppliedQuantity(item) > 0
    )) {
      return res.status(400).json({
        message: 'Không thể xóa đơn đã phát sinh xuất kho. Hãy hoàn tác các dòng xuất trước.',
      });
    }

    await order.deleteOne();
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function updateIpOrderStatus(req, res) {
  try {
    const { status } = req.body;
    if (typeof status !== 'boolean') {
      return res.status(400).json({ message: 'status phải là boolean.' });
    }
    const order = await IpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (
      status === true &&
      !order.productList.every(
        (item) => item.status === true && isImportLineFullyApplied(item)
      )
    ) {
      return res.status(400).json({
        message: 'Chỉ có thể hoàn tất đơn khi tất cả sản phẩm đã nhập đủ.',
      });
    }

    order.status = status;
    order.completedAt = status ? new Date() : null;
    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function updateEpOrderStatus(req, res) {
  try {
    const { status } = req.body;
    if (typeof status !== 'boolean') {
      return res.status(400).json({ message: 'status phải là boolean' });
    }
    const order = await EpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (
      status === true &&
      !order.productList.every((item) => isExportLineFullyApplied(item))
    ) {
      return res.status(400).json({
        message: 'Chỉ có thể hoàn tất đơn khi tất cả sản phẩm đã xuất đủ.',
      });
    }

    order.status = status;
    order.completedAt = status ? new Date() : null;
    const updatedOrder = await saveExportOrder(order);
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function updateIpOrderLineStatus(req, res) {
  try {
    const { status } = req.body;
    if (typeof status !== 'boolean') {
      return res.status(400).json({ message: 'status phải là boolean.' });
    }
    const order = await IpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const productIndex = Number(req.params.productIndex);
    if (
      !Number.isInteger(productIndex) ||
      productIndex < 0 ||
      productIndex >= order.productList.length
    ) {
      return res.status(400).json({ message: 'Invalid product index' });
    }

    const productItem = order.productList[productIndex];
    if (status === true && !isImportLineFullyApplied(productItem)) {
      return res.status(400).json({
        message: 'Hãy dùng thao tác nhập kho để hoàn tất sản phẩm.',
      });
    }

    productItem.status = status;
    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function updateEpOrderLineStatus(req, res) {
  try {
    const { status } = req.body;
    if (typeof status !== 'boolean') {
      return res.status(400).json({ message: 'status phải là boolean' });
    }
    const order = await EpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const productIndex = Number(req.params.productIndex);
    if (
      !Number.isInteger(productIndex) ||
      productIndex < 0 ||
      productIndex >= order.productList.length
    ) {
      return res.status(400).json({ message: 'Invalid product index' });
    }

    const productItem = order.productList[productIndex];
    if (status === true && !isExportLineFullyApplied(productItem)) {
      return res.status(400).json({
        message: 'Hãy dùng thao tác xuất kho để hoàn tất sản phẩm.',
      });
    }

    productItem.status = status;
    const updatedOrder = await saveExportOrder(order);
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

module.exports = {
  deleteEpOrder,
  deleteIpOrder,
  updateEpOrderLineStatus,
  updateEpOrderStatus,
  updateIpOrderLineStatus,
  updateIpOrderStatus,
};
