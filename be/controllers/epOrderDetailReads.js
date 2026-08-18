const { EpOrder } = require('../models/eporder');
const { getExistingPricingBase } = require('../services/epOrderPricing');
const { enrichInventoryOrderLines } = require('../services/inventoryOrderDetail');

function mapEpOrderLine(item, product) {
  return {
    ...item,
    ...getExistingPricingBase(item, product?.variant?.[0]),
    name: product?.name || '',
    brand: product?.brand || '',
    image: product?.variant?.[0]?.imgUrl || '',
  };
}

async function getEpOrderDetail(req, res) {
  try {
    const order = await EpOrder.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    res.json({
      ...order,
      productList: await enrichInventoryOrderLines(order.productList, mapEpOrderLine),
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  getEpOrderDetail,
  mapEpOrderLine,
};
