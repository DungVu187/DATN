function isLockedOrder(order) {
  return order.status === 'Completed' || order.state === 'Cancelled';
}

module.exports = {
  isLockedOrder,
};
