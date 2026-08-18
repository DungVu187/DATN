const { IpOrder } = require('../models/iporder');
const {
  listInventoryOrderProducts,
  listInventoryOrders,
} = require('../services/inventoryOrderReadQueries');

async function listIpOrders(req, res) {
  try {
    res.json(await listInventoryOrders(IpOrder, req.query));
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function listIpOrderProducts(req, res) {
  try {
    res.json(await listInventoryOrderProducts(IpOrder, req.query));
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

module.exports = {
  listIpOrderProducts,
  listIpOrders,
};
