const mongoose = require('mongoose');
const { Order } = require('../models/order');
const { User } = require('../models/user');
const { Product } = require('../models/product');

const LOW_STOCK_THRESHOLD = 20;
const DASHBOARD_TIMEZONE = 'Asia/Ho_Chi_Minh';
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfVietnamDay = (date) => {
  const shiftedDate = new Date(new Date(date).getTime() + VIETNAM_OFFSET_MS);
  return new Date(
    Date.UTC(
      shiftedDate.getUTCFullYear(),
      shiftedDate.getUTCMonth(),
      shiftedDate.getUTCDate()
    ) - VIETNAM_OFFSET_MS
  );
};

const makeObjectIdRange = (startDate, endDate) => {
  const startSec = Math.floor(startDate.getTime() / 1000);
  const endSec = Math.floor(endDate.getTime() / 1000);
  const minHex = startSec.toString(16).padStart(8, '0') + '0000000000000000';
  const maxHex = endSec.toString(16).padStart(8, '0') + 'ffffffffffffffff';
  return {
    minId: new mongoose.Types.ObjectId(minHex),
    maxId: new mongoose.Types.ObjectId(maxHex),
  };
};

/**
 * Format Date to YYYY-MM-DD string
 */
const formatDateKey = (date) => {
  const d = new Date(new Date(date).getTime() + VIETNAM_OFFSET_MS);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseVietnamDateKey = (value) => {
  if (typeof value !== 'string') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day) - VIETNAM_OFFSET_MS);
  return formatDateKey(parsedDate) === value ? parsedDate : null;
};

/**
 * Generate all dates in range [startDate, endDate] as 'YYYY-MM-DD'
 */
const generateDateRange = (startDate, endDate) => {
  const dates = [];
  const curr = startOfVietnamDay(startDate);
  const end = startOfVietnamDay(endDate);

  while (curr <= end) {
    dates.push(formatDateKey(curr));
    curr.setTime(curr.getTime() + DAY_MS);
  }
  return dates;
};

/**
 * Calculate percentage change safely without NaN or Infinity
 */
const calculatePercentChange = (current, previous) => {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;

  if (prev === 0) {
    if (curr === 0) return 0;
    return 100;
  }

  const change = ((curr - prev) / prev) * 100;
  return Math.round(change * 10) / 10;
};

/**
 * Parse and normalize date filter bounds
 */
const parseDateFilter = (startStr, endStr) => {
  let endDay = parseVietnamDateKey(endStr) || startOfVietnamDay(new Date());
  let startDay = parseVietnamDateKey(startStr) || new Date(endDay.getTime() - 29 * DAY_MS);

  if (startDay > endDay) {
    [startDay, endDay] = [endDay, startDay];
  }

  const startDate = startDay;
  const endDate = new Date(endDay.getTime() + DAY_MS - 1);
  const durationMs = endDate.getTime() - startDate.getTime();
  const prevEndDate = new Date(startDate.getTime() - 1);
  const prevStartDate = new Date(prevEndDate.getTime() - durationMs);

  return {
    current: { start: startDate, end: endDate },
    previous: { start: prevStartDate, end: prevEndDate },
  };
};

/**
 * Aggregate complete dashboard statistics
 */
