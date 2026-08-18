import React, { useEffect, useState } from "react";
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
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  TablePagination,
  CircularProgress,
  Box,
  Autocomplete,
} from "@mui/material";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  getInventoryProduct,
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

const OrderedProducts = () => {
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalProducts, setTotalProducts] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedProductOrders, setSelectedProductOrders] = useState([]);
  const [selectedProductName, setSelectedProductName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const uniqueProductNames = React.useMemo(() => {
    const names = products.map((p) => p.name).filter(Boolean);
    return Array.from(new Set(names));
  }, [products]);

  const [filters, setFilters] = useState({
    productName: "",
    startDate: new Date(new Date().setDate(1)).toISOString().split("T")[0], // Đầu tháng
    endDate: new Date().toISOString().split("T")[0], // Hôm nay
  });

  // Hàm gọi API chung với xử lý lỗi
  const readApiResponse = async (responsePromise, options = {}) => {
    const { suppressToast = false } = options;
    try {
      const response = await responsePromise;

      if (response.status === 401 || response.status === 403) {
        toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        navigate("/login");
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Yêu cầu thất bại");
      }

      return await response.json();
    } catch (err) {
      if (!suppressToast) {
        toast.error(err.message);
      }
      return null;
    }
  };

  const fetchProducts = async (currentPage = 1, customFilters = filters) => {
    setLoading(true);
    try {
      const queryParams = {
        page: currentPage,
        limit: rowsPerPage,
        status: "true",
        byCompletedDate: "true",
        startDate: customFilters.startDate,
        endDate: customFilters.endDate,
        productName: customFilters.productName || undefined,
      };

      const data = await readApiResponse(listImportOrders(queryParams));

      if (!data) {
        setProducts([]);
        setTotalProducts(0);
        return;
      }

      const orders = data.orders || [];
      const total = data.total || 0;

      const productMap = new Map();
      orders.forEach((order) => {
        order.productList.forEach((item) => {
          const key = item.productId;
          if (productMap.has(key)) {
            productMap.get(key).quantity += item.quantity;
            productMap.get(key).orders.push({
              orderId: order._id,
              orderName: order.orderName,
              userName: order.userName,
              quantity: item.quantity,
              status: item.status,
              createdAt: order.createdAt,
              completedAt: order.completedAt,
            });
          } else {
            productMap.set(key, {
              productId: item.productId,
              quantity: item.quantity,
              orders: [
                {
                  orderId: order._id,
                  orderName: order.orderName,
                  userName: order.userName,
                  quantity: item.quantity,
                  status: item.status,
                  createdAt: order.createdAt,
                  completedAt: order.completedAt,
                },
              ],
            });
          }
        });
      });

      const productsWithDetails = await Promise.all(
        Array.from(productMap.entries()).map(async ([, product]) => {
          const productData = await readApiResponse(
            getInventoryProduct(product.productId),
            { suppressToast: true }
          );

          if (!productData) return null;

          const latestCreatedAt = product.orders.reduce((latest, o) => {
            if (!o.createdAt) return latest;
            return !latest || new Date(o.createdAt) > new Date(latest) ? o.createdAt : latest;
          }, null);

          const latestCompletedAt = product.orders.reduce((latest, o) => {
            if (!o.completedAt) return latest;
            return !latest || new Date(o.completedAt) > new Date(latest) ? o.completedAt : latest;
          }, null);

          return {
            productId: product.productId,
            name: productData.name || "N/A",
            brand: productData.brand || "N/A",
            code: productData.code || "N/A",
            quantity: product.quantity,
            orders: product.orders,
            variant: productData.variant?.[0] || {},
            createdAt: latestCreatedAt,
            completedAt: latestCompletedAt,
          };
        })
      );

      const validProducts = productsWithDetails.filter(Boolean);
      setProducts(validProducts);
      setTotalProducts(total);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Lỗi khi lấy danh sách sản phẩm đã đặt");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearch = () => {
    const startDate = new Date(filters.startDate);
    const endDate = new Date(filters.endDate);
    if (filters.startDate && filters.endDate && startDate > endDate) {
      toast.error("Ngày bắt đầu không thể lớn hơn ngày kết thúc");
      return;
    }
    setPage(0);
    fetchProducts(1, filters);
    toast.success("Tìm kiếm thành công");
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
    fetchProducts(newPage + 1);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
    fetchProducts(1);
  };

  const handleProductClick = (product) => {
    setSelectedProductOrders(product.orders);
    setSelectedProductName(product.name);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedProductOrders([]);
    setSelectedProductName("");
  };

  const handleViewOrder = (orderId) => {
    navigate(`/importorder/${orderId}`);
    setOpenDialog(false);
  };

  // Format ngày giờ bằng native JS
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return (
    <Box p={2} className="admin-list-page">
      <div className="sticky-header">
        <h2>Danh sách sản phẩm đã đặt</h2>

        {/* Bộ lọc */}
        <Box 
          display="flex" 
          gap={2} 
          mb={2}
          sx={{
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "stretch", sm: "center" }
          }}
        >
          <Autocomplete
            freeSolo
            size="small"
            options={uniqueProductNames}
            value={filters.productName}
            onInputChange={(event, newInputValue) => {
              setFilters((prev) => ({ ...prev, productName: newInputValue }));
            }}
            onChange={(event, newValue) => {
              setFilters((prev) => ({ ...prev, productName: newValue || "" }));
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
                label="Tên sản phẩm"
                placeholder="Nhập tên..."
                variant="outlined"
              />
            )}
          />
          <TextField
            name="startDate"
            label="Từ ngày"
            type="date"
            value={filters.startDate}
            onChange={handleFilterChange}
            variant="outlined"
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: "100%", sm: 150 } }}
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
            sx={{ width: { xs: "100%", sm: 150 } }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleSearch}
            size="medium"
            sx={{ alignSelf: { xs: "stretch", sm: "center" }, height: "40px" }}
          >
            Tìm kiếm
          </Button>
        </Box>
      </div>

      {/* Loading */}
      {loading && (
        <Box display="flex" justifyContent="center" my={2}>
          <CircularProgress />
        </Box>
      )}

      {/* Bảng sản phẩm */}
      {!loading && (
        <>
          <TableContainer component={Paper} className="admin-list-table" sx={{ overflow: "auto" }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell align="center">Hình ảnh</TableCell>
                  <TableCell align="center">Tên sản phẩm</TableCell>
                  <TableCell align="center">Mã sản phẩm</TableCell>
                  <TableCell align="center">Thương hiệu</TableCell>
                  <TableCell align="center">Tổng số lượng đặt</TableCell>
                  <TableCell align="center">Hành động</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {products.length > 0 ? (
                  products.map((product) => (
                    <TableRow key={product.productId}>
                      <TableCell align="center">
                        {product.variant?.imgUrl ? (
                          <img
                            src={product.variant?.imgUrl}
                            alt={product.name || "Sản phẩm"}
                            style={{ width: 50, height: 50, objectFit: "cover" }}
                          />
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell align="center">{product.name}</TableCell>
                      <TableCell align="center">{product.code}</TableCell>
                      <TableCell align="center">{product.brand}</TableCell>
                      <TableCell align="center">{product.quantity}</TableCell>
                      <TableCell align="center">
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => handleProductClick(product)}
                        >
                          Chi tiết
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      Không có sản phẩm nào
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Phân trang */}
          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={totalProducts}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </>
      )}

      {/* Dialog đơn hàng */}
      <Dialog open={openDialog} onClose={handleCloseDialog} disableScrollLock maxWidth="md" fullWidth>
        <DialogTitle>Đơn hàng chứa sản phẩm: {selectedProductName}</DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell align="center">Tên hóa đơn</TableCell>
                  <TableCell align="center">Người tạo</TableCell>
                  <TableCell align="center">Số lượng</TableCell>
                  <TableCell align="center">Trạng thái</TableCell>
                  <TableCell align="center">Ngày tạo</TableCell>
                  <TableCell align="center">Ngày nhập</TableCell>
                  <TableCell align="center">Hành động</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedProductOrders.map((order) => (
                  <TableRow key={order.orderId}>
                    <TableCell align="center">
                      {order.orderName || "Không có tên"}
                    </TableCell>
                    <TableCell align="center">{order.userName}</TableCell>
                    <TableCell align="center">{order.quantity}</TableCell>
                    <TableCell align="center">
                      <Checkbox
                        checked={order.status}
                        color="success"
                        sx={{ pointerEvents: "none" }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      {formatDate(order.createdAt)}
                    </TableCell>
                    <TableCell align="center">
                      {order.completedAt 
                        ? formatDate(order.completedAt) 
                        : (order.status === true ? formatDate(order.createdAt) : "")}
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleViewOrder(order.orderId)}
                      >
                        Xem đơn hàng
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default OrderedProducts;
