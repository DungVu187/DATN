import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, getAuthFailure, resolveApiUrl } from "./httpClient";

describe("httpClient", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com/root/");
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("joins a relative path with VITE_API_URL", () => {
    expect(resolveApiUrl("/users/profile")).toBe(
      "https://api.example.com/root/users/profile",
    );
    expect(resolveApiUrl("users/logout")).toBe(
      "https://api.example.com/root/users/logout",
    );
  });

  it("falls back to a same-origin relative path", () => {
    vi.stubEnv("VITE_API_URL", "");

    expect(resolveApiUrl("users/profile")).toBe("/users/profile");
  });

  it("always includes credentials and returns the fetch response", async () => {
    const response = { ok: true, status: 200 };
    globalThis.fetch.mockResolvedValue(response);

    const result = await apiFetch("/users/profile", {
      method: "GET",
      credentials: "omit",
    });

    expect(result).toBe(response);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/root/users/profile",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("serializes an optional json body without adding CSRF headers", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200 });

    await apiFetch("/users/admin/login", {
      method: "POST",
      headers: { "X-Request-Id": "request-1" },
      json: { phone: "0123456789", password: "secret" },
    });

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.body).toBe(
      JSON.stringify({ phone: "0123456789", password: "secret" }),
    );
    expect(options.headers.get("Content-Type")).toBe("application/json");
    expect(options.headers.get("X-Request-Id")).toBe("request-1");
    expect(options.headers.has("CSRF-Token")).toBe(false);
  });
});

describe("getAuthFailure", () => {
  it("classifies only unauthorized and forbidden responses", () => {
    expect(getAuthFailure({ status: 401 })).toBe("unauthorized");
    expect(getAuthFailure({ status: 403 })).toBe("forbidden");
    expect(getAuthFailure({ status: 500 })).toBeNull();
    expect(getAuthFailure(null)).toBeNull();
  });
});
