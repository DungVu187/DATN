import { apiFetch, resolveApiUrl } from "./httpClient";

const jsonHeaders = { "Content-Type": "application/json" };

const jsonRequest = (path, options = {}) =>
  apiFetch(path, { ...options, headers: jsonHeaders });

export const resolveInventoryOrderAssetUrl = (imageUrl) => {
  if (!imageUrl) return "";
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return resolveApiUrl(imageUrl);
};

const buildQuery = (queryParams = {}) =>
  new URLSearchParams(
    Object.entries(queryParams).filter(([, value]) => value !== undefined),
  ).toString();

const listOrders = (orderType, queryParams) =>
  jsonRequest(`/${orderType}/orders?${buildQuery(queryParams)}`);

const getOrder = (orderType, orderId) =>
  jsonRequest(`/${orderType}/orders/${orderId}`);

const createOrder = (orderType, order) =>
  jsonRequest(`/${orderType}/orders`, {
    method: "POST",
    json: order,
  });

const updateOrderMetadata = (orderType, orderId, metadata) =>
  jsonRequest(`/${orderType}/orders/${orderId}`, {
    method: "PUT",
    json: metadata,
  });

const updateOrderName = (orderType, orderId, changes) =>
  jsonRequest(`/${orderType}/orders/${orderId}/name`, {
    method: "PUT",
    json: changes,
  });

const setOrderStatus = (orderType, orderId, status) =>
  jsonRequest(`/${orderType}/orders/${orderId}/status`, {
    method: "PUT",
    json: { status },
  });

const completeOrder = (orderType, orderId) =>
  jsonRequest(`/${orderType}/orders/${orderId}/setStatusAndQuantity`, {
    method: "PUT",
    json: { status: true },
  });

const deleteOrder = (orderType, orderId) =>
  jsonRequest(`/${orderType}/orders/${orderId}`, { method: "DELETE" });

const addOrderLine = (orderType, orderId, line) =>
  jsonRequest(`/${orderType}/orders/${orderId}/products`, {
    method: "POST",
    json: line,
  });

const updateOrderLine = (orderType, orderId, productIndex, changes) =>
  jsonRequest(`/${orderType}/orders/${orderId}/products/${productIndex}`, {
    method: "PUT",
    json: changes,
  });

const deleteOrderLine = (orderType, orderId, productIndex) =>
  jsonRequest(`/${orderType}/orders/${orderId}/products/${productIndex}`, {
    method: "DELETE",
  });

const reorderOrderLines = (orderType, orderId, productList) =>
  jsonRequest(`/${orderType}/orders/${orderId}/reorder`, {
    method: "PUT",
    json: { productList },
  });

const completeOrderLine = (orderType, orderId, productIndex) =>
  jsonRequest(
    `/${orderType}/orders/${orderId}/products/${productIndex}/setStatusAndQuantity`,
    {
      method: "PUT",
      json: { status: true },
    },
  );

const uploadOrderImage = (orderType, file) => {
  const formData = new FormData();
  formData.append("invoice", file);
  return apiFetch(`/${orderType}/upload-image`, {
    method: "POST",
    body: formData,
  });
};

const deleteOrderImage = (orderType, imageUrl) =>
  jsonRequest(
    `/${orderType}/delete-image?imageUrl=${encodeURIComponent(imageUrl)}`,
    { method: "DELETE" },
  );

export const listImportOrders = (queryParams = {}) =>
  listOrders("iporders", queryParams);

export const getImportOrder = (orderId) => getOrder("iporders", orderId);

export const createImportOrder = (order) => createOrder("iporders", order);

export const updateImportOrderMetadata = (orderId, metadata) =>
  updateOrderMetadata("iporders", orderId, metadata);

export const updateImportOrderName = (orderId, changes) =>
  updateOrderName("iporders", orderId, changes);

export const setImportOrderStatus = (orderId, status) =>
  setOrderStatus("iporders", orderId, status);

export const completeImportOrder = (orderId) =>
  completeOrder("iporders", orderId);

export const deleteImportOrder = (orderId) =>
  deleteOrder("iporders", orderId);

export const addImportOrderLine = (orderId, line) =>
  addOrderLine("iporders", orderId, line);

export const updateImportOrderLine = (orderId, productIndex, changes) =>
  updateOrderLine("iporders", orderId, productIndex, changes);

export const deleteImportOrderLine = (orderId, productIndex) =>
  deleteOrderLine("iporders", orderId, productIndex);

export const reorderImportOrderLines = (orderId, productList) =>
  reorderOrderLines("iporders", orderId, productList);

