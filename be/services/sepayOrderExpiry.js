const { Order } = require('../models/order');
const { prepareOrderReservationRelease } = require('./orderLifecycle');
const { applyStockAdjustments, rollbackOrThrow } = require('./inventory');

const isPendingSepayOrderExpired = (order, now = new Date()) => (
  order.paymentMethod === 'SEPAY'
  && order.paymentStatus === 'PENDING'
  && order.paymentExpiresAt
  && order.paymentExpiresAt.getTime() <= now.getTime()
  && order.state !== 'Cancelled'
);

async function expireSepayOrderIfNeeded(order, { io, now = new Date() } = {}) {
  if (!isPendingSepayOrderExpired(order, now)) return false;

  const adjustments = await prepareOrderReservationRelease(order);
  const appliedAdjustments = await applyStockAdjustments(adjustments);

  try {
    order.state = 'Cancelled';
    order.paymentStatus = 'EXPIRED';
    await order.save();
  } catch (error) {
    await rollbackOrThrow(appliedAdjustments, error);
  }

  io?.to('admins').emit('order_cancelled', {
    orderId: order._id,
    orderCode: order.orderCode,
    paymentStatus: order.paymentStatus,
  });
  return true;
}

async function expirePendingSepayOrders({ io, now = new Date() } = {}) {
  const orders = await Order.find({
    paymentMethod: 'SEPAY',
    paymentStatus: 'PENDING',
    state: { $ne: 'Cancelled' },
    paymentExpiresAt: { $lte: now },
  });

  const expiredOrderIds = [];
  for (const order of orders) {
    try {
      if (await expireSepayOrderIfNeeded(order, { io, now })) {
        expiredOrderIds.push(order._id.toString());
      }
    } catch (error) {
      console.error(`Không thể tự hủy đơn SePay ${order.orderCode || order._id}:`, error.message);
    }
  }
  return expiredOrderIds;
}

function startSepayOrderExpiryJob({ io, intervalMs = 60 * 1000 } = {}) {
  const run = () => expirePendingSepayOrders({ io })
    .catch((error) => console.error('SePay expiry job failed:', error.message));

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = {
  expirePendingSepayOrders,
  expireSepayOrderIfNeeded,
  startSepayOrderExpiryJob,
};
