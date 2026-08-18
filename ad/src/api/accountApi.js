import { apiFetch } from "./httpClient";

const getErrorMessage = async (response, fallback) => {
  const errorData = await response.json();
  return errorData.message || fallback;
};

export const getAccountUsers = async () => {
  const response = await apiFetch("/users/all-users", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        `Lỗi ${response.status}: Lấy danh sách người dùng thất bại`,
      ),
    );
  }

  return response.json();
};

export const getAccountPermissionCatalog = async () => {
  const response = await apiFetch("/users/permission-catalog", {
    method: "GET",
  });

  if (!response.ok) return null;
  return response.json();
};

export const saveAccountUser = async ({ userId, user }) => {
  const response = await apiFetch(
    userId ? `/users/${userId}/permissions` : "/users/admin-create",
    {
      method: userId ? "PUT" : "POST",
      json: user,
    },
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        `Lỗi ${response.status}: Thao tác thất bại`,
      ),
    );
  }

  return response.json();
};

export const deleteAccountUser = async (userId) => {
  const response = await apiFetch(`/users/${userId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        `Lỗi ${response.status}: Xóa tài khoản thất bại`,
      ),
    );
  }
};

