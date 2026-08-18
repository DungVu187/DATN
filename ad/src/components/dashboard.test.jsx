import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { beforeEach, describe, expect, it, vi } from "vitest";
import theme from "../theme";
import Dashboard from "./dashboard";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

const mockDashboardData = {
  period: {
    startDate: "2026-07-20",
    endDate: "2026-08-18",
  },
  summary: {
    revenue: 284650000,
    orderCount: 1248,
    newCustomerCount: 386,
    pendingOrderCount: 47,
    pendingOver2HoursCount: 12,
  },
  comparison: {
    revenuePercent: 12.8,
    orderPercent: 8.4,
    customerPercent: 16.2,
  },
  revenueByDate: [
    { date: "2026-08-01", revenue: 10000000, orderCount: 20 },
    { date: "2026-08-02", revenue: 15000000, orderCount: 30 },
  ],
  ordersByStatus: [
    { key: "Processing", label: "Chờ xác nhận", count: 47, color: "#1473E6" },
    { key: "Delivering", label: "Đang giao", count: 36, color: "#0284C7" },
    { key: "Completed", label: "Hoàn thành", count: 1128, color: "#2E9B45" },
    { key: "Cancelled", label: "Đã hủy", count: 9, color: "#E53935" },
  ],
  recentOrders: [
    {
      _id: "order-123",
      orderCode: "SO-28491",
      userName: "Công ty An Phát",
      total: 28400000,
      payment: false,
      status: "Processing",
      state: "Processing",
      createdAt: "2026-08-18T10:00:00.000Z",
    },
  ],
  lowStockProducts: [
    {
      _id: "prod-123",
      name: "PLC S7-1200",
      code: "PLC-1200",
      currentStock: 9,
      safetyStock: 25,
      status: "Sắp hết",
      deficit: 16,
      imgUrl: "",
    },
    {
      _id: "prod-456",
      name: "Van khí nén PV-063",
      code: "PV-063",
      currentStock: 0,
      safetyStock: 20,
      status: "Hết hàng",
      deficit: 20,
      imgUrl: "",
    },
  ],
};

