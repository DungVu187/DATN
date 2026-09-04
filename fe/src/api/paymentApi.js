import { apiFetch } from "./httpClient";

export const getCustomerPaymentStatus = (orderId) =>
  apiFetch("/payments/orders/" + orderId + "/status", {
    method: "GET",
  });
