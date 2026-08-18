import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./httpClient", () => ({
  apiFetch: apiFetchMock,
}));

import {
  getAdminProfile,
  loginAdmin,
  logoutAdmin,
  requestAdminPasswordReset,
  resetAdminPassword,
} from "./adminAuthApi";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

describe("adminAuthApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it("maps login and password-reset contracts", async () => {
    await loginAdmin(
      { phone: "0901234567", password: "secret" },
      "/users/admin-login",
    );
    await requestAdminPasswordReset("0901234567");
    await resetAdminPassword({
      identifier: "0901234567",
      otp: "123456",
      newPassword: "new-secret",
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/users/admin-login", {
      method: "POST",
      json: { phone: "0901234567", password: "secret" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/users/forgot-password", {
      method: "POST",
      json: { identifier: "0901234567" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/users/reset-password", {
      method: "POST",
      json: {
        identifier: "0901234567",
        otp: "123456",
        newPassword: "new-secret",
      },
    });
  });

  it("maps shared profile and logout contracts", async () => {
    await getAdminProfile();
    await logoutAdmin();

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/users/profile", {
      method: "GET",
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/users/logout", {
      method: "POST",
    });
  });

  it("keeps active auth consumers free of direct HTTP calls", () => {
    for (const componentPath of [
      ["components", "login.jsx"],
      ["components", "protectedroute.jsx"],
      ["context", "permissioncontext.jsx"],
      ["layout", "sidebar.jsx"],
    ]) {
      const source = fs.readFileSync(
        path.join(currentDirectory, "..", ...componentPath),
        "utf8",
      );
      expect(source).toContain("adminAuthApi");
      expect(source).not.toContain("apiFetch(");
    }

    const loginSource = fs.readFileSync(
      path.join(currentDirectory, "..", "components", "login.jsx"),
      "utf8",
    );
    expect(loginSource).not.toContain("VITE_APP_ADMIN_LOGIN");
  });
});
