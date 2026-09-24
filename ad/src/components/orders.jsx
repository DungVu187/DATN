
import React, { useState, useEffect, useCallback } from "react";
import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
  Select,
  MenuItem,
  TextField,
  FormControl,
  InputLabel,
  Button,
  Dialog,
  DialogTitle,
  DialogActions,
  DialogContent,
  Typography,
  Box,
  CircularProgress,
  Autocomplete,
} from "@mui/material";
import moment from "moment";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ALL_ORDER_FILTER,
  createInitialOrderFilters,
  getOrderNavigationFilterPatch,
} from "./orderFilters";
import { useOrderContext } from "../context/useordercontext";
import { usePermissions } from "../context/usepermissions";
import { getPaymentChip } from "../utils/orderpayment";
import { io } from "socket.io-client";
import {
  createAdminSalesOrderDraft,
  getSalesOrders,
  updateSalesOrderField,
} from "../api/salesOrderManagementApi";

const apiUrl = import.meta.env.VITE_API_URL;

const removeVietnameseTones = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
};

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalOrders, setTotalOrders] = useState(0);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canCreate = can("order.create");
  const [filters, setFilters] = useState(() => createInitialOrderFilters(location.state));
  const { setOrderChanged } = useOrderContext();

  const uniqueNames = React.useMemo(() => {
    const names = orders.map((o) => o.userName).filter(Boolean);
    return Array.from(new Set(names));
  }, [orders]);

  const uniquePhones = React.useMemo(() => {
    const phones = orders.map((o) => o.userPhone).filter(Boolean);
    return Array.from(new Set(phones));
  }, [orders]);

  const uniqueOrderCodes = React.useMemo(() => {
    const codes = orders.map((o) => o.orderCode).filter(Boolean);
    return Array.from(new Set(codes));
  }, [orders]);

  // Trạng thái bộ lọc đã được debounce
  const [debouncedFilters, setDebouncedFilters] = useState(filters);

  // Effect để debounce bộ lọc (các trường phone, id, name cần debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 500);
    return () => clearTimeout(timer);
  }, [filters]);

  // Hàm xử lý response API chung
  const runApiRequest = useCallback(async (responsePromise) => {
    try {
      const response = await responsePromise;

      if (response.status === 401 || response.status === 403) {
        toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        navigate("/login");
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Lỗi ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      toast.error(err.message);
      return null;
    }
  }, [navigate]);

  // Lấy danh sách đơn hàng
  const fetchOrders = useCallback(
    async (currentPage = 1) => {
      setLoading(true);
      const queryFilters = {
        ...debouncedFilters,
        status: debouncedFilters.status === ALL_ORDER_FILTER ? "" : debouncedFilters.status,
        payment: debouncedFilters.payment === ALL_ORDER_FILTER ? "" : debouncedFilters.payment,
        state: debouncedFilters.state === ALL_ORDER_FILTER ? "" : debouncedFilters.state,
      };

      const query = new URLSearchParams({
        page: currentPage,
        limit: rowsPerPage,
        ...queryFilters,
      }).toString();

      const data = await runApiRequest(getSalesOrders(query));
      if (data) {
        const formattedOrders = data.orders.map((order) => ({
          ...order,
          createdAt: moment(order.createdAt).format("HH:mm [ngày] DD-MM-YYYY"),
          completedAt: order.completedAt
            ? moment(order.completedAt).format("HH:mm [ngày] DD-MM-YYYY")
            : (order.status === "Completed" ? moment(order.createdAt).format("HH:mm [ngày] DD-MM-YYYY") : ""),
        }));
        setOrders(formattedOrders);
        setTotalOrders(data.total);
      }
      setLoading(false);
    },
    [runApiRequest, debouncedFilters, rowsPerPage]
  );

  // Cập nhật đơn hàng
  const updateOrder = async (_id, field, value) => {
    setConfirmAction({ _id, field, value, type: "update" });
    setIsConfirmDialogOpen(true);
  };

  // Xác nhận cập nhật
  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    const { _id, field, value, type } = confirmAction;
    try {
      if (type === "update") {
        const result = await runApiRequest(
          updateSalesOrderField(_id, field, value)
        );

        if (result?.success) {
          setOrders((prev) =>
            prev.map((order) => {
              if (order._id !== _id) return order;
              const updated = { ...order, [field]: value };
              if (field === "status") {
                // Lấy completedAt thật từ server (server sinh khi chuyển Completed) rồi format như fetchOrders
                updated.completedAt = result.order?.completedAt
                  ? moment(result.order.completedAt).format("HH:mm [ngày] DD-MM-YYYY")
                  : "";
              }
              return updated;
            })
          );
          toast.success(
            `Cập nhật ${field === "status" ? "trạng thái" : "thanh toán"} thành công`
          );

          // Trigger cập nhật Sidebar
          setOrderChanged((prev) => !prev);
        }
      }
    } finally {
      setIsConfirmDialogOpen(false);
      setConfirmAction(null);
    }
  };

  // Trigger lấy đơn hàng khi page hoặc fetchOrders thay đổi
  useEffect(() => {
    fetchOrders(page + 1);
  }, [page, fetchOrders]);

  // Xử lý bộ lọc được truyền từ Dashboard hoặc trang chi tiết
  useEffect(() => {
    const navigationFilterPatch = getOrderNavigationFilterPatch(location.state);
    if (navigationFilterPatch) {
      setFilters((prev) => ({ ...prev, ...navigationFilterPatch }));
      setPage(0);
    }
  }, [location.state]);

  useEffect(() => {
    let socketUrl = apiUrl;
    let socketOptions = {
      withCredentials: true,
      transports: ["websocket", "polling"],
    };

    try {
      const parsedUrl = new URL(apiUrl, window.location.origin);
      if (parsedUrl.pathname && parsedUrl.pathname !== "/") {
        socketUrl = parsedUrl.origin;
        socketOptions.path = parsedUrl.pathname.replace(/\/$/, "") + "/socket.io";
      }
    } catch (e) {
      console.warn("Lỗi phân tích cú pháp apiUrl cho socket:", e);
    }

    const socket = io(socketUrl, socketOptions);

    const handleOrderCreated = () => {
      toast.success("Có đơn hàng mới!");
      fetchOrders(page + 1); // Cập nhật trang hiện tại
      setOrderChanged((prev) => !prev); // Thông báo cho Sidebar
    };

    const handleOrderCancelled = () => {
      toast("Một đơn hàng vừa bị hủy");
      fetchOrders(page + 1);
      setOrderChanged((prev) => !prev);
    };

    socket.on("order_created", handleOrderCreated);
    socket.on("order_cancelled", handleOrderCancelled);

    return () => {
      socket.off("order_created", handleOrderCreated);
      socket.off("order_cancelled", handleOrderCancelled);
      socket.disconnect();
    };
  }, [fetchOrders, page, setOrderChanged]);

  // Xử lý thay đổi bộ lọc
  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(0); // Reset về trang đầu tiên khi đổi bộ lọc
  };

  const handleApplyFilters = () => {
    setDebouncedFilters(filters);
    setPage(0);
  };

  // Xử lý phân trang
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Tạo đơn nháp rỗng rồi chuyển sang trang chi tiết để nhập dần (giống đơn nhập/xuất)
  const createAdminDraftOrder = async () => {
    const result = await runApiRequest(createAdminSalesOrderDraft());

    if (result?.success) {
      toast.success("Tạo đơn hàng mới thành công");
      setOrderChanged((prev) => !prev);
      navigate(`/salesorder/${result.order._id}`);
    }
  };

  // Lấy nhãn trạng thái
  const getStatusLabel = (order) => {
    if (!order) return "";
    if (order.state === "Cancelled") return "Đã hủy";
    switch (order.status) {
      case "Processing":
        return "Đang xử lý";
      case "Delivering":
        return "Đang giao";
      case "Completed":
        return "Hoàn thành";
      default:
        return order.status;
    }
  };

  // Lấy màu trạng thái
  const getStatusColor = (order) => {
    if (!order) return "default";
    if (order.state === "Cancelled") return "error";
    switch (order.status) {
      case "Processing":
        return "warning";
      case "Delivering":
        return "info";
      case "Completed":
        return "success";
      default:
        return "default";
    }
  };

  // Lấy trạng thái tiếp theo
  const getNextStatus = (currentStatus) => {
    switch (currentStatus) {
      case "Processing":
        return "Delivering";
      case "Delivering":
        return "Completed";
      default:
        return currentStatus; // Không cho phép quay lại Processing
    }
  };

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" p={3}>
        <CircularProgress />
        <Typography mt={2}>Đang tải danh sách đơn hàng...</Typography>
      </Box>
    );
  }

  return (
    <Box p={3} className="admin-list-page">
      <div className="sticky-header">
        <Typography variant="h4" sx={{ mb: "12px !important" }}>
          Quản lý đơn hàng bán
        </Typography>
        <Box
          className="sales-order-filters"
          display="flex"
          columnGap={2}
          rowGap={4}
          mb={2}
          flexWrap="wrap"
          sx={{
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "stretch", sm: "flex-start" }
          }}
        >
          {canCreate && (
            <Button
              variant="contained"
              onClick={createAdminDraftOrder}
              sx={{
                height: 40,
                minWidth: { xs: "100%", sm: 170 },
                flexShrink: 0,
              }}
            >
              Tạo đơn hàng mới
            </Button>
          )}

          <Autocomplete
            freeSolo
            size="small"
            options={uniqueOrderCodes}
            value={filters.id}
            onInputChange={(event, newInputValue) => {
              setFilters((prev) => ({ ...prev, id: newInputValue }));
            }}
            onChange={(event, newValue) => {
              setFilters((prev) => ({ ...prev, id: newValue || "" }));
            }}
            filterOptions={(options, state) => {
              const inputValue = removeVietnameseTones(state.inputValue);
              return options.filter((option) =>
                removeVietnameseTones(option).includes(inputValue)
              );
            }}
            sx={{ width: { xs: "100%", sm: 200 } }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Mã đơn hàng"
                placeholder="Nhập mã đơn..."
                variant="outlined"
              />
            )}
          />

          <Autocomplete
            freeSolo
            size="small"
            options={uniquePhones}
            value={filters.phone}
            onInputChange={(event, newInputValue) => {
              setFilters((prev) => ({ ...prev, phone: newInputValue }));
            }}
            onChange={(event, newValue) => {
              setFilters((prev) => ({ ...prev, phone: newValue || "" }));
            }}
            filterOptions={(options, state) => {
              const inputValue = removeVietnameseTones(state.inputValue);
              return options.filter((option) =>
                removeVietnameseTones(option).includes(inputValue)
              );
            }}
            sx={{ width: { xs: "100%", sm: 175 } }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Số điện thoại"
                placeholder="Nhập số điện thoại..."
                variant="outlined"
              />
            )}
          />

          <Autocomplete
            freeSolo
            size="small"
            options={uniqueNames}
            value={filters.name}
            onInputChange={(event, newInputValue) => {
              setFilters((prev) => ({ ...prev, name: newInputValue }));
            }}
            onChange={(event, newValue) => {
              setFilters((prev) => ({ ...prev, name: newValue || "" }));
            }}
            filterOptions={(options, state) => {
              const inputValue = removeVietnameseTones(state.inputValue);
              return options.filter((option) =>
                removeVietnameseTones(option).includes(inputValue)
              );
            }}
            sx={{ width: { xs: "100%", sm: 175 } }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Tên người dùng"
                placeholder="Nhập tên..."
                variant="outlined"
              />
            )}
          />

          <FormControl sx={{ minWidth: { xs: "100%", sm: 110 }, width: { xs: "100%", sm: 110 } }}>
            <InputLabel>Trạng thái</InputLabel>
            <Select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              label="Trạng thái"
              size="small"
              MenuProps={{ disableScrollLock: true }}
            >
              <MenuItem value="Tất cả">Tất cả</MenuItem>
              <MenuItem value="Processing">Đang xử lý</MenuItem>
              <MenuItem value="Delivering">Đang giao</MenuItem>
              <MenuItem value="Completed">Hoàn thành</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: { xs: "100%", sm: 110 }, width: { xs: "100%", sm: 110 } }}>
            <InputLabel>Thanh toán</InputLabel>
            <Select
              name="payment"
              value={filters.payment}
              onChange={handleFilterChange}
              label="Thanh toán"
              size="small"
              MenuProps={{ disableScrollLock: true }}
            >
              <MenuItem value="Tất cả">Tất cả</MenuItem>
              <MenuItem value="true">Đã thanh toán</MenuItem>
              <MenuItem value="false">Chưa thanh toán</MenuItem>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: { xs: "100%", sm: 115 }, width: { xs: "100%", sm: 115 } }}>
            <InputLabel>Tình trạng</InputLabel>
            <Select
              name="state"
              value={filters.state}
              onChange={handleFilterChange}
              label="Tình trạng"
              size="small"
              MenuProps={{ disableScrollLock: true }}
            >
              <MenuItem value="Processing">Đang chờ</MenuItem>
              <MenuItem value="Cancelled">Đã hủy</MenuItem>
            </Select>
          </FormControl>

          <TextField
            name="startDate"
            label="Từ ngày"
            type="date"
            value={filters.startDate}
            onChange={handleFilterChange}
            variant="outlined"
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: "100%", sm: 140 } }}
          />

          <TextField
            name="endDate"
            label="Đến ngày"
            type="date"
            value={filters.endDate}
            onChange={handleFilterChange}
            variant="outlined"
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: "100%", sm: 140 } }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleApplyFilters}
            sx={{
              height: 40,
              minWidth: { xs: "100%", sm: 80 },
              flexShrink: 0,
            }}
          >
            Lọc
          </Button>
        </Box>
      </div>

      <TableContainer component={Paper} className="admin-list-table" sx={{ overflow: "auto" }}>
        <Table stickyHeader sx={{ minWidth: 1000, tableLayout: "fixed" }}>
          <TableHead>
            <TableRow>
              <TableCell align="center">Mã đơn hàng</TableCell>
              <TableCell align="center">Số điện thoại</TableCell>
              <TableCell align="center">Tên người dùng</TableCell>
              <TableCell align="center">Tổng tiền</TableCell>
              <TableCell align="center">Trạng thái</TableCell>
              <TableCell align="center">Thanh toán</TableCell>
              <TableCell align="center">Tạo lúc</TableCell>
              <TableCell align="center">Hoàn thành lúc</TableCell>
              <TableCell align="center">Hành động</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order._id}>
                <TableCell align="center">{order.orderCode || order._id}</TableCell>
                <TableCell align="center">{order.userPhone}</TableCell>
                <TableCell align="center">{order.userName || "N/A"}</TableCell>
                <TableCell align="center">
                  {Number(order.total).toLocaleString("vi-VN")} ₫
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={getStatusLabel(order)}
                    color={getStatusColor(order)}
                    onClick={() => {
                      if (order.state === "Cancelled" || order.status === "Completed") return;
                      updateOrder(
                        order._id,
                        "status",
                        getNextStatus(order.status)
                      );
                    }}
                    clickable={order.state !== "Cancelled" && order.status !== "Completed"}
                    sx={{
                      cursor:
                        order.state === "Cancelled" || order.status === "Completed" ? "default" : "pointer",
                    }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={getPaymentChip(order).label}
                    color={getPaymentChip(order).color}
                    onClick={order.paymentMethod === "SEPAY" || order.state === "Cancelled" ? undefined : () => updateOrder(order._id, "payment", !order.payment)}
                    clickable={order.paymentMethod !== "SEPAY" && order.state !== "Cancelled"}
                  />
                </TableCell>
                <TableCell align="center">{order.createdAt}</TableCell>
                <TableCell align="center">{order.completedAt || ""}</TableCell>
                <TableCell align="center">
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => navigate(`/salesorder/${order._id}`)}
                  >
                    Chi tiết
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={totalOrders}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />

      <Dialog
        open={isConfirmDialogOpen}
        onClose={() => setIsConfirmDialogOpen(false)}
        disableScrollLock
      >
        <DialogTitle>Xác nhận hành động</DialogTitle>
        <DialogContent>
          <Typography>
            Bạn có chắc chắn muốn{" "}
            {confirmAction?.type === "cancel"
              ? "hủy đơn hàng này"
              : `cập nhật ${confirmAction?.field === "status"
                ? "trạng thái"
                : "thanh toán"
              }`}
            ?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsConfirmDialogOpen(false)}>Hủy</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirmAction}
          >
            Xác nhận
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Orders;