const getDashboardData = async ({ startDate: startQuery, endDate: endQuery } = {}) => {
  const { current, previous } = parseDateFilter(startQuery, endQuery);

  // 1. Current & Previous Revenue & Order Count
  // Revenue criteria: state !== 'Cancelled' AND (payment === true OR status === 'Completed')
  const revenueFilter = {
    state: { $ne: 'Cancelled' },
    $or: [{ payment: true }, { status: 'Completed' }],
  };

  // Doanh thu ghi nhận theo ngày hoàn thành; đơn đã thanh toán nhưng chưa hoàn thành
  // tính theo ngày thanh toán; dữ liệu cũ thiếu cả hai mốc thì lùi về ngày tạo đơn
  const revenueDateStages = (range) => [
    { $match: revenueFilter },
    {
      $addFields: {
        revenueDate: { $ifNull: ['$completedAt', { $ifNull: ['$paidAt', '$createdAt'] }] },
      },
    },
    { $match: { revenueDate: { $gte: range.start, $lte: range.end } } },
  ];

  const [
    currentRevenueAgg,
    prevRevenueAgg,
    currentOrderCount,
    prevOrderCount,
    currentNewCustomers,
    prevNewCustomers,
    pendingOrderCount,
    pendingOver2HoursCount,
    revenueByDateAgg,
    ordersByStatusAgg,
    recentOrders,
    lowStockProductsAgg,
  ] = await Promise.all([
    // Current period revenue
    Order.aggregate([
      ...revenueDateStages(current),
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
        },
      },
    ]),

    // Previous period revenue
    Order.aggregate([
      ...revenueDateStages(previous),
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
        },
      },
    ]),

    // Current total orders (not cancelled)
    Order.countDocuments({
      createdAt: { $gte: current.start, $lte: current.end },
      state: { $ne: 'Cancelled' },
    }),

    // Previous total orders (not cancelled)
    Order.countDocuments({
      createdAt: { $gte: previous.start, $lte: previous.end },
      state: { $ne: 'Cancelled' },
    }),

    // Current new customers (role: 'customer' only)
    User.countDocuments({
      role: 'customer',
      $or: [
        { createdAt: { $gte: current.start, $lte: current.end } },
        { _id: { $gte: makeObjectIdRange(current.start, current.end).minId, $lte: makeObjectIdRange(current.start, current.end).maxId } },
      ],
    }),

    // Previous new customers (role: 'customer' only)
    User.countDocuments({
      role: 'customer',
      $or: [
        { createdAt: { $gte: previous.start, $lte: previous.end } },
        { _id: { $gte: makeObjectIdRange(previous.start, previous.end).minId, $lte: makeObjectIdRange(previous.start, previous.end).maxId } },
      ],
    }),

    // Current pending orders needing attention
    Order.countDocuments({
      state: 'Processing',
      status: 'Processing',
    }),

    // Pending orders older than 2 hours
    Order.countDocuments({
      state: 'Processing',
      status: 'Processing',
      createdAt: { $lte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    }),

    // Revenue and order count by date in current period
    Order.aggregate([
      ...revenueDateStages(current),
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$revenueDate',
              timezone: DASHBOARD_TIMEZONE,
            },
          },
          revenue: { $sum: '$total' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Orders grouped by status & cancellation state
    Order.aggregate([
      {
        $group: {
          _id: {
            state: '$state',
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
    ]),

    // 5 most recent orders
    Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('_id orderCode userName userPhone total payment paymentStatus status state createdAt')
      .lean(),

    // 5 lowest stock products across all variants
    Product.aggregate([
      {
        $project: {
          _id: 1,
          name: 1,
          code: 1,
          brand: 1,
          section: 1,
          variant: 1,
          totalStock: {
            $sum: '$variant.quantityForSale',
          },
        },
      },
      { $match: { totalStock: { $lt: LOW_STOCK_THRESHOLD } } },
      { $sort: { totalStock: 1, name: 1 } },
      { $limit: 5 },
    ]),
  ]);

  const currentRevenue = currentRevenueAgg[0]?.totalRevenue || 0;
  const prevRevenue = prevRevenueAgg[0]?.totalRevenue || 0;

  // Build continuous daily revenue array with 0 for days without orders
  const revenueDateMap = new Map();
  revenueByDateAgg.forEach((item) => {
    revenueDateMap.set(item._id, {
      revenue: item.revenue || 0,
      orderCount: item.orderCount || 0,
    });
  });

  const allDates = generateDateRange(current.start, current.end);
  const revenueByDate = allDates.map((dateStr) => {
    const existing = revenueDateMap.get(dateStr);
    return {
      date: dateStr,
      revenue: existing ? existing.revenue : 0,
      orderCount: existing ? existing.orderCount : 0,
    };
  });

  // Calculate order counts per status
  let processingCount = 0;
  let deliveringCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;

  ordersByStatusAgg.forEach((item) => {
    if (item._id.state === 'Cancelled') {
      cancelledCount += item.count;
    } else {
      if (item._id.status === 'Processing') processingCount += item.count;
      else if (item._id.status === 'Delivering') deliveringCount += item.count;
      else if (item._id.status === 'Completed') completedCount += item.count;
    }
  });

  const ordersByStatus = [
    { key: 'Processing', label: 'Chờ xác nhận', count: processingCount, color: '#1473E6' },
    { key: 'Delivering', label: 'Đang giao', count: deliveringCount, color: '#0284C7' },
    { key: 'Completed', label: 'Hoàn thành', count: completedCount, color: '#2E9B45' },
    { key: 'Cancelled', label: 'Đã hủy', count: cancelledCount, color: '#E53935' },
  ];

  // Format low stock products
  const lowStockProducts = lowStockProductsAgg.map((prod) => {
    const currentStock = prod.totalStock ?? 0;
    const safetyStock = LOW_STOCK_THRESHOLD;
    const isOutOfStock = currentStock <= 0;
    const isLow = currentStock < safetyStock;

    return {
      _id: prod._id,
      name: prod.name || '',
      code: prod.code || '',
      brand: prod.brand || '',
      section: prod.section || '',
      currentStock,
      safetyStock,
      status: isOutOfStock ? 'Hết hàng' : (isLow ? 'Sắp hết' : 'Đủ hàng'),
      deficit: Math.max(0, safetyStock - currentStock),
      imgUrl: prod.variant?.[0]?.imgUrl || '',
    };
  });

  return {
    period: {
      startDate: formatDateKey(current.start),
      endDate: formatDateKey(current.end),
    },
    summary: {
      revenue: currentRevenue,
      orderCount: currentOrderCount,
      newCustomerCount: currentNewCustomers,
      pendingOrderCount,
      pendingOver2HoursCount,
    },
    comparison: {
      revenuePercent: calculatePercentChange(currentRevenue, prevRevenue),
      orderPercent: calculatePercentChange(currentOrderCount, prevOrderCount),
      customerPercent: calculatePercentChange(currentNewCustomers, prevNewCustomers),
    },
    revenueByDate,
    ordersByStatus,
    recentOrders,
    lowStockProducts,
  };
};

module.exports = {
  getDashboardData,
  LOW_STOCK_THRESHOLD,
  calculatePercentChange,
  generateDateRange,
  parseDateFilter,
  formatDateKey,
};
