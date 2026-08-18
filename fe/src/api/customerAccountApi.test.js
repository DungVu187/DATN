import { apiFetch, resolveApiUrl } from "./httpClient";
import * as customerAccountApi from "./customerAccountApi";

vi.mock("./httpClient", () => ({
  apiFetch: vi.fn(),
  resolveApiUrl: vi.fn(),
}));

const expectedExportNames = [
  "deleteCustomerAddress",
  "getCustomerProfile",
  "loginCustomer",
  "registerCustomer",
  "requestCustomerPasswordReset",
  "resetCustomerPassword",
  "saveCustomerAddress",
  "setDefaultCustomerAddress",
  "updateCustomerProfile",
];

describe("customerAccountApi", () => {
  const originalFetch = global.fetch;
  const response = { ok: true, status: 200 };

  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue(response);
    resolveApiUrl.mockImplementation((path) => "https://api.test" + path);
    global.fetch = vi.fn().mockResolvedValue(response);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test("exports exactly the compact customer account API", () => {
    expect(Object.keys(customerAccountApi).sort()).toEqual(
      expectedExportNames.sort(),
    );
  });

  test("maps credentialed account and address contracts without parsing", async () => {
    const registration = {
      name: "Customer",
      email: "customer@example.com",
      phone: "0900000000",
      password: "secret",
    };
    const login = {
      email: "customer@example.com",
      password: "secret",
    };
    const profile = { name: "Updated", email: "updated@example.com" };
    const address = {
      label: "Office",
      receiverName: "Customer",
      receiverPhone: "0900000000",
      addressDetail: "1 Main Street",
    };

    const registerResult = await customerAccountApi.registerCustomer(
      registration,
    );
    await customerAccountApi.loginCustomer(login);
    await customerAccountApi.getCustomerProfile();
    await customerAccountApi.updateCustomerProfile(profile);
    await customerAccountApi.saveCustomerAddress(undefined, address);
    await customerAccountApi.saveCustomerAddress("address-1", address);
    await customerAccountApi.deleteCustomerAddress("address-1");
    await customerAccountApi.setDefaultCustomerAddress("address-1");

    expect(registerResult).toBe(response);
    expect(apiFetch.mock.calls).toEqual([
      ["/users/register", { method: "POST", json: registration }],
      ["/users/login", { method: "POST", json: login }],
      ["/users/profile", { method: "GET" }],
      ["/users/profile", { method: "PUT", json: profile }],
      [
        "/users/profile/addresses",
        { method: "POST", json: address },
      ],
      [
        "/users/profile/addresses/address-1",
        { method: "PUT", json: address },
      ],
      ["/users/profile/addresses/address-1", { method: "DELETE" }],
      [
        "/users/profile/addresses/address-1/default",
        { method: "PUT" },
      ],
    ]);
  });

  test("keeps password reset requests public and returns native responses", async () => {
    const resetRequest = {
      identifier: "customer@example.com",
      otp: "123456",
      newPassword: "new-secret",
    };

    const requestResult =
      await customerAccountApi.requestCustomerPasswordReset(
        "customer@example.com",
      );
    const resetResult = await customerAccountApi.resetCustomerPassword(
      resetRequest,
    );

    expect(requestResult).toBe(response);
    expect(resetResult).toBe(response);
    expect(global.fetch.mock.calls).toEqual([
      [
        "https://api.test/users/forgot-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: "customer@example.com" }),
        },
      ],
      [
        "https://api.test/users/reset-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resetRequest),
        },
      ],
    ]);
    expect(global.fetch.mock.calls[0][1]).not.toHaveProperty("credentials");
  });
});
