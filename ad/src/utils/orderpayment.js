// Đơn đã hủy nhưng tiền vẫn ở cửa hàng -> cần chuyển khoản trả khách rồi xác nhận
export const needsRefund = (order) =>
  Boolean(order) &&
  order.state === "Cancelled" &&
  order.payment === true &&
  order.paymentStatus !== "REFUNDED";

// Nhãn + màu MUI cho trạng thái thanh toán của đơn bán
export const getPaymentChip = (order) => {
  if (!order) return { label: "", color: "default" };
  if (order.paymentStatus === "REFUNDED") return { label: "Đã hoàn tiền", color: "info" };
  if (needsRefund(order)) return { label: "Chờ hoàn tiền", color: "warning" };
  if (order.paymentStatus === "PENDING") return { label: "Chờ thanh toán SePay", color: "warning" };
  if (order.paymentStatus === "EXPIRED") return { label: "SePay đã hết hạn", color: "default" };
  return order.payment
    ? { label: "Đã thanh toán", color: "success" }
    : { label: "Chưa thanh toán", color: "error" };
};
