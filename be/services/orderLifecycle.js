const { buildOrderStockAdjustments } = require('./orderItemWorkflows');

const allowedStatuses = new Set(['Processing', 'Delivering', 'Completed']);

function getStatusValidationError(order, value) {
  if (!allowedStatuses.has(value)) {
    return { status: 400, message: 'Invalid status value' };
  }

  if (value === 'Completed' && order.state === 'Cancelled') {
    return { status: 400, message: 'Không thể hoàn thành đơn hàng đã bị hủy.' };
  }

  if (value === 'Completed' && !/^\d{10,11}$/.test(String(order.userPhone || ''))) {
    return {
      status: 400,
      message: 'Vui lòng nhập số điện thoại hợp lệ trước khi hoàn thành đơn.',
    };
  }

  return null;
}

async function prepareOrderStatusTransition(order, value) {
  const error = getStatusValidationError(order, value);
  if (error) return { error };

  const transition = {
    adjustments: [],
    completedAt: value === 'Completed' ? new Date() : null,
    stockHistoryEntries: [],
  };

  if (order.status !== value && value === 'Completed') {
    const { adjustments, entries } = await buildOrderStockAdjustments(
      order.cartItems,
      (item) => ({
        quantityInStorageDelta: -item.quantity,
        purchaseCountDelta: item.quantity,
      })
    );
    transition.adjustments = adjustments;
    transition.stockHistoryEntries = entries.map(({ item, product }) => ({
      productId: item.productId,
      productName: product.name,
      quantity: -item.quantity,
      note: 'Đơn hàng bán online',
      source: 'online_sale',
    }));
  } else if (order.status === 'Completed' && value !== 'Completed') {
    const { adjustments, entries } = await buildOrderStockAdjustments(
      order.cartItems,
      (item) => ({
        quantityInStorageDelta: item.quantity,
        purchaseCountDelta: -item.quantity,
      })
    );
    transition.adjustments = adjustments;
    transition.stockHistoryEntries = entries.map(({ item, product }) => ({
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      note: 'Hoàn tác đơn bán online',
      source: 'online_sale_revert',
    }));
  }

  return transition;
}

async function prepareOrderReservationRelease(order) {
  const { adjustments } = await buildOrderStockAdjustments(
    order.cartItems,
    (item) => ({ quantityForSaleDelta: item.quantity }),
    { skipMissing: true }
  );
  return adjustments;
}

module.exports = {
  prepareOrderReservationRelease,
  prepareOrderStatusTransition,
};
