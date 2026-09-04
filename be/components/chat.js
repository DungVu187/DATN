const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateUser } = require('../middlewares/auth');
const { clearChat, recordCustomerBehavior, sendChatMessage } = require('../controllers/chat');

const router = express.Router();

const chatLimiter = rateLimit({
    windowMs: Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
    limit: Number(process.env.CHAT_RATE_LIMIT_MAX) || 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: 0,
        message: 'Bạn gửi quá nhiều yêu cầu chat trong thời gian ngắn. Vui lòng thử lại sau.',
    },
});

const eventLimiter = rateLimit({
    windowMs: Number(process.env.CHAT_EVENT_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
    limit: Number(process.env.CHAT_EVENT_RATE_LIMIT_MAX) || 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: 0,
        message: 'Bạn gửi quá nhiều sự kiện trong thời gian ngắn. Vui lòng thử lại sau.',
    },
});

const authenticateOptionalUser = (req, res, next) => {
    if (!req.cookies?.authToken) return next();
    return authenticateUser(req, res, next);
};

router.post('/send', chatLimiter, authenticateOptionalUser, sendChatMessage);
router.delete('/clear', chatLimiter, authenticateOptionalUser, clearChat);
router.post('/events', eventLimiter, authenticateOptionalUser, recordCustomerBehavior);

module.exports = {
    router,
};
