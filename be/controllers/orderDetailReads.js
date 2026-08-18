const { Order } = require('../models/order');
const { canAccessOrder } = require('../services/orderAccess');
const {
  formatAdminOrderDetail,
  formatCustomerOrderDetail,
} = require('../services/orderPresentation');

async function getAdminOrderDetail(req, res) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    res.json({ success: true, order: await formatAdminOrderDetail(order) });
  } catch (error) {
    console.error('Error fetching admin order detail:', error);
    res.status(500).json({ success: false, message: 'Lỗi khi lấy chi tiết đơn hàng' });
  }
}

async function getOrderDetail(req, res) {
  try {
    const order = await Order.findById(req.params._id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!canAccessOrder(order, req.user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem đơn hàng này.' });
    }

    res.json(await formatCustomerOrderDetail(order));
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

module.exports = {
  getAdminOrderDetail,
  getOrderDetail,
};