describe("Dashboard Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    globalThis.ResizeObserver = ResizeObserverMock;
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes("/dashboard")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: mockDashboardData,
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });
  });

  it("renders loading state initially then displays complete KPI metrics from API without duplicate conflict", async () => {
    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Dashboard />
      </ThemeProvider>
    );

    // Initial heading
    expect(screen.getByRole("heading", { name: "Tổng quan" })).toBeInTheDocument();

    // After loading completes
    await waitFor(() => {
      // Check KPI values using container within
      const kpiRevenue = screen.getByTestId("kpi-revenue");
      expect(within(kpiRevenue).getByText(/284\.650\.000/)).toBeInTheDocument();

      const kpiOrders = screen.getByTestId("kpi-orders");
      expect(within(kpiOrders).getByText("1.248")).toBeInTheDocument();

      const kpiCustomers = screen.getByTestId("kpi-customers");
      expect(within(kpiCustomers).getByText("386")).toBeInTheDocument();

      const kpiPending = screen.getByTestId("kpi-pending-orders");
      expect(within(kpiPending).getByText("47")).toBeInTheDocument();

      // Check comparison percentage texts
      expect(screen.getByText(/\+12\.8%.*kỳ trước/)).toBeInTheDocument();
      expect(screen.getByText(/\+8\.4%.*kỳ trước/)).toBeInTheDocument();
      expect(screen.getByText(/\+16\.2%.*kỳ trước/)).toBeInTheDocument();
      expect(screen.getByText(/12 đơn đã chờ quá 2 giờ/)).toBeInTheDocument();
    });

    // Check recent orders
    expect(screen.getByText("#SO-28491")).toBeInTheDocument();
    expect(screen.getByText("Công ty An Phát")).toBeInTheDocument();

    // Check low stock products
    expect(screen.getByText("PLC S7-1200")).toBeInTheDocument();
    expect(screen.getByText("Thiếu 16")).toBeInTheDocument();
    expect(screen.getByText("Van khí nén PV-063")).toBeInTheDocument();
    expect(screen.getByText("Hết hàng")).toBeInTheDocument();
  });

  it("renders empty state for chart when all revenue values are 0", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes("/dashboard")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              ...mockDashboardData,
              revenueByDate: [
                { date: "2026-08-17", revenue: 0, orderCount: 0 },
                { date: "2026-08-18", revenue: 0, orderCount: 0 },
              ],
            },
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Dashboard />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Chưa có doanh thu")).toBeInTheDocument();
      expect(screen.getByText("Không có doanh thu trong khoảng thời gian đã chọn.")).toBeInTheDocument();
      expect(screen.getByText("Hãy chọn khoảng thời gian khác hoặc kiểm tra trạng thái thanh toán của đơn hàng.")).toBeInTheDocument();
      // Ensure no chart SVG with line/markers is rendered
      expect(screen.queryByTestId("revenue-chart-svg")).not.toBeInTheDocument();
      // Ensure no fake 1M or 330k axis labels
      expect(screen.queryByText(/1 triệu|330k|660k/i)).not.toBeInTheDocument();
    });
  });

  it("renders empty state for chart when revenueByDate array is empty", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes("/dashboard")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              ...mockDashboardData,
              revenueByDate: [],
            },
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Dashboard />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Chưa có doanh thu")).toBeInTheDocument();
      expect(screen.queryByTestId("revenue-chart-svg")).not.toBeInTheDocument();
    });
  });

  it("renders chart correctly when there is positive revenue data", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes("/dashboard")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              ...mockDashboardData,
              revenueByDate: [
                { date: "2026-08-16", revenue: 1000000, orderCount: 2 },
                { date: "2026-08-17", revenue: 4500000, orderCount: 5 },
                { date: "2026-08-18", revenue: 2800000, orderCount: 3 },
              ],
            },
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Dashboard />
      </ThemeProvider>
    );

    await waitFor(() => {
      // SVG chart is present
      const chartSvg = screen.getByTestId("revenue-chart-svg");
      expect(chartSvg).toBeInTheDocument();
      // Empty state is NOT displayed
      expect(screen.queryByText("Chưa có doanh thu")).not.toBeInTheDocument();
      // Check that markers are NOT rendered for all points (only 1 visible circle for the last point initially)
      const visibleCircles = chartSvg.querySelectorAll("circle");
      expect(visibleCircles.length).toBeLessThanOrEqual(2);
    });
  });

  it("handles invalid or non-numeric revenue values safely without crashing or showing NaN", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes("/dashboard")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              ...mockDashboardData,
              revenueByDate: [
                { date: "2026-08-16", revenue: null, orderCount: null },
                { date: "2026-08-17", revenue: undefined, orderCount: undefined },
                { date: "2026-08-18", revenue: "invalid", orderCount: "bad" },
              ],
            },
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Dashboard />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Chưa có doanh thu")).toBeInTheDocument();
      expect(document.body.textContent).not.toContain("NaN");
      expect(document.body.textContent).not.toContain("Infinity");
    });
  });

  it("renders error state with retry button on API failure", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes("/dashboard")) {
        callCount += 1;
        if (callCount === 1) {
          throw new Error("Lỗi kết nối mạng");
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: mockDashboardData,
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });

    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Dashboard />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Lỗi kết nối mạng")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    });

    // Click retry
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(() => {
      const kpiRevenue = screen.getByTestId("kpi-revenue");
      expect(within(kpiRevenue).getByText(/284\.650\.000/)).toBeInTheDocument();
    });
    expect(callCount).toBe(2);
  });

  it("changes date preset filter and refetches data", async () => {
    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Dashboard />
      </ThemeProvider>
    );

    await waitFor(() => {
      const kpiRevenue = screen.getByTestId("kpi-revenue");
      expect(within(kpiRevenue).getByText(/284\.650\.000/)).toBeInTheDocument();
    });

    // Click "7 ngày" preset button
    const btn7Days = screen.getByRole("button", { name: "7 ngày" });
    fireEvent.click(btn7Days);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
