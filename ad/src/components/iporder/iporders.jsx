
import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Checkbox,
  Pagination,
  CircularProgress,
  Alert,
  Typography,
  Box,
  Collapse,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  LinearProgress,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TuneIcon from "@mui/icons-material/Tune";
import moment from "moment";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  completeImportOrder,
  createImportOrder,
  createInventoryOrderTemplate,
  deleteInventoryOrderTemplate,
  getInventoryOrderTemplates,
  getInventoryProductsByIds,
  listImportOrders,
} from "../../api/inventoryOrderAdministrationApi";

const removeVietnameseTones = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
};

const IpOrders = () => {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState({});
  const [productDetails, setProductDetails] = useState({});
  const [orderTemplates, setOrderTemplates] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(null);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [filterOrderName, setFilterOrderName] = useState("");
  const [filterUserName, setFilterUserName] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [debouncedOrderName, setDebouncedOrderName] = useState("");
  const [debouncedUserName, setDebouncedUserName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedOrderName(filterOrderName);
    }, 500);
    return () => clearTimeout(handler);
  }, [filterOrderName]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedUserName(filterUserName);
    }, 500);
    return () => clearTimeout(handler);
  }, [filterUserName]);

  const uniqueOrderNames = React.useMemo(() => {
    const names = orders.map((o) => o.orderName).filter(Boolean);
    return Array.from(new Set(names));
  }, [orders]);

  const uniqueUserNames = React.useMemo(() => {
    const names = orders.map((o) => o.userName).filter(Boolean);
    return Array.from(new Set(names));
  }, [orders]);

  const fetchOrders = async (
    page = 1,
    orderName = debouncedOrderName,
    userName = debouncedUserName
  ) => {
    try {
      setLoading(true);
      setError(null);
      const response = await listImportOrders({
        page,
        orderName,
        userName,
        status: filterStatus === "all" ? "" : filterStatus,
        startDate: filterStartDate,
        endDate: filterEndDate,
      });

      if (response.status === 401 || response.status === 403) {
        setError("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        navigate("/login");
        return;
      }

      if (!response.ok) {
        throw new Error("Bạn không có quyền thực hiện thao tác này");
      }

      const data = await response.json();
      setOrders(data.orders || []);
      setPagination(data.pagination || {});
      setCurrentPage(data.pagination?.currentPage || 1);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderTemplates = async () => {
    try {
      const response = await getInventoryOrderTemplates();

      if (response.status === 401 || response.status === 403) {
        setError("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        navigate("/login");
        return;
      }

      if (!response.ok) throw new Error("Lỗi khi lấy danh sách mẫu hóa đơn");
      const data = await response.json();
      setOrderTemplates(data.orderTemplates || []);
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi lấy danh sách mẫu hóa đơn");
    }
  };

  const fetchProductDetails = async (productIds) => {
    try {
      const response = await getInventoryProductsByIds(productIds);

      if (response.status === 401 || response.status === 403) {
        setError("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        navigate("/login");
        return {};
      }

      if (!response.ok) throw new Error("Lỗi khi lấy thông tin sản phẩm");
      const result = await response.json();
      return result.products.reduce((acc, product) => {
        acc[product._id] = product;
        return acc;
      }, {});
    } catch (error) {
      console.error("Lỗi khi lấy thông tin sản phẩm:", error);
      toast.error("Lỗi khi lấy thông tin sản phẩm");
      return {};
    }
  };

  const handleExpandClick = async (orderId) => {
    if (expandedRows[orderId]) {
      setExpandedRows({ ...expandedRows, [orderId]: false });
      return;
    }

    const order = orders.find((o) => o._id === orderId);
    const productsToFetch = order.productList
      .filter((p) => p.quantityRe < p.quantity)
      .map((p) => p.productId);

    if (productsToFetch.length > 0) {
      const products = await fetchProductDetails(productsToFetch);
      setProductDetails((prev) => ({
        ...prev,
        [orderId]: products,
      }));
    }

    setExpandedRows({ ...expandedRows, [orderId]: true });
  };

  const handleCreateNewOrder = async () => {
    try {
      const response = await createImportOrder({
        userName: "admin",
        productList: [],
      });

      if (response.status === 401 || response.status === 403) {
        setError("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        navigate("/login");
        return;
      }

      const result = await response.json();
      if (response.status === 201) {
        toast.success("Tạo đơn hàng mới thành công");
        navigate(`/importorder/${result._id}`);
      } else {
        throw new Error(result.message || "Lỗi khi tạo đơn hàng");
      }
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    }
  };

  const handleCreateOrderFromTemplate = async (template) => {
    try {
      const productIds = template.products.map((p) => p.productId);
      const productDetails = await fetchProductDetails(productIds);

      const productList = template.products.map((p) => {
        const product = productDetails[p.productId];
        const importPrice = product?.variant[0]?.importPrice || "0";
        return {
          productId: p.productId,
          quantity: p.quantity,
          price: importPrice,
          unit: "cái",
          status: false,
          quantityRe: 0,
          note: "",
        };
      });

      const response = await createImportOrder({
        orderName: template.displayName || "",
        note: template.note || "",
        productList,
      });

      if (response.status === 401 || response.status === 403) {
        setError("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        navigate("/login");
        return;
      }

      const result = await response.json();
      if (response.status === 201) {
        toast.success(`Tạo đơn từ mẫu "${template.displayName}" thành công`);
        navigate(`/importorder/${result._id}`);
      } else {
        throw new Error(result.message || "Lỗi khi tạo đơn từ mẫu");
      }
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    }
  };

  const handleCreateNewTemplate = async () => {
    try {
      const response = await createInventoryOrderTemplate({
        displayName: "Mẫu_1",
        note: "",
        products: [],
      });

      if (response.status === 401 || response.status === 403) {
        setError("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        navigate("/login");
        return;
      }

      if (!response.ok) throw new Error("Lỗi khi tạo mẫu hóa đơn");
      const result = await response.json();
      toast.success("Tạo mẫu hóa đơn mới thành công");
      navigate(`/importordertemplate/${result.index}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSelectTemplate = (index) => {
    setSelectedTemplateIndex(index);
  };

  const handleEditSelectedTemplate = () => {
    if (selectedTemplateIndex === null) return;
    navigate(`/importordertemplate/${selectedTemplateIndex}`);
    handleCloseDialog();
  };

  const handleDeleteSelectedTemplate = async () => {
    if (selectedTemplateIndex === null) return;

    const selectedTemplate = orderTemplates[selectedTemplateIndex];
    if (!window.confirm(`Bạn có chắc muốn xóa mẫu "${selectedTemplate?.displayName || "Mẫu không tên"}"?`)) {
      return;
    }

    try {
      const response = await deleteInventoryOrderTemplate(selectedTemplateIndex);
      if (!response.ok) throw new Error("Lỗi khi xóa mẫu hóa đơn");

      toast.success("Xóa mẫu hóa đơn thành công");
      setSelectedTemplateIndex(null);
      await fetchOrderTemplates();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleOpenDialog = () => {
    setSelectedTemplateIndex(null);
    fetchOrderTemplates();
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedTemplateIndex(null);
  };

  const handleOpenCreateDialog = () => {
    fetchOrderTemplates();
    setOpenCreateDialog(true);
  };

  const handleCloseCreateDialog = () => {
    setOpenCreateDialog(false);
  };

  const handleUpdateOrderStatus = async (order) => {
    if (order.status) {
      toast("Đơn hàng này đã hoàn thành");
      return;
    }

    if (
      !window.confirm(
        "Bạn có chắc muốn hoàn thành đơn hàng này? Tất cả sản phẩm còn thiếu sẽ được nhập kho."
      )
    ) {
      return;
    }

    try {
      const res = await completeImportOrder(order._id);

      if (!res.ok) throw new Error("Lỗi khi cập nhật đơn hàng");
      await res.json();

      toast.success("Cập nhật trạng thái & tồn kho thành công");
      fetchOrders(currentPage); // reload danh sách
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Có lỗi xảy ra");
    }
  };

  // Tải danh sách đơn hàng khi các bộ lọc thay đổi hoặc chuyển trang
  useEffect(() => {
    fetchOrders(currentPage, debouncedOrderName, debouncedUserName);
  }, [currentPage, debouncedOrderName, debouncedUserName]);

  // Tải danh sách mẫu hóa đơn khi component mount
  useEffect(() => {
    fetchOrderTemplates();
  }, []);

  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error">Lỗi: {error}</Alert>
      </Box>
    );
  }

  return (
    <Box p={2} className="inventory-order-list-page">
      <div className="sticky-header" style={{ position: "relative", zIndex: showMobileFilters ? 110 : 2 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2,
            mb: "8px !important",
          }}
        >
          <Typography variant="h5" sx={{ whiteSpace: "nowrap", mb: "0 !important" }}>
            Quản lý đơn nhập
          </Typography>
          
          {/* Nút Bộ lọc & Chức năng cho di động */}
          <Button
            variant="outlined"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            startIcon={<TuneIcon />}
            sx={{ display: { xs: "inline-flex", sm: "none" } }}
          >
            Bộ lọc & Chức năng
          </Button>

        </Box>

        {/* 1. Bộ lọc cho Desktop */}
        <Box
          className="inventory-order-desktop-filters"
          sx={{
            display: { xs: "none", sm: "flex" },
            columnGap: 1.5,
            rowGap: 4,
            mb: 0,
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenCreateDialog}
            sx={{ height: 40, minWidth: 130, flexShrink: 0 }}
          >
            Tạo đơn mới
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleOpenDialog}
            sx={{ height: 40, minWidth: 130, flexShrink: 0 }}
          >
            Mẫu hóa đơn
          </Button>
          <Autocomplete
            freeSolo
            size="small"
            options={uniqueOrderNames}
            value={filterOrderName}
            onInputChange={(event, newInputValue) => {
              setFilterOrderName(newInputValue);
            }}
            onChange={(event, newValue) => {
              setFilterOrderName(newValue || "");
            }}
            filterOptions={(options, state) => {
              const inputValue = removeVietnameseTones(state.inputValue);
              return options.filter((option) =>
                removeVietnameseTones(option).includes(inputValue)
              );
            }}
            sx={{ width: "200px" }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Tên hóa đơn"
                placeholder="Nhập tên..."
                variant="outlined"
              />
            )}
          />
          <Autocomplete
            freeSolo
            size="small"
            options={uniqueUserNames}
            value={filterUserName}
            onInputChange={(event, newInputValue) => {
              setFilterUserName(newInputValue);
            }}
            onChange={(event, newValue) => {
              setFilterUserName(newValue || "");
            }}
            filterOptions={(options, state) => {
              const inputValue = removeVietnameseTones(state.inputValue);
              return options.filter((option) =>
                removeVietnameseTones(option).includes(inputValue)
              );
            }}
            sx={{ width: "200px" }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Tên người tạo"
                placeholder="Nhập người tạo..."
                variant="outlined"
              />
            )}
          />
          <TextField
            select
            label="Trạng thái"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            size="small"
            sx={{ width: "150px" }}
            SelectProps={{ native: true }}
          >
            <option value="all">Tất cả</option>
            <option value="true">Hoàn thành</option>
            <option value="false">Chưa hoàn thành</option>
          </TextField>
          <TextField
            label="Từ ngày"
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ width: "150px" }}
          />
          <TextField
            label="Đến ngày"
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ width: "150px" }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              setCurrentPage(1);
              fetchOrders(1, filterOrderName, filterUserName);
            }}
            sx={{ height: "40px", minWidth: "80px" }}
          >
            Lọc
          </Button>
        </Box>

        {/* 2. Bảng chức năng trượt xuống cho di động */}
        <Box
          sx={{
            display: { xs: "block", sm: "none" },
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 110,
            bgcolor: "background.paper",
            boxShadow: "0px 8px 24px rgba(16, 42, 67, 0.12)",
            borderRadius: "12px",
            border: "1px solid #e5eaf0",
            transform: showMobileFilters ? "translateY(0)" : "translateY(-15px)",
            opacity: showMobileFilters ? 1 : 0,
            visibility: showMobileFilters ? "visible" : "hidden",
            transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.25s"
          }}
        >
          <Box p={2.5} display="flex" flexDirection="column" gap={2}>
            <Typography variant="subtitle2" fontWeight="bold">CHỨC NĂNG</Typography>
            <Box display="flex" gap={1.5}>
              <Button
                variant="contained"
                color="primary"
                onClick={() => {
                  setShowMobileFilters(false);
                  handleOpenCreateDialog();
                }}
                fullWidth
              >
                Tạo đơn mới
              </Button>
              <Button
                variant="contained"
                color="secondary"
                onClick={() => {
                  setShowMobileFilters(false);
                  handleOpenDialog();
                }}
                fullWidth
              >
                Mẫu hóa đơn
              </Button>
            </Box>

            <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 1 }}>BỘ LỌC TÌM KIẾM</Typography>
            
            <Autocomplete
              freeSolo
              size="small"
              options={uniqueOrderNames}
              value={filterOrderName}
              onInputChange={(event, newInputValue) => {
                setFilterOrderName(newInputValue);
              }}
              onChange={(event, newValue) => {
                setFilterOrderName(newValue || "");
              }}
              filterOptions={(options, state) => {
                const inputValue = removeVietnameseTones(state.inputValue);
                return options.filter((option) =>
                  removeVietnameseTones(option).includes(inputValue)
                );
              }}
              sx={{ width: "100%" }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tên hóa đơn"
                  placeholder="Nhập tên..."
                  variant="outlined"
                />
              )}
            />
            <Autocomplete
              freeSolo
              size="small"
              options={uniqueUserNames}
              value={filterUserName}
              onInputChange={(event, newInputValue) => {
                setFilterUserName(newInputValue);
              }}
              onChange={(event, newValue) => {
                setFilterUserName(newValue || "");
              }}
              filterOptions={(options, state) => {
                const inputValue = removeVietnameseTones(state.inputValue);
                return options.filter((option) =>
                  removeVietnameseTones(option).includes(inputValue)
                );
              }}
              sx={{ width: "100%" }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tên người tạo"
                  placeholder="Nhập người tạo..."
                  variant="outlined"
                />
              )}
            />
            <TextField
              select
              label="Trạng thái"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              size="small"
              sx={{ width: "100%" }}
              SelectProps={{ native: true }}
            >
              <option value="all">Tất cả</option>
              <option value="true">Hoàn thành</option>
              <option value="false">Chưa hoàn thành</option>
            </TextField>
            <TextField
              label="Từ ngày"
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ width: "100%" }}
            />
            <TextField
              label="Đến ngày"
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ width: "100%" }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={() => {
                setShowMobileFilters(false);
                setCurrentPage(1);
                fetchOrders(1, filterOrderName, filterUserName);
              }}
              fullWidth
              sx={{ height: "40px" }}
            >
              Lọc kết quả
            </Button>
          </Box>
        </Box>
      </div>

      {/* Dialog danh sách mẫu hóa đơn (chỉnh sửa mẫu) */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        disableScrollLock
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Danh sách mẫu hóa đơn</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ px: 3, py: 2 }}>
            {orderTemplates.length > 0 ? (
              orderTemplates.map((template, index) => (
                <Button
                  key={template._id || index}
                  variant={selectedTemplateIndex === index ? "contained" : "outlined"}
                  fullWidth
                  sx={{ mb: index === orderTemplates.length - 1 ? 0 : 1 }}
                  onClick={() => handleSelectTemplate(index)}
                >
                  <Box sx={{ width: "100%", textAlign: "left" }}>
                    <Typography component="div" fontWeight={700}>
                      {template.displayName || "Mẫu không tên"}
                    </Typography>
                    {template.note && (
                      <Typography component="div" variant="caption" sx={{ opacity: 0.8 }}>
                        {template.note}
                      </Typography>
                    )}
                  </Box>
                </Button>
              ))
            ) : (
              <Typography>Chưa có mẫu hóa đơn nào</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ gap: 1, px: 3, pb: 2 }}>
          <Button
            variant="contained"
            color="success"
            fullWidth
            onClick={handleCreateNewTemplate}
          >
            Thêm mới
          </Button>
          <Button
            variant="contained"
            color="primary"
            fullWidth
            disabled={selectedTemplateIndex === null}
            onClick={handleEditSelectedTemplate}
          >
            Sửa
          </Button>
          <Button
            variant="contained"
            color="error"
            fullWidth
            disabled={selectedTemplateIndex === null}
            onClick={handleDeleteSelectedTemplate}
          >
            Xóa
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog tạo đơn mới với mẫu */}
      <Dialog open={openCreateDialog} onClose={handleCloseCreateDialog} disableScrollLock>
        <DialogTitle>Chọn mẫu hóa đơn để tạo đơn</DialogTitle>
        <DialogContent>
          {orderTemplates.length > 0 ? (
            orderTemplates.map((template, index) => (
              <Button
                key={template._id || index}
                variant="outlined"
                fullWidth
                sx={{ mb: 1 }}
                onClick={() => {
                  handleCreateOrderFromTemplate(template);
                  handleCloseCreateDialog();
                }}
              >
                {template.displayName || `Mẫu ${index}`}
              </Button>
            ))
          ) : (
            <Typography>Chưa có mẫu hóa đơn nào</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              handleCreateNewOrder();
              handleCloseCreateDialog();
            }}
          >
            Tạo đơn trắng
          </Button>
          <Button onClick={handleCloseCreateDialog}>Hủy</Button>
        </DialogActions>
      </Dialog>

      {loading && orders.length === 0 ? (
        <Box display="flex" justifyContent="center" p={2}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {loading && <LinearProgress sx={{ mb: 1 }} />}
          <TableContainer
            component={Paper}
            className="inventory-order-list-table"
            sx={{ overflow: "auto" }}
          >
          <Table stickyHeader style={{ minWidth: "1000px", tableLayout: "fixed" }}>
            <TableHead>
              <TableRow>
                <TableCell align="center" style={{ width: "50px" }}></TableCell>
                <TableCell align="center" style={{ width: "25%" }}>Tên hóa đơn</TableCell>
                <TableCell align="center" style={{ width: "12%" }}>Tên người tạo</TableCell>
                <TableCell align="center" style={{ width: "13%" }}>Số lượng sản phẩm</TableCell>
                <TableCell align="center" style={{ width: "13%" }}>Tổng giá</TableCell>
                <TableCell align="center" style={{ width: "10%" }}>Trạng thái</TableCell>
                <TableCell align="center" style={{ width: "13%" }}>Ngày tạo</TableCell>
                <TableCell align="center" style={{ width: "14%" }}>Ngày nhập</TableCell>
                <TableCell align="center" style={{ width: "100px" }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => {
                const hasMissingProducts = order.productList.some(
                  (p) => p.quantityRe < p.quantity
                );

                return (
                  <React.Fragment key={order._id}>
                    <TableRow hover>
                      <TableCell align="center">
                        <IconButton
                          onClick={() =>
                            !order.status && handleExpandClick(order._id)
                          }
                          sx={{
                            pointerEvents: order.status ? "none" : "auto",
                            opacity: order.status ? 0.5 : 1,
                          }}
                        >
                          <ExpandMoreIcon
                            sx={{
                              transform: expandedRows[order._id]
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                              transition: "transform 0.2s",
                            }}
                          />
                        </IconButton>
                      </TableCell>
                      <TableCell align="center">{order.orderName}</TableCell>
                      <TableCell align="center">{order.userName}</TableCell>
                      <TableCell align="center">
                        {order.productList.length} sản phẩm
                      </TableCell>
                      <TableCell align="center">
                        {Number(order.total).toLocaleString("vi-VN")} VNĐ
                      </TableCell>
                      <TableCell align="center">
                        <Checkbox
                          checked={order.status}
                          color="success"
                          readOnly
                          onChange={() => {
                            if (!order.status) handleUpdateOrderStatus(order);
                          }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        {moment(order.createdAt).format("DD/MM/YYYY HH:mm")}
                      </TableCell>
                      <TableCell align="center">
                        {order.completedAt 
                          ? moment(order.completedAt).format("DD/MM/YYYY HH:mm") 
                          : (order.status === true ? moment(order.createdAt).format("DD/MM/YYYY HH:mm") : "")}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          onClick={() => navigate(`/importorder/${order._id}`)}
                        >
                          Chi tiết
                        </Button>
                      </TableCell>
                    </TableRow>
                    {hasMissingProducts && (
                      <TableRow>
                        <TableCell
                          className="collapsible-cell"
                          style={{ paddingBottom: 0, paddingTop: 0, borderBottom: "none" }}
                          colSpan={9}
                        >
                          <Collapse
                            in={expandedRows[order._id]}
                            timeout="auto"
                            unmountOnExit
                          >
                            <Box
                              sx={{
                                margin: 2,
                              }}
                            >
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Tên</TableCell>
                                    <TableCell>Hình ảnh</TableCell>
                                    <TableCell>Hãng</TableCell>
                                    <TableCell>Số lượng còn thiếu</TableCell>
                                    <TableCell>Ghi chú</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {order.productList
                                    .filter((p) => p.quantityRe < p.quantity)
                                    .map((product) => {
                                      const productDetail =
                                        productDetails[order._id]?.[
                                          product.productId
                                        ];
                                      return (
                                        <TableRow key={product._id}>
                                          <TableCell>
                                            {productDetail?.name ||
                                              "Đang tải..."}
                                          </TableCell>
                                          <TableCell>
                                          {productDetail?.variant?.[0]?.imgUrl ? (
  <img
    src={productDetail.variant?.[0]?.imgUrl}
    alt={productDetail?.name || "Sản phẩm"}
    style={{ width: 50, height: 50, objectFit: "cover" }}
  />
) : (
  "N/A"
)}
                                          </TableCell>
                                          <TableCell>
                                            {productDetail?.brand || "N/A"}
                                          </TableCell>
                                          <TableCell>
                                            {product.quantity -
                                              product.quantityRe}
                                          </TableCell>
                                          <TableCell>
                                            {product.note || "Không có"}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        </>
      )}

      {pagination.totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={1} mb={1}>
          <Pagination
            count={pagination.totalPages}
            page={currentPage}
            onChange={(event, newPage) => {
              setCurrentPage(newPage);
              fetchOrders(newPage);
            }}
            color="primary"
          />
        </Box>
      )}
      {/* Lớp nền mờ khi mở bộ lọc trên di động */}
      <Box
        onClick={() => setShowMobileFilters(false)}
        sx={{
          display: { xs: "block", sm: "none" },
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          zIndex: 105,
          opacity: showMobileFilters ? 1 : 0,
          visibility: showMobileFilters ? "visible" : "hidden",
          transition: "opacity 0.25s ease-in-out, visibility 0.25s"
        }}
      />
    </Box>
  );
};

export default IpOrders;
