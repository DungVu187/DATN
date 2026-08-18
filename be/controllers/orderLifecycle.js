const { Order } = require('../models/order');
const { StorageHistory } = require('../models/storagehistory');
const { canAccessOrder } = require('../services/orderAccess');
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

module.exports = {
  cancelOrder,
  deleteOrder,
  updateOrder,
};
