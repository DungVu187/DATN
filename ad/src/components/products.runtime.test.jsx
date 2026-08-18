import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { beforeEach, describe, expect, it, vi } from "vitest";
import theme from "../theme";
import Products from "./products";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../context/usepermissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe("Products runtime", () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock;
    sessionStorage.clear();
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes("/products?")) {
        return { ok: true, json: async () => ({ products: [], total: 0 }) };
      }
      return { ok: true, json: async () => [] };
    });
  });

  it("renders the product page inside the enterprise theme", async () => {
    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Products />
      </ThemeProvider>,
    );

    expect(screen.getByRole("heading", { name: "Danh mục sản phẩm" })).toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it("switches an existing name to update mode and submits the selected icon", async () => {
    globalThis.fetch = vi.fn(async (url, options = {}) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/products?")) {
        return { ok: true, json: async () => ({ products: [], total: 0 }) };
      }
      if (requestUrl.endsWith("/products/types") && !options.method) {
        return {
          ok: true,
          json: async () => [{ _id: "type-plc", Type: "PLC", icon: "ri-tb-cpu" }],
        };
      }
      if (requestUrl.endsWith("/products/types/type-plc") && options.method === "PUT") {
        return {
          ok: true,
          json: async () => ({ _id: "type-plc", Type: "PLC", icon: "ri-tb-robot" }),
        };
      }
      return { ok: true, json: async () => [] };
    });

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Products />
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Quản lý loại sản phẩm" }));
    expect(screen.getByText("Đang hiển thị 82/82 biểu tượng")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tên loại sản phẩm"), {
      target: { value: "PLC" },
    });

    const updateButton = await screen.findByRole("button", {
      name: "Cập nhật loại sản phẩm",
    });
    fireEvent.click(screen.getByRole("button", { name: "Robot" }));
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/products/types/type-plc"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ Type: "PLC", icon: "ri-tb-robot" }),
        }),
      );
    });
  }, 20000);
});
