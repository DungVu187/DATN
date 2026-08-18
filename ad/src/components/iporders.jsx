
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
import moment from "moment";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

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
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [filterOrderName, setFilterOrderName] = useState('');
  const [filterUserName, setFilterUserName] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [debouncedOrderName, setDebouncedOrderName] = useState("");
  const [debouncedUserName, setDebouncedUserName] = useState("");
  const authToken = sessionStorage.getItem("auth-token");
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
      const queryParams = new URLSearchParams({
        page,
        orderName,
        userName,
        status: filterStatus === 'all' ? '' : filterStatus,
        startDate: filterStartDate,
        endDate: filterEndDate,
      }).toString();

      const response = await fetch(`${apiUrl}/iporders/orders?${queryParams}`, {
        headers: {
          "auth-token": authToken,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to fetch orders");
      const data = await response.json();
      setOrders(data.orders);
      setPagination(data.pagination);
      setCurrentPage(data.pagination.currentPage);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderTemplates = async () => {
    try {
      const response = await fetch(`${apiUrl}/users/order-templates`, {
        headers: {
          "auth-token": authToken,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to fetch order templates");
      const data = await response.json();
      setOrderTemplates(data.orderTemplates || []);
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi lấy danh sách mẫu hóa đơn");
    }
  };

  const fetchProductDetails = async (productIds) => {
    try {
      const response = await fetch(`${apiUrl}/products/fetch-by-ids`, {
        method: "POST",
        headers: {
          "auth-token": authToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: productIds }),
      });
      if (!response.ok) throw new Error("Failed to fetch product details");
      const result = await response.json();
      return result.products.reduce((acc, product) => {
        acc[product._id] = product;
        return acc;
      }, {});
    } catch (error) {
      console.error("Error fetching product details:", error);
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
      const response = await fetch(`${apiUrl}/iporders/orders`, {
        method: "POST",
        headers: {
          "auth-token": authToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userName: "admin", productList: [] }),
      });
      const result = await response.json();
      if (response.status === 201) {
        toast.success("Tạo đơn hàng mới thành công");
        navigate(`/importorder/${result._id}`);
      } else {
        throw new Error(result.message || "Failed to create order");
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

      const response = await fetch(`${apiUrl}/iporders/orders`, {
        method: "POST",
        headers: {
          "auth-token": authToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productList,
        }),
      });
      const result = await response.json();
      if (response.status === 201) {
        toast.success(`Tạo đơn từ mẫu "${template.displayName}" thành công`);
        navigate(`/importorder/${result._id}`);
      } else {
        throw new Error(result.message || "Failed to create order from template");
      }
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    }
  };

  const handleCreateNewTemplate = async () => {
    try {
      const response = await fetch(`${apiUrl}/users/order-templates`, {
        method: "POST",
        headers: {
          "auth-token": authToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: "Mẫu_1",
          products: [],
        }),
      });
      if (!response.ok) throw new Error("Failed to create order template");
      const result = await response.json();
      toast.success("Tạo mẫu hóa đơn mới thành công");
      navigate(`/importordertemplate/${result.index}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSelectTemplate = (index) => {
    navigate(`/importordertemplate/${index}`);
    handleCloseDialog();
  };

  const handleOpenDialog = () => {
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleOpenCreateDialog = () => {
    fetchOrderTemplates();
    setOpenCreateDialog(true);
  };

  const handleCloseCreateDialog = () => {
    setOpenCreateDialog(false);
  };

  // Tải danh sách đơn hàng khi bộ lọc thay đổi hoặc chuyển trang
  useEffect(() => {
    if (authToken) {
      fetchOrders(currentPage, debouncedOrderName, debouncedUserName);
    }
  }, [authToken, currentPage, debouncedOrderName, debouncedUserName]);

  // Tải danh sách mẫu hóa đơn khi component mount
  useEffect(() => {
    if (authToken) {
      fetchOrderTemplates();
    }
  }, [authToken]);

  const handlePageChange = (event, newPage) => {
    fetchOrders(newPage, debouncedOrderName, debouncedUserName);
  };

  if (!authToken)
    return (
      <Box p={2}>
        <Alert severity="warning">Please login to view orders</Alert>
      </Box>
    );
  if (loading && orders.length === 0)
    return (
      <Box display="flex" justifyContent="center" p={2}>
        <CircularProgress />
      </Box>
    );
  if (error)
    return (
      <Box p={2}>
        <Alert severity="error">Error: {error}</Alert>
      </Box>
    );

  return (
    <Box p={2}>
      <Box display="flex" justifyContent="space-between" mb={2}>
        <Typography variant="h5">Quản lý đơn nhập</Typography>
        <Box>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleOpenDialog}
          >
            Mẫu hóa đơn
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenCreateDialog}
            sx={{ ml: 1 }}
          >
            Tạo đơn mới
          </Button>
        </Box>
      </Box>

      {/* Bộ lọc */}
      <Box
        display="flex"
        columnGap={2}
        rowGap={4}
        mb={2}
        alignItems="center"
        flexWrap="wrap"
      >
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
          renderInput={(params) => (
            <TextField
              {...params}
              label="Tên hóa đơn"
              placeholder="Nhập tên..."
              variant="outlined"
              sx={{ width: "200px" }}
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
          renderInput={(params) => (
            <TextField
              {...params}
              label="Tên người tạo"
              placeholder="Nhập người tạo..."
              variant="outlined"
              sx={{ width: "200px" }}
            />
          )}
        />
        <TextField
          select
          label="Trạng thái"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          size="small"
          sx={{ width: '150px' }}
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
          sx={{ width: '150px' }}
        />
        <TextField
          label="Đến ngày"
          type="date"
          value={filterEndDate}
          onChange={(e) => setFilterEndDate(e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
          sx={{ width: '150px' }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={() => fetchOrders(1, filterOrderName, filterUserName)}
        >
          Lọc
        </Button>
      </Box>

      {/* Dialog danh sách mẫu hóa đơn (chỉnh sửa mẫu) */}
      <Dialog open={openDialog} onClose={handleCloseDialog} disableScrollLock>
        <DialogTitle>Danh sách mẫu hóa đơn</DialogTitle>
        <DialogContent>
          {orderTemplates.length > 0 ? (
            orderTemplates.map((template, index) => (
              <Button
                key={template._id}
                variant="outlined"
                fullWidth
                sx={{ mb: 1 }}
                onClick={() => handleSelectTemplate(index)}
              >
                {template.displayName || "Mẫu không tên"}
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
            fullWidth
            onClick={handleCreateNewTemplate}
          >
            Thêm mẫu mới
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog tạo đơn mới với mẫu (hiển thị nút) */}
      <Dialog open={openCreateDialog} onClose={handleCloseCreateDialog} disableScrollLock>
        <DialogTitle>Chọn mẫu hóa đơn để tạo đơn</DialogTitle>
        <DialogContent>
          {orderTemplates.length > 0 ? (
            orderTemplates.map((template, index) => (
              <Button
                key={template._id}
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

      {loading && <LinearProgress sx={{ mb: 1 }} />}
      <TableContainer component={Paper} sx={{ maxHeight: "calc(100vh - 280px)", overflowX: "auto" }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell align="center"></TableCell>
              <TableCell align="center">Tên hóa đơn</TableCell>
              <TableCell align="center">Tên người tạo</TableCell>
              <TableCell align="center">Số lượng sản phẩm</TableCell>
              <TableCell align="center">Tổng giá</TableCell>
              <TableCell align="center">Trạng thái</TableCell>
              <TableCell align="center">Ngày tạo</TableCell>
              <TableCell align="center"></TableCell>
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
                      {Number(order.total).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        checked={order.status}
                        color="success"
                        sx={{ pointerEvents: "none" }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      {moment(order.createdAt).format("DD/MM/YYYY HH:mm")}
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
                        colSpan={7}
                      >
                        <Collapse
                          in={expandedRows[order._id]}
                          timeout="auto"
                          unmountOnExit
                        >
                          <Box
                            sx={{
                              margin: 1,
                              width: "90%",
                              marginLeft: "auto",
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
                                          {productDetail?.name || "Đang tải..."}
                                        </TableCell>
                                        <TableCell>
                                          {productDetail?.variant[0]?.imgUrl ? (
                                            <img
  src={product.variant?.[0]?.imgUrl}
  alt={productDetail.name}
  style={{
    width: 50,
    height: 50,
    objectFit: "cover",
  }}
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

      {pagination.totalPages > 1 && (
        <Box display="flex" justifyContent="center" mt={1} mb={1}>
          <Pagination
            count={pagination.totalPages}
            page={currentPage}
            onChange={handlePageChange}
            color="primary"
          />
        </Box>
      )}
    </Box>
  );
};

export default IpOrders;
