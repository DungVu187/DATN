const express = require('express');
const { authenticateAdmin } = require('../middlewares/auth');
const { getDashboardStats } = require('../controllers/dashboardController');

const router = express.Router();

// GET /dashboard hoặc GET /dashboard/stats
router.get('/', [authenticateAdmin], getDashboardStats);
router.get('/stats', [authenticateAdmin], getDashboardStats);

module.exports = {
  router,
};
