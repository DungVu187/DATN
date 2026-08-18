import { apiFetch, getAuthFailure, resolveApiUrl } from "./httpClient";

describe("httpClient", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BACK_END", "https://api.example.com/root/");
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("joins relative paths and falls back to same-origin paths", () => {
    expect(resolveApiUrl("/users/profile")).toBe(
      "https://api.example.com/root/users/profile"
    );
    expect(resolveApiUrl("users/logout")).toBe(
      "https://api.example.com/root/users/logout"
    );

    vi.stubEnv("VITE_BACK_END", "");
    expect(resolveApiUrl("users/profile")).toBe("/users/profile");
  });

  test("always includes credentials and returns the native response", async () => {
    const response = { ok: true, status: 200 };
    fetch.mockResolvedValue(response);

    const result = await apiFetch("/users/profile", {
      method: "GET",
      credentials: "omit",
    });

    expect(result).toBe(response);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/root/users/profile",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      })
    );
  });

  test("serializes json without adding CSRF or authorization headers", async () => {
    fetch.mockResolvedValue({ ok: true, status: 200 });

    await apiFetch("/carts/addToCart", {
      method: "POST",
      json: { productId: "product-1", quantity: 1 },
    });

    const [, options] = fetch.mock.calls[0];
    expect(options.body).toBe(
      JSON.stringify({ productId: "product-1", quantity: 1 })
    );
    expect(options.headers.get("Content-Type")).toBe("application/json");
    expect(options.headers.has("CSRF-Token")).toBe(false);
    expect(options.headers.has("Authorization")).toBe(false);
  });
});

describe("getAuthFailure", () => {
  test("classifies only unauthorized and forbidden responses", () => {
    expect(getAuthFailure({ status: 401 })).toBe("unauthorized");
    expect(getAuthFailure({ status: 403 })).toBe("forbidden");
    expect(getAuthFailure({ status: 500 })).toBeNull();
    expect(getAuthFailure(null)).toBeNull();
  });
});
