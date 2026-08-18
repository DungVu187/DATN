const { IpOrder } = require('../models/iporder');
const { enrichInventoryOrderLines } = require('../services/inventoryOrderDetail');

function mapIpOrderLine(item, product) {
  return {
    ...item,
    name: product?.name || '',
    brand: product?.brand || '',
    image: product?.variant?.[0]?.imgUrl || '',
  };
}

async function getIpOrderDetail(req, res) {
  try {
    const order = await IpOrder.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    res.json({
      ...order,
      productList: await enrichInventoryOrderLines(order.productList, mapIpOrderLine),
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  getIpOrderDetail,
  mapIpOrderLine,
};
