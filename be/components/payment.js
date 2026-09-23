const express = require('express');
const { authenticateUser } = require('../middlewares/auth');
const { getOrderPaymentStatus, receiveSepayWebhook } = require('../controllers/payments');

const router = express.Router();

// Mọi tài khoản đã đăng nhập (kể cả admin/staff tự đặt đơn) đều xem được QR;
// quyền truy cập từng đơn do canAccessOrder trong controller kiểm soát.
router.get('/orders/:orderId/status', authenticateUser, getOrderPaymentStatus);
router.post('/sepay/webhook', receiveSepayWebhook);

module.exports = { router };