export const completeImportOrderLine = (orderId, productIndex) =>
  completeOrderLine("iporders", orderId, productIndex);

export const uploadImportOrderImage = (file) =>
  uploadOrderImage("iporders", file);

export const deleteImportOrderImage = (imageUrl) =>
  deleteOrderImage("iporders", imageUrl);

export const createExportOrderFromImport = (order) =>
  createOrder("eporders", order);

export const listExportOrders = (queryParams = {}) =>
  listOrders("eporders", queryParams);

export const getExportOrder = (orderId) => getOrder("eporders", orderId);

export const createExportOrder = (order) => createOrder("eporders", order);

export const updateExportOrderMetadata = (orderId, metadata) =>
  updateOrderMetadata("eporders", orderId, metadata);

export const updateExportOrderName = (orderId, changes) =>
  updateOrderName("eporders", orderId, changes);

export const setExportOrderStatus = (orderId, status) =>
  setOrderStatus("eporders", orderId, status);

export const completeExportOrder = (orderId) =>
  completeOrder("eporders", orderId);

export const deleteExportOrder = (orderId) =>
  deleteOrder("eporders", orderId);

export const addExportOrderLine = (orderId, line) =>
  addOrderLine("eporders", orderId, line);

export const updateExportOrderLine = (orderId, productIndex, changes) =>
  updateOrderLine("eporders", orderId, productIndex, changes);

export const deleteExportOrderLine = (orderId, productIndex) =>
  deleteOrderLine("eporders", orderId, productIndex);

export const reorderExportOrderLines = (orderId, productList) =>
  reorderOrderLines("eporders", orderId, productList);

export const completeExportOrderLine = (orderId, productIndex) =>
  completeOrderLine("eporders", orderId, productIndex);

export const uploadExportOrderImage = (file) =>
  uploadOrderImage("eporders", file);

export const deleteExportOrderImage = (imageUrl) =>
  deleteOrderImage("eporders", imageUrl);

export const createImportOrderFromExport = (order) =>
  createOrder("iporders", order);

export const getInventoryOrderTemplates = () =>
  jsonRequest("/users/order-templates");

export const createInventoryOrderTemplate = (template) =>
  jsonRequest("/users/order-templates", {
    method: "POST",
    json: template,
  });

export const updateInventoryOrderTemplateProducts = (index, template) =>
  jsonRequest(`/users/order-template/${index}/products`, {
    method: "PUT",
    json: template,
  });

export const updateInventoryOrderTemplateDisplayName = (index, displayName, note) =>
  jsonRequest(`/users/order-template/${index}/display-name`, {
    method: "PUT",
    json: note === undefined ? { displayName } : { displayName, note },
  });

export const deleteInventoryOrderTemplate = (index) =>
  apiFetch(`/users/order-template/${index}`, { method: "DELETE" });

export const getInventoryProductsByIds = (ids) =>
  jsonRequest("/products/fetch-inventory-by-ids", {
    method: "POST",
    json: { ids },
  });

export const getInventoryProductCatalog = () =>
  jsonRequest("/products/?limit=9999");

export const searchInventoryOrderProducts = (queryParams = {}) =>
  jsonRequest(`/products/?${buildQuery(queryParams)}`);

export const searchInventoryOrderTemplateProducts = (searchTerm) =>
  jsonRequest(`/products/?search=${searchTerm}`);

export const getInventoryProduct = (productId) =>
  jsonRequest(`/products/${productId}`);

export const getInventoryProductsByCodes = (codes) =>
  jsonRequest("/products/by-codes", {
    method: "POST",
    json: { codes },
  });

export const createInventoryProduct = (product) =>
  jsonRequest("/products/create", {
    method: "POST",
    json: product,
  });

export const createInventoryBrand = (brand) =>
  jsonRequest("/chips/brands", {
    method: "POST",
    json: { Brand: brand },
  });

export const scanInventoryInvoice = (file) => {
  const formData = new FormData();
  formData.append("invoice", file);
  return apiFetch("/products/scan-invoice", {
    method: "POST",
    body: formData,
  });
};

export const cleanInventoryTempImage = (imageUrl) =>
  jsonRequest(
    `/products/clean-temp-image?imageUrl=${encodeURIComponent(imageUrl)}`,
    { method: "DELETE" },
  );

export const updateInventoryOrderHistoryName = (orderId, newOrderName) =>
  jsonRequest("/histories/update-ordername", {
    method: "PUT",
    json: { orderId, newOrderName },
  });
