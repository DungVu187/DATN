const { Order } = require('../models/order');
const { User } = require('../models/user');
const {
  buildAdminOrderListOptions,
  buildUserOrderFilter,
} = require('../services/orderReadFilters');

async function listOrders(req, res) {
  try {
    const {
      filter,
      page,
      limit,
      sortField,
    } = buildAdminOrderListOptions(req.query);

    const orders = await Order.find(filter)
      .sort({ [sortField]: -1 })
      .skip((page - 1) * parseInt(limit, 10))
      .limit(parseInt(limit, 10));
    const total = await Order.countDocuments(filter);

    res.json({
      orders,
      total,
      currentPage: parseInt(page, 10),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getCustomerSuggestions(req, res) {
  try {
    const customers = await User.find({ role: 'customer' }).select('name phone');
    res.json({
      success: true,
      customers: customers.map((customer) => ({
        name: customer.name,
        phone: customer.phone,
      })),
    });
  } catch (error) {
    console.error('Error fetching customer suggestions:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function listUserOrders(req, res) {
  const userPhone = req.user.phone;
  const { state } = req.query;

  if (typeof userPhone !== 'string' || !userPhone.trim()) {
    return res.status(400).json({ message: 'Số điện thoại người dùng không được cung cấp' });
  }

  try {
    const orders = await Order.find(buildUserOrderFilter(userPhone, state))
      .sort({ createdAt: -1 });

    if (orders.length === 0) {
      return res.status(404).json({
        message: 'Không tìm thấy đơn hàng cho số điện thoại này',
      });
    }

    res.status(200).json({
      message: 'Danh sách đơn hàng',
      orders,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi tìm kiếm đơn hàng' });
  }
}

async function getProcessingOrderCount(req, res) {
  try {
    const count = await Order.countDocuments({
      state: 'Processing',
      status: 'Processing',
    });

    res.json({ success: true, count });
  } catch (error) {
    console.error('Error counting processing orders:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = {
  getCustomerSuggestions,
  getProcessingOrderCount,
  listOrders,
  listUserOrders,
};
