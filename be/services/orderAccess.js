const privilegedOrderRoles = ['admin', 'superadmin', 'staff'];

function canAccessOrder(order, user) {
  return order.userPhone === user?.phone || privilegedOrderRoles.includes(user?.role);
}

module.exports = {
  canAccessOrder,
};
