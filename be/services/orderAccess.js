const privilegedOrderRoles = ['admin', 'superadmin', 'staff'];

function isPrivilegedOrderUser(user) {
  return privilegedOrderRoles.includes(user?.role);
}

function canAccessOrder(order, user) {
  return order.userPhone === user?.phone || isPrivilegedOrderUser(user);
}

module.exports = {
  canAccessOrder,
  isPrivilegedOrderUser,
};
