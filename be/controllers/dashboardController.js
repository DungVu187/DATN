const { getDashboardData } = require('../services/dashboardService');

const getDashboardStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const data = await getDashboardData({ startDate, endDate });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể lấy dữ liệu tổng quan dashboard',
      error: error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
};
