import { apiFetch, resolveApiUrl } from "./httpClient";

const jsonHeaders = { "Content-Type": "application/json" };

const jsonRequest = (path, options = {}) =>
  apiFetch(path, { ...options, headers: jsonHeaders });

export const resolveSalesOrderAssetUrl = (imageUrl) => {
  if (!imageUrl) return "";
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return resolveApiUrl(imageUrl);
};

export const getSalesOrders = (queryParams) => {
  const query = new URLSearchParams(queryParams).toString();
  return jsonRequest(`/orders?${query}`);
};

export const getProcessingSalesOrderCount = () =>
  apiFetch("/orders/processing-count");

export const updateSalesOrderField = (orderId, field, value) =>
  apiFetch(`/orders/update-order/${orderId}`, {
    method: "PUT",
    headers: jsonHeaders,
    json: { field, value },
  });

export const createAdminSalesOrderDraft = () =>
  jsonRequest("/orders/admin-draft", { method: "POST" });

export const getAdminSalesOrderDetail = (orderId) =>
  jsonRequest(`/orders/admin-detail/${orderId}`);

export const searchSalesOrderProducts = ({ search, code, limit }) => {
  const query = new URLSearchParams({ search, code, limit }).toString();
  return jsonRequest(`/products?${query}`);
};

export const getSalesOrderProductsForScan = () =>
  jsonRequest("/products/?limit=9999");

export const getSalesOrderProductsByIds = (ids) =>
  apiFetch("/products/fetch-by-ids", {
    method: "POST",
    headers: jsonHeaders,
    json: { ids },
  });

export const updateSalesOrderItemQuantity = (orderId, itemIndex, quantity) =>
  apiFetch(`/orders/${orderId}/items/${itemIndex}`, {
    method: "PUT",
    headers: jsonHeaders,
    json: { quantity },
  });

export const addSalesOrderItem = (orderId, item) =>
  apiFetch(`/orders/${orderId}/items`, {
    method: "POST",
    headers: jsonHeaders,
    json: item,
  });

export const updateSalesOrderImages = (orderId, images) =>
  apiFetch(`/orders/${orderId}/images`, {
    method: "PUT",
    headers: jsonHeaders,
    json: { images },
  });

export const reorderSalesOrderItems = (orderId, cartItems) =>
  apiFetch(`/orders/${orderId}/reorder`, {
    method: "PUT",
    headers: jsonHeaders,
    json: { cartItems },
  });

export const deleteSalesOrderItem = (orderId, itemIndex) =>
  jsonRequest(`/orders/${orderId}/items/${itemIndex}`, { method: "DELETE" });

export const updateSalesOrderCustomer = (orderId, customer) =>
  apiFetch(`/orders/${orderId}/customer`, {
    method: "PUT",
    headers: jsonHeaders,
    json: customer,
  });

export const cancelSalesOrder = (orderId) =>
  apiFetch(`/orders/${orderId}`, {
    method: "PUT",
    headers: jsonHeaders,
    json: { state: "Cancelled" },
  });

export const getSalesOrderProductsByCodes = (codes) =>
  apiFetch("/products/by-codes", {
    method: "POST",
    headers: jsonHeaders,
    json: { codes },
  });

export const scanSalesOrderInvoice = (file) => {
  const formData = new FormData();
  formData.append("invoice", file);
  return apiFetch("/products/scan-invoice", {
    method: "POST",
    body: formData,
  });
};

export const cleanSalesOrderTempImage = (imageUrl) =>
  jsonRequest(
    `/products/clean-temp-image?imageUrl=${encodeURIComponent(imageUrl)}`,
    { method: "DELETE" },
  );

export const uploadSalesOrderImage = (file) => {
  const formData = new FormData();
  formData.append("invoice", file);
  return apiFetch("/orders/upload-image", {
    method: "POST",
    body: formData,
  });
};

export const deleteSalesOrderImage = (imageUrl) =>
  jsonRequest(
    `/orders/delete-image?imageUrl=${encodeURIComponent(imageUrl)}`,
    { method: "DELETE" },
  );
