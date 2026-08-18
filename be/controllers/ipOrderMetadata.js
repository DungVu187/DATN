const { IpOrder } = require('../models/iporder');

function hasOwn(object, field) {
  return Object.prototype.hasOwnProperty.call(object || {}, field);
}

async function updateIpOrderMetadata(req, res) {
  try {
    if (hasOwn(req.body, 'productList') || hasOwn(req.body, 'status')) {
      return res.status(400).json({
        message: 'Hãy dùng API chuyên dụng để thay đổi sản phẩm hoặc trạng thái đơn nhập.',
      });
    }

    const order = await IpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

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

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function updateIpOrderName(req, res) {
  try {
    const { orderName, note } = req.body;
    const order = await IpOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (orderName !== undefined) order.orderName = orderName || '';
    if (note !== undefined) order.note = typeof note === 'string' ? note : '';
    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

module.exports = {
  updateIpOrderMetadata,
  updateIpOrderName,
};
