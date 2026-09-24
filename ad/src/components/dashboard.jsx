import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  DateRange as DateRangeIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShoppingBag as ShoppingBagIcon,
  Person as PersonIcon,
  PriorityHigh as PriorityHighIcon,
  AttachMoney as MoneyIcon,
  ChevronRight as ChevronRightIcon,
  InboxOutlined as EmptyIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import { getDashboardData } from "../api/dashboardApi";
import { getAuthFailure } from "../api/httpClient";
import { getPaymentChip } from "../utils/orderpayment";
import "./style/dashboard.css";

const PRESET_OPTIONS = [
  { key: "today", label: "Hôm nay", days: 0 },
  { key: "7days", label: "7 ngày", days: 7 },
  { key: "30days", label: "30 ngày", days: 30 },
  { key: "custom", label: "Tùy chỉnh", days: null },
];

const formatCurrency = (amount) => {
  if (typeof amount !== "number" || isNaN(amount)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatNumber = (num) => {
  if (typeof num !== "number" || isNaN(num)) return "0";
  return new Intl.NumberFormat("vi-VN").format(num);
};

const formatYAxisTick = (val) => {
  if (typeof val !== "number" || isNaN(val) || !isFinite(val) || val <= 0) {
    return "0 ₫";
  }
  if (val >= 1000000000) {
    const formatted = (val / 1000000000).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
    return `${formatted} tỷ`;
  }
  if (val >= 1000000) {
    const formatted = (val / 1000000).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
    return `${formatted} triệu`;
  }
  if (val >= 1000) {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(val);
  }
  return `${val.toLocaleString("vi-VN")} ₫`;
};

const getCleanCeiling = (rawMax) => {
  if (!rawMax || rawMax <= 0 || isNaN(rawMax) || !isFinite(rawMax)) return 0;
  const target = rawMax * 1.15;
  const power = Math.floor(Math.log10(target));
  const base = Math.pow(10, power);
  const fraction = target / base;
  let factor = 10;
  if (fraction <= 1) factor = 1;
  else if (fraction <= 1.5) factor = 1.5;
  else if (fraction <= 2) factor = 2;
  else if (fraction <= 2.5) factor = 2.5;
  else if (fraction <= 3) factor = 3;
  else if (fraction <= 4) factor = 4;
  else if (fraction <= 5) factor = 5;
  else if (fraction <= 6) factor = 6;
  else if (fraction <= 8) factor = 8;
  else factor = 10;
  return factor * base;
};

const getVietnameseDateString = () => {
  const days = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  const now = new Date();
  const dayName = days[now.getDay()];
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${dayName}, ngày ${day} tháng ${month} năm ${year}`;
};

/**
 * Chart Empty State Component
 */
const ChartEmptyState = () => (
  <div className="chart-empty-state-container" data-testid="chart-empty-state">
    <EmptyIcon sx={{ fontSize: 44, color: "#CBD7E3", mb: 1 }} />
    <Typography className="chart-empty-title">Chưa có doanh thu</Typography>
    <Typography className="chart-empty-desc">Không có doanh thu trong khoảng thời gian đã chọn.</Typography>
    <Typography className="chart-empty-hint">Hãy chọn khoảng thời gian khác hoặc kiểm tra trạng thái thanh toán của đơn hàng.</Typography>
  </div>
);

/**
 * Lightweight SVG Area Chart Component
 */
const RevenueAreaChart = ({ data = [] }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const hasRevenueData = useMemo(() => {
    return Array.isArray(data) && data.some((item) => {
      const rev = Number(item?.revenue);
      return !isNaN(rev) && isFinite(rev) && rev > 0;
    });
  }, [data]);

  const chartData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.map((item) => {
      const rev = Number(item?.revenue);
      const orders = Number(item?.orderCount);
      return {
        date: typeof item?.date === "string" ? item.date : "",
        revenue: isNaN(rev) || !isFinite(rev) || rev < 0 ? 0 : rev,
        orderCount: isNaN(orders) || !isFinite(orders) || orders < 0 ? 0 : orders,
      };
    });
  }, [data]);

  const maxRevenue = useMemo(() => {
    if (!hasRevenueData || chartData.length === 0) return 0;
    const rawMax = Math.max(...chartData.map((d) => d.revenue));
    return getCleanCeiling(rawMax);
  }, [chartData, hasRevenueData]);

  if (!hasRevenueData || chartData.length === 0) {
    return <ChartEmptyState />;
  }

  const width = 600;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 35, left: 65 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const points = chartData.map((d, i) => {
    const x =
      chartData.length > 1
        ? padding.left + (i / (chartData.length - 1)) * graphWidth
        : padding.left + graphWidth / 2;
    const y =
      maxRevenue > 0
        ? padding.top + graphHeight - (d.revenue / maxRevenue) * graphHeight
        : padding.top + graphHeight;
    return { ...d, x, y };
  });

  // Generate smooth SVG path using Catmull-Rom or Cubic Bezier
  const pathD = points.reduce((acc, point, i, arr) => {
    if (i === 0) return `M ${point.x},${point.y}`;
    const prev = arr[i - 1];
    const cp1x = prev.x + (point.x - prev.x) / 2;
    const cp1y = prev.y;
    const cp2x = prev.x + (point.x - prev.x) / 2;
    const cp2y = point.y;
    return `${acc} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${point.x},${point.y}`;
  }, "");

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x},${padding.top + graphHeight} L ${points[0].x},${padding.top + graphHeight} Z`
    : "";

  // Generate 4 Y axis ticks
  const yTicks = [
    0,
    (maxRevenue * 1) / 3,
    (maxRevenue * 2) / 3,
    maxRevenue,
  ];

  // Select evenly spaced X axis labels (~5-7 points max)
  const xLabels = (() => {
    if (points.length <= 6) return points;
    const count = 6;
    const step = (points.length - 1) / (count - 1);
    const indices = new Set();
    for (let i = 0; i < count; i++) {
      indices.add(Math.round(i * step));
    }
    return points.filter((_, idx) => indices.has(idx));
  })();

  const hoverColWidth = points.length > 1 ? graphWidth / (points.length - 1) : graphWidth;

  return (
    <div className="chart-container-box">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        data-testid="revenue-chart-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1473E6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1473E6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Y Grid lines and labels */}
        {yTicks.map((val, idx) => {
          const y = padding.top + graphHeight - (val / maxRevenue) * graphHeight;
          return (
            <g key={`y-grid-${idx}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#E5EAF0"
                strokeDasharray={idx === 0 ? "none" : "3,3"}
              />
              <text
                x={padding.left - 8}
                y={y + 3.5}
                fill="#64748B"
                fontSize="10"
                textAnchor="end"
                fontFamily="inherit"
                fontWeight="500"
              >
                {formatYAxisTick(val)}
              </text>
            </g>
          );
        })}

        {/* Area fill under curve */}
        <path d={areaD} fill="url(#revenueGradient)" />

        {/* Main curved line */}
        <path
          d={pathD}
          fill="none"
          stroke="#1473E6"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Visible points: only hovered point and last data point */}
        {points.map((pt, idx) => {
          const isHovered = hoveredPoint?.date === pt.date;
          const isLast = idx === points.length - 1;

          if (!isHovered && !isLast) {
            return null;
          }

          return (
            <circle
              key={`visible-pt-${idx}`}
              cx={pt.x}
              cy={pt.y}
              r={isHovered ? 5 : 3.5}
              fill={isHovered ? "#FFFFFF" : "#1473E6"}
              stroke="#1473E6"
              strokeWidth={isHovered ? 2.5 : 1.5}
              pointerEvents="none"
            />
          );
        })}

        {/* Invisible hover interaction hit areas for each point */}
        {points.map((pt, idx) => (
          <rect
            key={`hit-${idx}`}
            x={pt.x - hoverColWidth / 2}
            y={padding.top}
            width={hoverColWidth}
            height={graphHeight}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredPoint(pt)}
            onMouseLeave={() => setHoveredPoint(null)}
            aria-label={`Ngày ${moment(pt.date).format("DD/MM/YYYY")}: ${formatCurrency(pt.revenue)}`}
          />
        ))}

        {/* X Axis labels */}
        {xLabels.map((pt, idx) => {
          const formattedDate = moment(pt.date).format("DD/MM");
          return (
            <text
              key={`x-lbl-${idx}`}
              x={pt.x}
              y={height - 10}
              fill="#64748B"
              fontSize="10"
              textAnchor="middle"
              fontFamily="inherit"
              fontWeight="500"
            >
              {formattedDate}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredPoint && (
        <div
          className="chart-tooltip"
          style={{
            left: `${Math.min(88, Math.max(12, (hoveredPoint.x / width) * 100))}%`,
            top: `${Math.max(10, (hoveredPoint.y / height) * 100)}%`,
          }}
        >
          <div className="chart-tooltip-date">{moment(hoveredPoint.date).format("DD/MM/YYYY")}</div>
          <div className="chart-tooltip-revenue">Doanh thu: {formatCurrency(hoveredPoint.revenue)}</div>
          <div className="chart-tooltip-orders">Đơn hàng: {hoveredPoint.orderCount} đơn</div>
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [activePreset, setActivePreset] = useState("30days");
  const [dateRange, setDateRange] = useState({
    startDate: moment().subtract(29, "days").format("YYYY-MM-DD"),
    endDate: moment().format("YYYY-MM-DD"),
  });

  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [tempCustomRange, setTempCustomRange] = useState(dateRange);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);

  const fetchData = useCallback(async (start, end) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getDashboardData({ startDate: start, endDate: end });

      const authError = getAuthFailure(response);
      if (authError) {
        navigate("/login");
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Lỗi tải dữ liệu (${response.status})`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        setDashboardData(result.data);
      } else {
        throw new Error(result.message || "Dữ liệu không hợp lệ");
      }
    } catch (err) {
      setError(err.message || "Không thể kết nối đến máy chủ");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchData(dateRange.startDate, dateRange.endDate);
  }, [fetchData, dateRange.startDate, dateRange.endDate]);

  const handlePresetClick = (preset) => {
    setActivePreset(preset.key);
    if (preset.key === "custom") {
      setTempCustomRange(dateRange);
      setCustomRangeOpen(true);
      return;
    }

    const end = moment().format("YYYY-MM-DD");
    let start = end;
    if (preset.days > 0) {
      start = moment().subtract(preset.days - 1, "days").format("YYYY-MM-DD");
    }

    setDateRange({ startDate: start, endDate: end });
  };

  const handleApplyCustomRange = () => {
    if (tempCustomRange.startDate && tempCustomRange.endDate) {
      setDateRange(tempCustomRange);
      setActivePreset("custom");
      setCustomRangeOpen(false);
    }
  };

  const summary = dashboardData?.summary || {
    revenue: 0,
    orderCount: 0,
    newCustomerCount: 0,
    pendingOrderCount: 0,
    pendingOver2HoursCount: 0,
  };

  const comparison = dashboardData?.comparison || {
    revenuePercent: 0,
    orderPercent: 0,
    customerPercent: 0,
  };

  const revenueByDate = dashboardData?.revenueByDate || [];
  const ordersByStatus = dashboardData?.ordersByStatus || [];
  const recentOrders = dashboardData?.recentOrders || [];
  const lowStockProducts = dashboardData?.lowStockProducts || [];

  const renderTrend = (percent) => {
    if (percent === 0) {
      return <span className="kpi-note-neutral">0% so với kỳ trước</span>;
    }
    const isUp = percent > 0;
    return (
      <span className={isUp ? "kpi-trend-up" : "kpi-trend-down"}>
        {isUp ? <TrendingUpIcon fontSize="inherit" /> : <TrendingDownIcon fontSize="inherit" />}
        {" "}
        {isUp ? `+${percent}%` : `${percent}%`} so với kỳ trước
      </span>
    );
  };

  return (
    <Box className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Tổng quan</h1>
          <div className="dashboard-date-label">{getVietnameseDateString()}</div>
        </div>

        <div className="dashboard-filter-group">
          {PRESET_OPTIONS.map((preset) => (
            <Button
              key={preset.key}
              className={`dashboard-filter-btn ${activePreset === preset.key ? "active" : ""}`}
              onClick={() => handlePresetClick(preset)}
            >
              {preset.key === "custom" && <DateRangeIcon fontSize="small" sx={{ mr: 0.5 }} />}
              {preset.key === "custom" && activePreset === "custom"
                ? `${moment(dateRange.startDate).format("DD/MM")} - ${moment(dateRange.endDate).format("DD/MM/YYYY")}`
                : preset.label}
            </Button>
          ))}

          <IconButton
            size="small"
            title="Tải lại dữ liệu"
            aria-label="Tải lại dữ liệu"
            onClick={() => fetchData(dateRange.startDate, dateRange.endDate)}
            sx={{ backgroundColor: "#FFFFFF", border: "1px solid #E5EAF0" }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="dashboard-error-box">
          <span className="dashboard-error-text">{error}</span>
          <Button
            variant="outlined"
            size="small"
            color="error"
            onClick={() => fetchData(dateRange.startDate, dateRange.endDate)}
          >
            Thử lại
          </Button>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="dashboard-kpi-grid">
        {/* KPI 1: Doanh thu */}
        <div className="dashboard-kpi-card" data-testid="kpi-revenue">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Tổng doanh thu</span>
            <div className="kpi-card-icon kpi-icon-blue">
              <MoneyIcon fontSize="inherit" />
            </div>
          </div>
          <div className="kpi-card-value">
            {loading ? <CircularProgress size={22} /> : formatCurrency(summary.revenue)}
          </div>
          <div className="kpi-card-comparison">
            {!loading && renderTrend(comparison.revenuePercent)}
          </div>
        </div>

        {/* KPI 2: Tổng đơn hàng */}
        <div className="dashboard-kpi-card" data-testid="kpi-orders">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Đơn hàng</span>
            <div className="kpi-card-icon kpi-icon-green">
              <ShoppingBagIcon fontSize="inherit" />
            </div>
          </div>
          <div className="kpi-card-value">
            {loading ? <CircularProgress size={22} /> : formatNumber(summary.orderCount)}
          </div>
          <div className="kpi-card-comparison">
            {!loading && renderTrend(comparison.orderPercent)}
          </div>
        </div>

        {/* KPI 3: Khách hàng mới */}
        <div className="dashboard-kpi-card" data-testid="kpi-customers">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Khách hàng mới</span>
            <div className="kpi-card-icon kpi-icon-orange">
              <PersonIcon fontSize="inherit" />
            </div>
          </div>
          <div className="kpi-card-value">
            {loading ? <CircularProgress size={22} /> : formatNumber(summary.newCustomerCount)}
          </div>
          <div className="kpi-card-comparison">
            {!loading && renderTrend(comparison.customerPercent)}
          </div>
        </div>

        {/* KPI 4: Đơn chờ xử lý */}
        <div className="dashboard-kpi-card" data-testid="kpi-pending-orders">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Đơn chờ xử lý</span>
            <div className="kpi-card-icon kpi-icon-red">
              <PriorityHighIcon fontSize="inherit" />
            </div>
          </div>
          <div className="kpi-card-value">
            {loading ? <CircularProgress size={22} /> : formatNumber(summary.pendingOrderCount)}
          </div>
          <div className="kpi-card-comparison">
            {!loading && (
              <span className="kpi-note-neutral">
                {summary.pendingOver2HoursCount > 0
                  ? `${summary.pendingOver2HoursCount} đơn đã chờ quá 2 giờ`
                  : "Cần xử lý sớm"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Section: Chart & Order Status */}
      <div className="dashboard-main-grid">
        {/* Left: Revenue Area Chart */}
        <div className="dashboard-section-card">
          <div className="card-title-row">
            <div>
              <h2 className="card-main-title">Doanh thu theo thời gian</h2>
              <p className="card-subtitle">
                {activePreset === "today"
                  ? "Doanh thu hôm nay"
                  : `Doanh thu từ ${moment(dateRange.startDate).format("DD/MM")} đến ${moment(dateRange.endDate).format("DD/MM/YYYY")}`}
              </p>
            </div>
          </div>
          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" height={260}>
              <CircularProgress />
            </Box>
          ) : (
            <RevenueAreaChart data={revenueByDate} />
          )}
        </div>

        {/* Right: Orders by Status */}
        <div className="dashboard-section-card">
          <div className="card-title-row">
            <div>
              <h2 className="card-main-title">Trạng thái đơn hàng</h2>
              <p className="card-subtitle">Tổng số đơn hiện tại theo trạng thái</p>
            </div>
          </div>

          <div className="status-list">
            {ordersByStatus.map((st) => (
              <div
                key={st.key}
                className="status-row-item"
                onClick={() => navigate("/order", { state: { statusFilter: st.key } })}
              >
                <div className="status-item-left">
                  <span className="status-dot" style={{ backgroundColor: st.color }} />
                  <span className="status-item-name">{st.label}</span>
                </div>
                <span className="status-item-count">{formatNumber(st.count)}</span>
              </div>
            ))}
          </div>

          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={() => navigate("/order")}
            sx={{ mt: "auto" }}
          >
            Xem danh sách đơn hàng
          </Button>
        </div>
      </div>

      {/* Bottom Section: Recent Orders & Low Stock */}
      <div className="dashboard-main-grid">
        {/* Left: Recent Orders Table */}
        <div className="dashboard-section-card">
          <div className="card-title-row">
            <div>
              <h2 className="card-main-title">Đơn hàng gần đây</h2>
              <p className="card-subtitle">Các đơn mới nhất</p>
            </div>
            <Button
              size="small"
              endIcon={<ChevronRightIcon />}
              onClick={() => navigate("/order")}
              sx={{ color: "#1473E6", textTransform: "none", fontWeight: 600 }}
            >
              Xem tất cả
            </Button>
          </div>

          {loading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : recentOrders.length === 0 ? (
            <div className="dashboard-empty-state">
              <EmptyIcon />
              <Typography variant="body2">Chưa có đơn hàng nào</Typography>
            </div>
          ) : (
            <div className="dashboard-table-wrapper">
              <table className="dashboard-custom-table">
                <thead>
                  <tr>
                    <th>MÃ ĐƠN</th>
                    <th>KHÁCH HÀNG</th>
                    <th>TỔNG TIỀN</th>
                    <th>THANH TOÁN</th>
                    <th>TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => {
                    const isCancelled = order.state === "Cancelled";
                    let statusClass = "chip-status-processing";
                    let statusLabel = "Chờ xác nhận";

                    if (isCancelled) {
                      statusClass = "chip-status-cancelled";
                      statusLabel = "Đã hủy";
                    } else if (order.status === "Delivering") {
                      statusClass = "chip-status-delivering";
                      statusLabel = "Đang giao";
                    } else if (order.status === "Completed") {
                      statusClass = "chip-status-completed";
                      statusLabel = "Hoàn thành";
                    }

                    return (
                      <tr key={order._id}>
                        <td>
                          <span
                            className="order-code-link"
                            onClick={() => navigate(`/salesorder/${order._id}`)}
                          >
                            #{order.orderCode || order._id.slice(-6)}
                          </span>
                        </td>
                        <td>{order.userName || order.userPhone || "Khách lẻ"}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(order.total)}</td>
                        <td>
                          <span style={{ color: order.payment ? "#2E9B45" : "#64748B", fontWeight: 500 }}>
                            {getPaymentChip(order).label}
                          </span>
                        </td>
                        <td>
                          <span className={`chip-status-custom ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Low Stock Products */}
        <div className="dashboard-section-card">
          <div className="card-title-row">
            <div>
              <h2 className="card-main-title">Sắp hết hàng</h2>
              <p className="card-subtitle">Cần bổ sung tồn kho</p>
            </div>
          </div>

          {loading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : lowStockProducts.length === 0 ? (
            <div className="dashboard-empty-state">
              <EmptyIcon />
              <Typography variant="body2">Tất cả sản phẩm đều đủ tồn kho an toàn</Typography>
            </div>
          ) : (
            <div className="low-stock-list">
              {lowStockProducts.map((prod) => {
                const isOutOfStock = prod.status === "Hết hàng";
                const initials = (prod.name || "SP")
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase();

                return (
                  <div
                    key={prod._id}
                    className="low-stock-item"
                    onClick={() => navigate(`/product/${prod._id}`)}
                  >
                    <div className="low-stock-left">
                      <div className="low-stock-avatar">
                        {prod.imgUrl ? (
                          <img src={prod.imgUrl} alt={prod.name} />
                        ) : (
                          initials
                        )}
                      </div>
                      <div className="low-stock-info">
                        <div className="low-stock-name" title={prod.name}>
                          {prod.name}
                        </div>
                        <div className="low-stock-sub">
                          Còn {prod.currentStock} / mức an toàn {prod.safetyStock}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`chip-status-custom ${isOutOfStock ? "chip-stock-out" : "chip-stock-low"
                        }`}
                    >
                      {isOutOfStock ? "Hết hàng" : `Thiếu ${prod.deficit}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Custom Date Range Picker Dialog */}
      <Dialog
        open={customRangeOpen}
        onClose={() => setCustomRangeOpen(false)}
        maxWidth="xs"
        fullWidth
        disableScrollLock
      >
        <DialogTitle>Chọn khoảng thời gian tùy chỉnh</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              label="Từ ngày"
              type="date"
              size="small"
              value={tempCustomRange.startDate}
              onChange={(e) =>
                setTempCustomRange((prev) => ({ ...prev, startDate: e.target.value }))
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Đến ngày"
              type="date"
              size="small"
              value={tempCustomRange.endDate}
              onChange={(e) =>
                setTempCustomRange((prev) => ({ ...prev, endDate: e.target.value }))
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustomRangeOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleApplyCustomRange}>
            Áp dụng
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard;
