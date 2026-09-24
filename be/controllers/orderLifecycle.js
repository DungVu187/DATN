const { Order } = require('../models/order');
const { StorageHistory } = require('../models/storagehistory');
const { canAccessOrder, isPrivilegedOrderUser } = require('../services/orderAccess');
const { isPaidUnrefunded, needsRefund } = require('../services/orderPolicy');

const SUPPORT_HOTLINE = '09.0151.3825';
const REFUND_NOTE_MAX_LENGTH = 500;
const {
  prepareOrderReservationRelease,
  prepareOrderStatusTransition,
} = require('../services/orderLifecycle');
const {
  InventoryError,
  applyStockAdjustments,
  rollbackOrThrow,
} = require('../services/inventory');
const {
  getRouteErrorMessage,
  getRouteErrorStatus,
} = require('../utils/orderRouteErrors');

async function updateOrder(req, res) {
  const { _id } = req.params;
  const { field, value } = req.body;
  const io = req.app.get('io');

  if (!['status', 'payment'].includes(field)) {
    return res.status(400).json({ success: false, message: 'Invalid field' });
  }

  try {
    const order = await Order.findById(_id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Đơn đã hủy không đổi thanh toán tay nữa; tiền đã nhận thì đi qua bước xác nhận hoàn tiền
    if (field === 'payment' && order.state === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng đã hủy, không thể cập nhật thanh toán.',
      });
    }

    let appliedAdjustments = [];
    let stockHistoryEntries = [];

    if (field === 'status') {
      const transition = await prepareOrderStatusTransition(order, value);
      if (transition.error) {
        return res.status(transition.error.status).json({
          success: false,
          message: transition.error.message,
        });
      }

      order.completedAt = transition.completedAt;
      if (transition.adjustments.length > 0) {
        appliedAdjustments = await applyStockAdjustments(transition.adjustments);
      }
      stockHistoryEntries = transition.stockHistoryEntries;
    }

    order[field] = value;
    try {
      await order.save();
    } catch (error) {
      await rollbackOrThrow(appliedAdjustments, error);
    }

    for (const historyEntry of stockHistoryEntries) {
      try {
        await new StorageHistory({
          ...historyEntry,
          userName: req.user?.name || 'Hệ thống',
          orderId: order.orderCode,
          orderName: order.orderCode,
        }).save();
      } catch (logError) {
        console.error('StorageHistory error (order status stock adjustment):', logError.message);
      }
    }

    io.to('admins').emit('order_updated', {
      orderId: order._id,
      updatedField: field,
      newValue: value,
    });

    res.json({ success: true, message: 'Order updated successfully', order });
  } catch (error) {
    console.error(error);
    res.status(getRouteErrorStatus(error)).json({
      success: false,
      message: getRouteErrorMessage(error, 'Server error'),
    });
  }
}

async function deleteOrder(req, res) {
  const { id } = req.params;
  const io = req.app.get('io');

  try {
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!canAccessOrder(order, req.user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa đơn hàng này.' });
    }

    if (order.status === 'Completed') {
      return res.status(400).json({ message: 'Không thể xóa đơn hàng đã hoàn thành.' });
    }

    // Xóa đơn đã nhận tiền sẽ mất dấu khoản phải hoàn cho khách
    if (isPaidUnrefunded(order)) {
      return res.status(400).json({ message: 'Không thể xóa đơn hàng đã thanh toán nhưng chưa hoàn tiền.' });
    }

    let appliedAdjustments = [];
    if (order.state !== 'Cancelled') {
      const adjustments = await prepareOrderReservationRelease(order);
      appliedAdjustments = await applyStockAdjustments(adjustments);
    }

    try {
      const deleteResult = await Order.deleteOne({
        _id: order._id,
        __v: order.__v,
        status: { $ne: 'Completed' },
      });
      if (deleteResult.deletedCount !== 1) {
        throw new InventoryError(
          'Đơn hàng vừa được thay đổi bởi thao tác khác, vui lòng tải lại.',
          { statusCode: 409, code: 'ORDER_CONFLICT' }
        );
      }
    } catch (error) {
      await rollbackOrThrow(appliedAdjustments, error);
    }

    io.to('admins').emit('order_deleted', { orderId: id });

    res.status(200).json({ message: 'Order deleted and quantities restored if necessary.' });
  } catch (error) {
    console.error(error);
    res.status(getRouteErrorStatus(error)).json({
      message: getRouteErrorMessage(error, 'Server error'),
    });
  }
}

async function cancelOrder(req, res) {
  const { id } = req.params;
  const io = req.app.get('io');

  try {
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!canAccessOrder(order, req.user)) {
      return res.status(403).json({ message: 'Bạn không có quyền hủy đơn hàng này.' });
    }

    if (order.status === 'Completed') {
      return res.status(400).json({ message: 'Không thể hủy đơn hàng đã hoàn thành.' });
    }

    if (order.state === 'Cancelled') {
      return res.status(400).json({ message: 'Order is already cancelled.' });
    }

    // Khách không tự hủy đơn đã thanh toán: cần nhân viên hủy và chuyển khoản hoàn tiền
    if (order.payment === true && !isPrivilegedOrderUser(req.user)) {
      return res.status(400).json({
        message: 'Đơn hàng đã thanh toán. Vui lòng liên hệ hotline ' + SUPPORT_HOTLINE
          + ' để được hủy đơn và hoàn tiền.',
      });
    }

    const adjustments = await prepareOrderReservationRelease(order);
    const appliedAdjustments = await applyStockAdjustments(adjustments);

    order.state = 'Cancelled';
    try {
      await order.save();
    } catch (error) {
      await rollbackOrThrow(appliedAdjustments, error);
    }

    io.to('admins').emit('order_cancelled', {
      orderId: order._id,
      userPhone: order.userPhone,
    });

    res.status(200).json({ message: 'Order cancelled successfully.', order });
  } catch (error) {
    console.error(error);
    res.status(getRouteErrorStatus(error)).json({
      message: getRouteErrorMessage(error, 'Server error'),
    });
  }
}

// Nhân viên đã chuyển khoản trả khách -> ghi nhận hoàn tiền kèm mã giao dịch/ghi chú
async function confirmOrderRefund(req, res) {
  const { id } = req.params;
  const io = req.app.get('io');
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

  if (!note) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập mã giao dịch hoặc ghi chú hoàn tiền.' });
  }
  if (note.length > REFUND_NOTE_MAX_LENGTH) {
    return res.status(400).json({
      success: false,
      message: 'Ghi chú hoàn tiền tối đa ' + REFUND_NOTE_MAX_LENGTH + ' ký tự.',
    });
  }

  try {
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!needsRefund(order)) {
      return res.status(400).json({ success: false, message: 'Đơn hàng không ở trạng thái chờ hoàn tiền.' });
    }

    order.paymentStatus = 'REFUNDED';
    order.refundedAt = new Date();
    order.refundNote = note;
    order.refundedBy = req.user?._id || null;
    await order.save();

    io.to('admins').emit('order_updated', {
      orderId: order._id,
      updatedField: 'paymentStatus',
      newValue: 'REFUNDED',
    });

    res.json({ success: true, message: 'Đã xác nhận hoàn tiền.', order });
  } catch (error) {
    console.error(error);
    res.status(getRouteErrorStatus(error)).json({
      success: false,
      message: getRouteErrorMessage(error, 'Server error'),
    });
  }
}

module.exports = {
  cancelOrder,
  confirmOrderRefund,
  deleteOrder,
  updateOrder,
};
