import { apiFetch, resolveApiUrl } from "./httpClient";

const jsonHeaders = { "Content-Type": "application/json" };

const publicFetch = (path, options) => {
  const url = resolveApiUrl(path);
  return options === undefined ? fetch(url) : fetch(url, options);
};

const publicJsonFetch = (path, method, payload) =>
  publicFetch(path, {
    method,
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });

export const registerCustomer = (customer) =>
  apiFetch("/users/register", {
    method: "POST",
    json: customer,
  });

export const loginCustomer = (credentials) =>
  apiFetch("/users/login", {
    method: "POST",
    json: credentials,
  });

export const requestCustomerPasswordReset = (identifier) =>
  publicJsonFetch("/users/forgot-password", "POST", { identifier });

export const resetCustomerPassword = (resetRequest) =>
  publicJsonFetch("/users/reset-password", "POST", resetRequest);


export const getCustomerProfile = () =>
  apiFetch("/users/profile", { method: "GET" });

export const updateCustomerProfile = (profile) =>
  apiFetch("/users/profile", {
    method: "PUT",
    json: profile,
  });

export const saveCustomerAddress = (addressId, address) =>
  apiFetch(
    addressId
      ? "/users/profile/addresses/" + addressId
      : "/users/profile/addresses",
    {
      method: addressId ? "PUT" : "POST",
      json: address,
    },
  );

export const deleteCustomerAddress = (addressId) =>
  apiFetch("/users/profile/addresses/" + addressId, { method: "DELETE" });

export const setDefaultCustomerAddress = (addressId) =>
  apiFetch("/users/profile/addresses/" + addressId + "/default", {
    method: "PUT",
  });
