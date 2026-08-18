const { EpOrder } = require('../models/eporder');
const { saveExportOrder } = require('../services/epOrderPricing');

async function updateEpOrderMetadata(req, res) {
  try {
    const order = await EpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (
      Object.prototype.hasOwnProperty.call(req.body, 'productList') ||
      Object.prototype.hasOwnProperty.call(req.body, 'status')
    ) {
      return res.status(400).json({
        message: 'Hãy dùng API sản phẩm hoặc trạng thái chuyên biệt để cập nhật đơn xuất',
      });
    }

    const { orderName, note, images } = req.body;
    if (orderName !== undefined) order.orderName = orderName;
    if (note !== undefined) order.note = typeof note === 'string' ? note : '';
    if (images !== undefined) order.images = images;

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

async function updateEpOrderName(req, res) {
  try {
    const { orderName, note } = req.body;
    const order = await EpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (orderName !== undefined) order.orderName = orderName || '';
    if (note !== undefined) order.note = typeof note === 'string' ? note : '';
    const updatedOrder = await saveExportOrder(order);
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

module.exports = {
  updateEpOrderMetadata,
  updateEpOrderName,
};
