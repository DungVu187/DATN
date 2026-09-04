import { apiFetch } from "./httpClient";

const jsonHeaders = { "Content-Type": "application/json" };

export const createCustomerOrder = ({ cartItems, total, addressId, checkoutNote, paymentMethod }) =>
  apiFetch("/orders/create-order", {
    method: "POST",
    json: {
      cartItems,
      ...(total !== undefined ? { total } : {}),
      ...(addressId !== undefined ? { addressId } : {}),
      ...(checkoutNote !== undefined ? { checkoutNote } : {}),
      ...(paymentMethod !== undefined ? { paymentMethod } : {}),
    },
  });

export const getCustomerOrders = () =>
  apiFetch("/orders/userOrders", {
    method: "GET",
    headers: jsonHeaders,
  });

export const cancelCustomerOrder = (orderId) =>
  apiFetch("/orders/" + orderId, {
    method: "PUT",
    json: { state: "Cancelled" },
  });
