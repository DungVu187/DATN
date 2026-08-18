const { Order } = require('../models/order');
const {
  buildOrderStockAdjustments,
  computeOrderTotal,
  validateOrderItemInput,
} = require('../services/orderItemWorkflows');
const { applyStockAdjustments, rollbackOrThrow } = require('../services/inventory');
const { isLockedOrder } = require('../services/orderPolicy');
const { formatAdminOrderWithItems } = require('../services/orderPresentation');
const { prepareOrderReorderItems } = require('../services/orderReorder');
const {
  getRouteErrorMessage,
  getRouteErrorStatus,
} = require('../utils/orderRouteErrors');

async function addOrderItem(req, res) {
  try {
    const parsed = validateOrderItemInput(req.body);
    if (parsed.message) {
      return res.status(400).json({ success: false, message: parsed.message });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    if (isLockedOrder(order)) {
      return res.status(400).json({
        success: false,
        message: 'Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.',
      });
    }

    const { productId, variantIndex, quantity } = parsed.value;
    const { adjustments } = await buildOrderStockAdjustments(
      [{ productId, variantIndex, quantity }],
      (item) => ({ quantityForSaleDelta: -item.quantity })
    );
    const appliedAdjustments = await applyStockAdjustments(adjustments);

    try {
      order.cartItems.push({ productId, variantIndex, quantity });
      order.total = await computeOrderTotal(order.cartItems);
      await order.save();
    } catch (error) {
      await rollbackOrThrow(appliedAdjustments, error);
    }

    res.json({ success: true, order: await formatAdminOrderWithItems(order) });
  } catch (error) {
    console.error('Error adding order item:', error);
    res.status(getRouteErrorStatus(error)).json({
      success: false,
      message: getRouteErrorMessage(error, 'Lỗi khi thêm sản phẩm vào đơn hàng'),
    });
  }
}

async function updateOrderItemQuantity(req, res) {
  try {
    const newQty = Number(req.body.quantity);
    if (!Number.isInteger(newQty) || newQty <= 0) {
      return res.status(400).json({ success: false, message: 'Số lượng không hợp lệ' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    if (isLockedOrder(order)) {
      return res.status(400).json({
        success: false,
        message: 'Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.',
      });
    }

    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= order.cartItems.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy dòng sản phẩm' });
    }

    const line = order.cartItems[index];
    const delta = newQty - line.quantity;
    let appliedAdjustments = [];
    if (delta !== 0) {
      const { adjustments } = await buildOrderStockAdjustments(
        [line],
        () => ({ quantityForSaleDelta: -delta })
      );
      appliedAdjustments = await applyStockAdjustments(adjustments);
    }

    try {
      line.quantity = newQty;
      order.markModified('cartItems');
      order.total = await computeOrderTotal(order.cartItems);
      await order.save();
    } catch (error) {
      await rollbackOrThrow(appliedAdjustments, error);
    }

    res.json({ success: true, order: await formatAdminOrderWithItems(order) });
  } catch (error) {
    console.error('Error updating order item:', error);
    res.status(getRouteErrorStatus(error)).json({
      success: false,
      message: getRouteErrorMessage(error, 'Lỗi khi cập nhật sản phẩm trong đơn hàng'),
    });
  }
}

async function deleteOrderItem(req, res) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    if (isLockedOrder(order)) {
      return res.status(400).json({
        success: false,
        message: 'Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.',
      });
    }

    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= order.cartItems.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy dòng sản phẩm' });
    }

    const [line] = order.cartItems.splice(index, 1);
    const { adjustments } = await buildOrderStockAdjustments(
      [line],
      (item) => ({ quantityForSaleDelta: item.quantity }),
      { skipMissing: true }
    );
    const appliedAdjustments = await applyStockAdjustments(adjustments);

    try {
      order.markModified('cartItems');
      order.total = await computeOrderTotal(order.cartItems);
      await order.save();
    } catch (error) {
      await rollbackOrThrow(appliedAdjustments, error);
    }

    res.json({ success: true, order: await formatAdminOrderWithItems(order) });
  } catch (error) {
    console.error('Error deleting order item:', error);
    res.status(getRouteErrorStatus(error)).json({
      success: false,
      message: getRouteErrorMessage(error, 'Lỗi khi xóa sản phẩm khỏi đơn hàng'),
    });
  }
}

async function reorderOrderItems(req, res) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    if (isLockedOrder(order)) {
      return res.status(400).json({
        success: false,
        message: 'Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.',
      });
    }

    const prepared = prepareOrderReorderItems(order.cartItems, req.body.cartItems);
    if (prepared.error) {
      return res.status(prepared.error.status).json({
        success: false,
        message: prepared.error.message,
      });
    }

    order.cartItems = prepared.cartItems;
    order.total = await computeOrderTotal(order.cartItems);
    await order.save();

    res.json({ success: true, order: await formatAdminOrderWithItems(order) });
  } catch (error) {
    console.error('Error reordering order items:', error);
    res.status(getRouteErrorStatus(error)).json({
      success: false,
      message: getRouteErrorMessage(error, 'Lỗi khi lưu thứ tự sản phẩm'),
    });
  }
}

module.exports = {
  addOrderItem,
  deleteOrderItem,
  reorderOrderItems,
  updateOrderItemQuantity,
};
