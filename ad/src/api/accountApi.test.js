import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./httpClient", () => ({
  apiFetch: apiFetchMock,
}));

import {
  deleteAccountUser,
  getAccountPermissionCatalog,
  getAccountUsers,
  saveAccountUser,
} from "./accountApi";

const createResponse = ({ ok = true, status = 200, data }) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(data),
});

describe("accountApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads account users through the shared HTTP client", async () => {
    const users = [{ _id: "user-1", role: "admin" }];
    apiFetchMock.mockResolvedValue(createResponse({ data: users }));

    await expect(getAccountUsers()).resolves.toEqual(users);
    expect(apiFetchMock).toHaveBeenCalledWith("/users/all-users", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("keeps permission catalog failure as a non-throwing null result", async () => {
    apiFetchMock.mockResolvedValue(createResponse({ ok: false, status: 403 }));

    await expect(getAccountPermissionCatalog()).resolves.toBeNull();
    expect(apiFetchMock).toHaveBeenCalledWith("/users/permission-catalog", {
      method: "GET",
    });
  });

  it("uses create and update endpoints without changing payloads", async () => {
    const user = { phone: "0900000001", role: "staff", permissions: [] };
    const created = { user: { _id: "user-1", ...user } };
    const updated = { user: { _id: "user-2", ...user } };
    apiFetchMock
      .mockResolvedValueOnce(createResponse({ data: created }))
      .mockResolvedValueOnce(createResponse({ data: updated }));

    await expect(saveAccountUser({ user })).resolves.toEqual(created);
    await expect(saveAccountUser({ userId: "user-2", user })).resolves.toEqual(updated);

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/users/admin-create", {
      method: "POST",
      json: user,
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/users/user-2/permissions", {
      method: "PUT",
      json: user,
    });
  });

  it("preserves backend and fallback save error messages", async () => {
    apiFetchMock
      .mockResolvedValueOnce(createResponse({
        ok: false,
        status: 400,
        data: { message: "Số điện thoại đã tồn tại" },
      }))
      .mockResolvedValueOnce(createResponse({
        ok: false,
        status: 500,
        data: {},
      }));

    await expect(saveAccountUser({ user: {} })).rejects.toThrow(
      "Số điện thoại đã tồn tại",
    );
    await expect(saveAccountUser({ user: {} })).rejects.toThrow(
      "Lỗi 500: Thao tác thất bại",
    );
  });

  it("deletes an account and preserves the delete fallback", async () => {
    apiFetchMock
      .mockResolvedValueOnce(createResponse({ data: {} }))
      .mockResolvedValueOnce(createResponse({
        ok: false,
        status: 404,
        data: {},
      }));

    await expect(deleteAccountUser("user-1")).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/users/user-1", {
      method: "DELETE",
    });
    await expect(deleteAccountUser("user-2")).rejects.toThrow(
      "Lỗi 404: Xóa tài khoản thất bại",
    );
  });
});

