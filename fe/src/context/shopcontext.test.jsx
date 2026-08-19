import React, { useContext } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import ShopContextProvider, { ShopContext } from "./shopcontext";

vi.mock("react-hot-toast", () => {
  const toastMock = {
    error: vi.fn(),
    success: vi.fn(),
  };

  return {
    __esModule: true,
    default: toastMock,
    toast: toastMock,
  };
});

const responseOf = ({ ok = true, status = 200, data = {} } = {}) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(data),
});

const CartConsumer = () => {
  const {
    cartItems,
    addToCart,
    removeFromCart,
    updateCartItem,
    updateCartItemStatus,
    clearCart,
    getCartItemCount,
  } = useContext(ShopContext);

  return (
    <div>
      <output data-testid="cart-count">{getCartItemCount()}</output>
      <output data-testid="cart-json">{JSON.stringify(cartItems)}</output>
      <button type="button" onClick={() => addToCart("product-1", 2, "0")}>
        add
      </button>
      <button type="button" onClick={() => removeFromCart("product-1", 2)}>
        remove
      </button>
      <button type="button" onClick={() => updateCartItem("product-1", 2, 4)}>
        update quantity
      </button>
      <button type="button" onClick={() => updateCartItemStatus("product-1", 2, false)}>
        update status
      </button>
      <button type="button" onClick={() => clearCart()}>
        clear
      </button>
    </div>
  );
};

const renderCartContext = () => render(
  <ShopContextProvider>
      <CartConsumer />
    </ShopContextProvider>
);

describe("ShopContextProvider", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BACK_END", "http://backend.test");
    global.fetch = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    toast.error.mockClear();
    toast.success.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("loads the current cart with the httpOnly cookie on mount", async () => {
    const cart = [{ productId: "product-1", variantIndex: 0, quantity: 2 }];
    fetch.mockResolvedValueOnce(responseOf({ data: { cart } }));

    renderCartContext();

    await waitFor(() => expect(screen.getByTestId("cart-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("cart-json")).toHaveTextContent("product-1");
    expect(fetch).toHaveBeenCalledWith(
      "http://backend.test/carts/getCart",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      })
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("treats an unauthorized initial cart as an empty anonymous cart", async () => {
    fetch.mockResolvedValueOnce(responseOf({ ok: false, status: 401 }));

    renderCartContext();

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("cart-count")).toHaveTextContent("0");
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("sanitizes an invalid add quantity, updates state, and keeps cookie auth", async () => {
    fetch
      .mockResolvedValueOnce(responseOf({ data: { cart: [] } }))
      .mockResolvedValueOnce(responseOf({
        data: {
          cart: [{ productId: "product-1", variantIndex: 2, quantity: 1 }],
        },
      }));

    renderCartContext();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => expect(screen.getByTestId("cart-count")).toHaveTextContent("1"));
    expect(fetch).toHaveBeenLastCalledWith(
      "http://backend.test/carts/addToCart",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          productId: "product-1",
          variantIndex: 2,
          quantity: 1,
        }),
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Đã thêm sản phẩm vào giỏ hàng.");
  });

  test("sends quantity and status updates to their dedicated endpoints", async () => {
    const initialCart = [{ productId: "product-1", variantIndex: 2, quantity: 1, status: true }];
    fetch
      .mockResolvedValueOnce(responseOf({ data: { cart: initialCart } }))
      .mockResolvedValueOnce(responseOf({
        data: { cart: [{ ...initialCart[0], quantity: 4 }] },
      }))
      .mockResolvedValueOnce(responseOf({
        data: { cart: [{ ...initialCart[0], quantity: 4, status: false }] },
      }));

    renderCartContext();
    await waitFor(() => expect(screen.getByTestId("cart-count")).toHaveTextContent("1"));

    fireEvent.click(screen.getByRole("button", { name: "update quantity" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://backend.test/carts/updateCartItem",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ productId: "product-1", variantIndex: 2, quantity: 4 }),
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "update status" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "http://backend.test/carts/updateStatus",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ productId: "product-1", variantIndex: 2, status: false }),
      })
    );
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Đã cập nhật trạng thái sản phẩm.");
    });
  });

  test("removes one item and clears the whole cart without sending auth headers", async () => {
    const initialCart = [{ productId: "product-1", variantIndex: 2, quantity: 1 }];
    fetch
      .mockResolvedValueOnce(responseOf({ data: { cart: initialCart } }))
      .mockResolvedValueOnce(responseOf({ data: { cart: [] } }))
      .mockResolvedValueOnce(responseOf({ data: { cart: [] } }));

    renderCartContext();
    await waitFor(() => expect(screen.getByTestId("cart-count")).toHaveTextContent("1"));

    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    await waitFor(() => expect(screen.getByTestId("cart-count")).toHaveTextContent("0"));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://backend.test/carts/removeFromCart",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ productId: "product-1", variantIndex: 2 }),
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "clear" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "http://backend.test/carts/clearCart",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: null,
      })
    );
    expect(fetch.mock.calls.flatMap(([, options]) => Object.keys(options))).not.toContain("Authorization");
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Đã xóa toàn bộ giỏ hàng.");
    });
  });

  test("keeps the current cart and reports a recoverable error when an update fails", async () => {
    const initialCart = [{ productId: "product-1", variantIndex: 2, quantity: 1 }];
    fetch
      .mockResolvedValueOnce(responseOf({ data: { cart: initialCart } }))
      .mockResolvedValueOnce(responseOf({ ok: false, status: 500 }));

    renderCartContext();
    await waitFor(() => expect(screen.getByTestId("cart-count")).toHaveTextContent("1"));
    fireEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Đã xảy ra lỗi. Vui lòng thử lại sau.");
    });
    expect(screen.getByTestId("cart-count")).toHaveTextContent("1");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
