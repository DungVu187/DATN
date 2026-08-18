const mongoose = require('mongoose');

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildAdminOrderListOptions(query = {}) {
  const {
    page = 1,
    limit = 10,
    status,
    payment,
    state,
    phone,
    name,
    startDate,
    endDate,
    id,
    byCompletedDate,
  } = query;
  const filter = {};

  if (id) {
    if (mongoose.Types.ObjectId.isValid(id)) {
      filter._id = id;
    } else {
      filter.orderCode = new RegExp(escapeRegex(id), 'i');
    }
  }

  if (byCompletedDate === 'true') {
    filter.status = 'Completed';
  } else if (status) {
    filter.status = status;
  }

  if (payment) filter.payment = payment === 'true';
  if (state) filter.state = state;
  if (phone) filter.userPhone = new RegExp(escapeRegex(phone), 'i');
  if (name) filter.userName = new RegExp(escapeRegex(name), 'i');

  if (startDate || endDate) {
    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setUTCHours(0 - 7, 0, 0, 0);
      dateFilter.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23 - 7, 59, 59, 999);
      dateFilter.$lte = end;
    }

    if (byCompletedDate === 'true') {
      filter.$or = [
        { completedAt: dateFilter },
        { completedAt: { $exists: false }, createdAt: dateFilter },
        { completedAt: null, createdAt: dateFilter },
      ];
    } else {
      filter.createdAt = dateFilter;
    }
  }

  return {
    filter,
    page,
    limit,
    sortField: byCompletedDate === 'true' ? 'completedAt' : 'createdAt',
  };
}

function buildUserOrderFilter(userPhone, state) {
  const filter = { userPhone };

  if (state) {
    if (state === 'Cancelled') {
      filter.state = 'Cancelled';
    } else {
      filter.state = 'Processing';
      filter.status = state;
    }
  }

  return filter;
}

module.exports = {
  buildAdminOrderListOptions,
  buildUserOrderFilter,
  escapeRegex,
};
