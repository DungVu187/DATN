import { apiFetch } from "./httpClient";

export const getCustomerUsers = async () => {
  const response = await apiFetch("/users/customers");
  return response.json();
};

export const registerCustomer = async (customer) => {
  const response = await apiFetch("/users/register", {
    method: "POST",
    json: customer,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Đăng ký thất bại");
  return data;
};

export const deleteCustomer = async (userId) => {
  const response = await apiFetch("/users/" + userId, {
    method: "DELETE",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Không thể xóa");
  return data;
};

export const updateCustomer = async (userId, customer, fallbackMessage = "Cập nhật thất bại") => {
  const response = await apiFetch("/users/" + userId + "/permissions", {
    method: "PUT",
    json: customer,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || fallbackMessage);
  return data;
};
