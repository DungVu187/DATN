const { Order } = require('../models/order');
const { User } = require('../models/user');
const { canAccessOrder } = require('../services/orderAccess');
const { sendNewOrderNotification, sendPaymentConfirmationEmail } = require('../mailer');
const { expireSepayOrderIfNeeded } = require('../services/sepayOrderExpiry');
const {
  buildSepayPaymentDetails,
  extractPaymentReference,
  getSepayConfig,
  verifySepayWebhook,
} = require('../services/sepay');

const serializePaymentStatus = (order) => ({
  orderId: order._id,
  orderCode: order.orderCode,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  paymentAmount: order.paymentAmount || order.total,
  paymentReceivedAmount: order.paymentReceivedAmount || 0,
  paymentReference: order.paymentReference,
  paymentExpiresAt: order.paymentExpiresAt,
  paidAt: order.paidAt,
  payment: order.paymentMethod === 'SEPAY' && ['PENDING', 'UNDERPAID'].includes(order.paymentStatus)
    ? buildSepayPaymentDetails(order)
    : null,
});

async function getOrderPaymentStatus(req, res) {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
    if (!canAccessOrder(order, req.user)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem giao dịch này.' });
    }
    await expireSepayOrderIfNeeded(order, { io: req.app.get('io') });
    return res.json(serializePaymentStatus(order));
  } catch (error) {
    console.error('Get payment status error:', error);
    return res.status(500).json({ message: 'Không thể tải trạng thái thanh toán.' });
  }
}

async function receiveSepayWebhook(req, res) {
  if (!verifySepayWebhook(req.get('authorization'))) {
    return res.status(401).json({ success: false, message: 'Webhook không hợp lệ.' });
  }

  const payload = req.body || {};
  const transactionId = String(payload.id || payload.referenceCode || '').trim();
  const reference = extractPaymentReference(payload);
  const transferAmount = Number(payload.transferAmount);
  const transferType = String(payload.transferType || '').toLowerCase();
  const configuredAccount = getSepayConfig().accountNumber;
  const receivedAccount = String(payload.accountNumber || '').replace(/\s+/g, '');

  if (!transactionId || !reference || transferType !== 'in' || !Number.isFinite(transferAmount)) {
    return res.status(200).json({ success: true, ignored: true });
  }
  if (configuredAccount && receivedAccount && configuredAccount !== receivedAccount) {
    return res.status(200).json({ success: true, ignored: true });
  }

  try {
    const duplicate = await Order.exists({ paymentTransactionId: transactionId });
    if (duplicate) return res.status(200).json({ success: true, duplicate: true });

    const order = await Order.findOne({ paymentMethod: 'SEPAY', paymentReference: reference });
    if (!order) return res.status(200).json({ success: true, unmatched: true });
    if (await expireSepayOrderIfNeeded(order, { io: req.app.get('io') })) {
      return res.status(200).json({ success: true, expired: true });
    }
    if (order.state === 'Cancelled' || ['PAID', 'CANCELLED', 'EXPIRED'].includes(order.paymentStatus)) {
      return res.status(200).json({ success: true, ignored: true });
    }

    order.paymentTransactionId = transactionId;
    order.paymentReceivedAmount = transferAmount;
    if (transferAmount < Number(order.paymentAmount || order.total)) {
      order.paymentStatus = 'UNDERPAID';
      await order.save();
      return res.status(200).json({ success: true, underpaid: true });
    }

    order.paymentStatus = 'PAID';
    order.payment = true;
    order.paidAt = new Date();
    await order.save();

    const customerEmail = order.customerEmail || (await User.findOne({ phone: order.userPhone })
      .select('email')
      .lean())?.email;
    const notificationDetails = {
      orderId: order.orderCode || order._id,
      userPhone: order.userPhone,
      userName: order.userName,
      total: order.paymentAmount || order.total,
      createdAt: order.createdAt,
    };

    sendNewOrderNotification(notificationDetails)
      .catch((error) => console.error('Lỗi gửi email admin khi SePay thanh toán:', error.message));
    sendPaymentConfirmationEmail({ ...notificationDetails, email: customerEmail })
      .catch((error) => console.error('Lỗi gửi email xác nhận thanh toán:', error.message));

    const io = req.app.get('io');
    io?.to('admins').emit('order_created', {
      orderId: order._id,
      orderCode: order.orderCode,
      userPhone: order.userPhone,
      total: order.total,
      createdAt: order.createdAt,
      paymentMethod: order.paymentMethod,
    });
    io?.to('admins').emit('order_updated', {
      orderId: order._id,
      updatedField: 'payment',
      newValue: true,
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error?.code === 11000) return res.status(200).json({ success: true, duplicate: true });
    console.error('SePay webhook error:', error);
    return res.status(500).json({ success: false });
  }
}

module.exports = { getOrderPaymentStatus, receiveSepayWebhook, serializePaymentStatus };
