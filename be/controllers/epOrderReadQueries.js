const { EpOrder } = require('../models/eporder');
const {
  listInventoryOrderProducts,
  listInventoryOrders,
} = require('../services/inventoryOrderReadQueries');

async function listEpOrders(req, res) {
  try {
    res.json(await listInventoryOrders(EpOrder, req.query));
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function listEpOrderProducts(req, res) {
  try {
    res.json(await listInventoryOrderProducts(EpOrder, req.query));
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

module.exports = {
  listEpOrderProducts,
  listEpOrders,
};
