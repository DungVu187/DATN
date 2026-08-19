import { render, screen, waitFor } from "@testing-library/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import theme from "./theme";
import { OrderProvider } from "./context/ordercontext";

vi.mock("socket.io-client", () => ({
  io: () => ({ on: vi.fn(), off: vi.fn(), disconnect: vi.fn() }),
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe("Admin product route runtime", () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    sessionStorage.clear();
    window.history.pushState({}, "", "/admin/product");
    globalThis.fetch = vi.fn(async (url) => {
      const target = String(url);
      if (target.includes("/users/profile")) {
        return {
          ok: true,
          json: async () => ({ name: "Admin", role: "admin", permissions: [] }),
        };
      }
      if (target.includes("/dashboard")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              period: { startDate: "2026-07-20", endDate: "2026-08-18" },
              summary: { revenue: 0, orderCount: 0, newCustomerCount: 0, pendingOrderCount: 0, pendingOver2HoursCount: 0 },
              comparison: { revenuePercent: 0, orderPercent: 0, customerPercent: 0 },
              revenueByDate: [],
              ordersByStatus: [],
              recentOrders: [],
              lowStockProducts: [],
            },
          }),
        };
      }
      if (target.includes("/products?")) {
        return { ok: true, json: async () => ({ products: [], total: 0 }) };
      }
      if (target.includes("/chips/getValues")) {
        return {
          ok: true,
          json: async () => ({
            Color: [],
            Shapes: [],
            Frames: [],
            ButtonCount: [],
          }),
        };
      }
      if (target.includes("/chips/section")) {
        return { ok: true, json: async () => [] };
      }
      if (target.includes("/manages/")) {
        return {
          ok: true,
          json: async () => ({
            success: 1,
            data: {
              overViewImg: [],
              partners: [],
              displayPartners: false,
              topPurchaseUrl: "",
              highestRatingUrl: "",
              introduction: "",
              homeCategoryConfig: { configured: false, items: [] },
            },
          }),
        };
      }
      if (target.includes("/orders/processing-count")) {
        return { ok: true, json: async () => ({ success: true, count: 0 }) };
      }
      if (target.includes("/orders/admin-detail/order-1")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            success: true,
            order: {
              _id: "order-1",
              orderCode: "SO-1",
              status: "Processing",
              state: "Processing",
              cartItems: [],
              images: [],
              total: 0,
            },
          }),
        };
      }
      if (target.includes("/iporders/orders/order-1")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            _id: "order-1",
            orderName: "Đơn nhập test",
            userName: "Admin",
            productList: [],
            images: [],
            status: false,
          }),
        };
      }
      if (target.includes("/eporders/orders/order-1")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            _id: "order-1",
            orderName: "Đơn xuất test",
            userName: "Admin",
            productList: [],
            images: [],
            status: false,
          }),
        };
      }
      if (target.includes("/iporders/orders?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orders: [],
            pagination: { currentPage: 1, totalPages: 0, totalItems: 0 },
          }),
        };
      }
      if (target.includes("/eporders/orders?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orders: [],
            pagination: { currentPage: 1, totalPages: 0, totalItems: 0 },
          }),
        };
      }
      if (target.includes("/orders?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ orders: [], total: 0 }),
        };
      }
      if (target.includes("/users/order-templates")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderTemplates: [{ displayName: "Mẫu test", products: [] }],
          }),
        };
      }
      if (target.includes("/products/?")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ products: [], total: 0 }),
        };
      }
      if (target.includes("/products/fetch-by-ids")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, products: [] }),
        };
      }
      if (target.includes("/histories/filter-options")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ userNames: [], orderNames: [] }),
        };
      }
      if (target.includes("/histories?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ history: [], totalPages: 1 }),
        };
      }
      if (target.includes("/activity-logs?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ logs: [], totalPages: 1, actionLabels: {} }),
        };
      }
      return { ok: true, json: async () => [] };
    });
  });

  it("renders the active admin dashboard route", async () => {
    window.history.pushState({}, "", "/admin/dashboard");

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <OrderProvider>
          <App />
        </OrderProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Tổng quan" })).toBeInTheDocument();
    });
  });

  it("renders the complete product route", async () => {
    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <OrderProvider>
          <App />
        </OrderProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Danh mục sản phẩm" })).toBeInTheDocument();
    });
  });

  it("renders the public admin login route", async () => {
    window.history.pushState({}, "", "/admin/login");

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <OrderProvider>
          <App />
        </OrderProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Đăng nhập Admin" }),
      ).toBeInTheDocument();
    });
  });

  it.each(["/admin/chip", "/admin/cluster"])(
    "renders the active catalog route %s",
    async (route) => {
      window.history.pushState({}, "", route);

      render(
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <OrderProvider>
            <App />
          </OrderProvider>
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Quản lý cụm thiết bị" }),
        ).toBeInTheDocument();
      });
    },
  );

  it.each([
    ["/admin/manage", "Quản lý nội dung"],
    ["/admin/sectiondisplay", "Quản lý hiển thị mục sản phẩm"],
  ])("renders the active storefront route %s", async (route, heading) => {
    window.history.pushState({}, "", route);

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <OrderProvider>
          <App />
        </OrderProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  });

  it.each([
    ["/admin/order", "Quản lý đơn hàng bán"],
    ["/admin/soldproducts", "Quản lý sản phẩm đã bán"],
  ])("renders the active sales-order route %s", async (route, heading) => {
    window.history.pushState({}, "", route);

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <OrderProvider>
          <App />
        </OrderProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  });

  it("renders the active sales-order detail route", async () => {
    window.history.pushState({}, "", "/admin/salesorder/order-1");

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <OrderProvider>
          <App />
        </OrderProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Chi tiết đơn bán #SO-1" }),
      ).toBeInTheDocument();
    });
  });

  it.each([
    ["/admin/importorder", "Quản lý đơn nhập"],
    ["/admin/importorder/order-1", "Chi tiết đơn hàng #order-1"],
      ["/admin/importordertemplate/0", "Chỉnh sửa mẫu hóa đơn"],
      ["/admin/exportordertemplate/0", "Chỉnh sửa mẫu hóa đơn"],
    ["/admin/orderedproducts", "Danh sách sản phẩm đã đặt"],
    ["/admin/exportorder", "Quản lý đơn xuất"],
    ["/admin/exportorder/order-1", "Chi tiết đơn hàng #order-1"],
    ["/admin/exportedproducts", "Danh sách sản phẩm đã xuất"],
  ])("renders the active inventory route %s", async (route, heading) => {
    window.history.pushState({}, "", route);

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <OrderProvider>
          <App />
        </OrderProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  });

  it.each([
    ["/admin/history/import", "Lịch sử nhập kho"],
    ["/admin/history/export", "Lịch sử xuất kho"],
    ["/admin/activity-log", "Lịch sử hoạt động"],
  ])("renders the active audit route %s", async (route, heading) => {
    window.history.pushState({}, "", route);

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <OrderProvider>
          <App />
        </OrderProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  });
});
