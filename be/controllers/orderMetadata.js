const { Order } = require('../models/order');
const { isLockedOrder } = require('../services/orderPolicy');
const { formatAdminOrderWithItems } = require('../services/orderPresentation');

async function updateOrderCustomer(req, res) {
  try {
    const { userName, userPhone } = req.body;
    if (userPhone && !/^\d{10,11}$/.test(String(userPhone))) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    if (isLockedOrder(order)) {
      return res.status(400).json({ success: false, message: 'Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.' });
    }

    order.userName = userName ?? order.userName;
    order.userPhone = userPhone ?? order.userPhone;
    await order.save();

    res.json({ success: true, order });
  } catch (error) {
    console.error('Error updating order customer:', error);
    res.status(500).json({ success: false, message: 'Lỗi khi lưu thông tin khách hàng' });
  }
}

async function updateOrderImages(req, res) {
  try {
    const { images } = req.body;
    if (!Array.isArray(images) || images.some((imageUrl) => typeof imageUrl !== 'string')) {
      return res.status(400).json({ success: false, message: 'Danh sách ảnh không hợp lệ' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    if (isLockedOrder(order)) {
      return res.status(400).json({ success: false, message: 'Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.' });
    }

    order.images = images;
    await order.save();

    res.json({ success: true, order: await formatAdminOrderWithItems(order) });
  } catch (error) {
    console.error('Error updating order images:', error);
    res.status(500).json({ success: false, message: 'Lỗi khi lưu danh sách ảnh' });
  }
}

module.exports = {
  updateOrderCustomer,
  updateOrderImages,
};
