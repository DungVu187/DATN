
import { useEffect, useState } from "react";
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
} from "@mui/material";
import moment from "moment";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const apiUrl = import.meta.env.VITE_API_URL;

const OrderedProducts = () => {
  const [, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalProducts, setTotalProducts] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedProductOrders, setSelectedProductOrders] = useState([]);
  const [selectedProductName, setSelectedProductName] = useState("");
  const navigate = useNavigate();
  const authToken = sessionStorage.getItem("auth-token");

  const [filters, setFilters] = useState({
    productName: "",
    startDate: moment().startOf("month").format("YYYY-MM-DD"),
    endDate: moment().format("YYYY-MM-DD"),
  });

  useEffect(() => {
    if (authToken) {
      fetchProducts(page + 1);
    }
  }, [page, rowsPerPage, authToken]);

  const fetchProducts = async (currentPage = 1, customFilters = {}) => {
    try {
      if (!authToken) throw new Error("Please login to fetch products");

      const queryParams = {
        page: currentPage,
        limit: rowsPerPage,
      };

      if (customFilters.startDate) {
        queryParams.startDate = customFilters.startDate;
      }
      if (customFilters.endDate) {
        queryParams.endDate = customFilters.endDate;
      }

      const query = new URLSearchParams(queryParams).toString();

      const response = await fetch(`${apiUrl}/iporders/orders?${query}`, {
        headers: {
          "auth-token": authToken,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to fetch orders");

      const data = await response.json();
      const orders = data.orders;

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
                },
              ],
            });
          }
        });
      });

      const productsWithDetails = await Promise.all(
        Array.from(productMap.entries()).map(async ([, product]) => {
          try {
            const response = await fetch(`${apiUrl}/products/${product.productId}`, {
              headers: {
                "auth-token": authToken,
                "Content-Type": "application/json",
              },
            });
            if (!response.ok) throw new Error("Failed to fetch product details");
            const productData = await response.json();

            return {
              productId: product.productId,
              name: productData.name,
              brand: productData.brand,
              code: productData.code,
              quantity: product.quantity,
              orders: product.orders,
              variant: productData.variant[0] || {},
            };
          } catch (error) {
            console.error("Error fetching product details:", error);
            return null;
          }
        })
      );

      const validProducts = productsWithDetails.filter(Boolean);
      setProducts(validProducts);

      const filtered = customFilters.productName
        ? validProducts.filter((product) =>
            product.name.toLowerCase().includes(customFilters.productName.toLowerCase())
          )
        : validProducts;
      setFilteredProducts(filtered);
      setTotalProducts(filtered.length);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Lỗi khi lấy danh sách sản phẩm đã đặt");
    }
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearch = () => {
    if (filters.startDate && filters.endDate && moment(filters.startDate).isAfter(filters.endDate)) {
      toast.error("Ngày bắt đầu không thể lớn hơn ngày kết thúc");
      return;
    }
    setPage(0);
    fetchProducts(1, filters);
    toast.success("Tìm kiếm thành công");
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
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

  if (!authToken) {
    return (
      <div style={{ padding: "16px" }}>
        <h2>Vui lòng đăng nhập để xem danh sách sản phẩm đã đặt</h2>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      <h2>Danh sách sản phẩm đã đặt</h2>

      {/* Bộ lọc */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
        <TextField
          name="productName"
          label="Tên sản phẩm"
          value={filters.productName}
          onChange={handleFilterChange}
          variant="outlined"
          size="small"
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
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleSearch}
          size="small"
        >
          Tìm kiếm
        </Button>
      </div>

      {/* Bảng sản phẩm */}
      <TableContainer component={Paper} sx={{ maxHeight: "calc(100vh - 320px)", overflowX: "auto" }}>
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
            {filteredProducts
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((product) => (
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
                  <TableCell align="center">{product.code || "N/A"}</TableCell>
                  <TableCell align="center">{product.brand || "N/A"}</TableCell>
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
              ))}
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
                  <TableCell align="center">Hành động</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedProductOrders.map((order) => (
                  <TableRow key={order.orderId}>
                    <TableCell align="center">{order.orderName || "Không có tên"}</TableCell>
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
                      {moment(order.createdAt).format("HH:mm [ngày] DD-MM-YYYY")}
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
    </div>
  );
};

export default OrderedProducts;
