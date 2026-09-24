function isLockedOrder(order) {
  return order.status === 'Completed' || order.state === 'Cancelled';
}

// Đơn đã nhận tiền nhưng chưa được xác nhận trả lại cho khách
function isPaidUnrefunded(order) {
  return Boolean(order) && order.payment === true && order.paymentStatus !== 'REFUNDED';
}

// Đơn đã hủy mà tiền vẫn còn ở cửa hàng -> nhân viên phải chuyển khoản trả khách
function needsRefund(order) {
  return isPaidUnrefunded(order) && order.state === 'Cancelled';
}

module.exports = {
  isLockedOrder,
  isPaidUnrefunded,
  needsRefund,
};
