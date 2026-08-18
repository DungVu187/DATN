import { apiFetch } from "./httpClient";
import * as customerOrderApi from "./customerOrderApi";

vi.mock("./httpClient", () => ({
  apiFetch: vi.fn(),
}));

describe("customerOrderApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  test("exports exactly the compact customer order API", () => {
    expect(Object.keys(customerOrderApi).sort()).toEqual([
      "cancelCustomerOrder",
      "createCustomerOrder",
      "getCustomerOrders",
    ]);
  });

  test("maps create, list and cancellation contracts as raw responses", async () => {
    const response = { ok: false, status: 401 };
    const order = {
      cartItems: [{ productId: "product-1", quantity: 2 }],
      total: 150000,
    };
    apiFetch.mockResolvedValue(response);

    const createResult = await customerOrderApi.createCustomerOrder(order);
    const listResult = await customerOrderApi.getCustomerOrders();
    const cancelResult = await customerOrderApi.cancelCustomerOrder("order-1");

    expect(createResult).toBe(response);
    expect(listResult).toBe(response);
    expect(cancelResult).toBe(response);
    expect(apiFetch.mock.calls).toEqual([
      [
        "/orders/create-order",
        {
          method: "POST",
          json: { cartItems: order.cartItems, total: order.total },
        },
      ],
      [
        "/orders/userOrders",
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      ],
      [
        "/orders/order-1",
        {
          method: "PUT",
          json: { state: "Cancelled" },
        },
      ],
    ]);
  });
});
