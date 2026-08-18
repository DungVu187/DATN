import { apiFetch } from "./httpClient";

const getAdminLoginPath = () => import.meta.env.VITE_APP_ADMIN_LOGIN;

export const loginAdmin = (credentials, loginPath = getAdminLoginPath()) =>
  apiFetch(loginPath, {
    method: "POST",
    json: credentials,
  });

export const requestAdminPasswordReset = (identifier) =>
  apiFetch("/users/forgot-password", {
    method: "POST",
    json: { identifier },
  });

export const resetAdminPassword = ({ identifier, otp, newPassword }) =>
  apiFetch("/users/reset-password", {
    method: "POST",
    json: {
      identifier,
      otp,
      newPassword,
    },
  });

export const getAdminProfile = () =>
  apiFetch("/users/profile", { method: "GET" });

export const logoutAdmin = () =>
  apiFetch("/users/logout", { method: "POST" });
