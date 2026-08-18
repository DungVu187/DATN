const { Counter, Order } = require('../models/order');
const { User } = require('../models/user');
const {
  createReservationAdjustments,
  prepareOrderItemsForCreation,
} = require('../services/orderItemWorkflows');
const { applyStockAdjustments, rollbackOrThrow } = require('../services/inventory');
const { sendNewOrderNotification } = require('../mailer');
const {
  getRouteErrorMessage,
  getRouteErrorStatus,
} = require('../utils/orderRouteErrors');

async function createAdminDraftOrder(req, res) {
  try {
    const counter = await Counter.findOneAndUpdate(
      { id: 'orderCode' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const orderCode = 'NOVA-' + String(counter.seq).padStart(2, '0');

    const savedOrder = await new Order({
      orderCode,
      userPhone: '',
      userName: '',
      cartItems: [],
      total: 0,
      status: 'Processing',
    }).save();

    res.status(201).json({ success: true, order: savedOrder });
  } catch (error) {
    console.error('Error creating admin draft order:', error);
    res.status(500).json({ success: false, message: 'Lỗi khi tạo đơn nháp' });
  }
}

async function createAdminOrder(req, res) {
  const { userPhone, userName, items } = req.body;
  const io = req.app.get('io');

  if (!userPhone || !/^\d{10,11}$/.test(String(userPhone))) {
    return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Danh sách sản phẩm không hợp lệ' });
  }

  try {
    const preparedOrder = await prepareOrderItemsForCreation(items);
    if (preparedOrder.error) {
      return res.status(preparedOrder.error.status).json({
        success: false,
        message: preparedOrder.error.message,
      });
    }

    const appliedAdjustments = await applyStockAdjustments(
      createReservationAdjustments(preparedOrder.preparedItems)
    );

    let savedOrder;
    try {
      const counter = await Counter.findOneAndUpdate(
        { id: 'orderCode' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      const orderCode = 'NOVA-' + String(counter.seq).padStart(2, '0');

      savedOrder = await new Order({
        orderCode,
        userPhone: String(userPhone),
        userName,
        cartItems: preparedOrder.cartItems,
        total: preparedOrder.total,
      }).save();
    } catch (error) {
      await rollbackOrThrow(appliedAdjustments, error);
    }

    io.to('admins').emit('order_created', {
      orderId: savedOrder._id,
      orderCode: savedOrder.orderCode,
      userPhone,
      total: preparedOrder.total,
      createdAt: savedOrder.createdAt,
    });

    res.status(201).json({
      success: true,
      message: 'Tạo đơn hàng thành công',
      order: savedOrder,
    });
  } catch (error) {
    console.error('Error creating admin order:', error);
    res.status(getRouteErrorStatus(error)).json({
      success: false,
      message: getRouteErrorMessage(error, 'Lỗi khi tạo đơn hàng'),
    });
  }
}

async function createCustomerOrder(req, res) {
  const { cartItems } = req.body;
  const io = req.app.get('io');

  try {
    const orderingUser = await User.findById(req.user.userId);
    if (!orderingUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    }

    const preparedOrder = await prepareOrderItemsForCreation(cartItems, {
      enforcePublicProducts: orderingUser.role === 'customer',
    });
    if (preparedOrder.error) {
      return res.status(preparedOrder.error.status).json({ message: preparedOrder.error.message });
    }

    const userPhone = orderingUser.phone;
    const userName = orderingUser.name;
    const appliedAdjustments = await applyStockAdjustments(
      createReservationAdjustments(preparedOrder.preparedItems)
    );

    let savedOrder;
    try {
      const counter = await Counter.findOneAndUpdate(
        { id: 'orderCode' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      const orderCode = 'NOVA-' + String(counter.seq).padStart(2, '0');

      savedOrder = await new Order({
        orderCode,
        userPhone,
        userName,
        cartItems: preparedOrder.cartItems,
        total: preparedOrder.total,
      }).save();
    } catch (error) {
      await rollbackOrThrow(appliedAdjustments, error);
    }

    try {
      if (preparedOrder.cartItems.length > 0) {
        orderingUser.cart = orderingUser.cart.filter((cartItem) => {
          return !preparedOrder.cartItems.some(
            (orderedItem) =>
              orderedItem.productId.toString() === cartItem.productId.toString() &&
              orderedItem.variantIndex === cartItem.variantIndex
          );
        });

        await orderingUser.save();
      }
    } catch (postSaveError) {
      console.error('Order created but cart cleanup failed:', postSaveError);
    }

    sendNewOrderNotification({
      orderId: savedOrder.orderCode || savedOrder._id,
      userPhone,
      userName,
      total: preparedOrder.total,
      createdAt: savedOrder.createdAt,
    }).catch((error) => console.error('Lỗi gửi email thông báo đơn hàng:', error.message));

    io.to('admins').emit('order_created', {
      orderId: savedOrder._id,
      orderCode: savedOrder.orderCode,
      userPhone,
      total: preparedOrder.total,
      createdAt: savedOrder.createdAt,
    });

    res.status(201).json({
      message: 'Đặt hàng thành công',
      order: savedOrder,
    });
  } catch (error) {
    console.error(error);
    res.status(getRouteErrorStatus(error)).json({
      message: getRouteErrorMessage(error, 'Lỗi khi tạo đơn hàng'),
    });
  }
}

module.exports = {
  createAdminDraftOrder,
  createAdminOrder,
  createCustomerOrder,
};
