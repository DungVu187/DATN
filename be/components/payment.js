const express = require('express');
const { authenticateUser } = require('../middlewares/auth');
const { getOrderPaymentStatus, receiveSepayWebhook } = require('../controllers/payments');

const requireCustomer = (req, res, next) => {
  if (req.user?.role !== 'customer') {
    return res.status(403).json({ message: 'Customer account required.' });
  }
  return next();
};

const router = express.Router();

router.get('/orders/:orderId/status', [authenticateUser, requireCustomer], getOrderPaymentStatus);
router.post('/sepay/webhook', receiveSepayWebhook);

module.exports = { router };
