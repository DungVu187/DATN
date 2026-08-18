
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TextField,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';

const apiUrl = import.meta.env.VITE_API_URL;

const IpOrderTemplate = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [products, setProducts] = useState([]);
  const [productDetails, setProductDetails] = useState({});
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [searchProducts, setSearchProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const authToken = sessionStorage.getItem('auth-token');
  const navigate = useNavigate();
  const { index } = useParams();

  const fetchProductDetails = async (productIds) => {
    try {
      const response = await fetch(`${apiUrl}/products/fetch-by-ids`, {
        method: 'POST',
        headers: {
          'auth-token': authToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: productIds }),
      });
      if (!response.ok) throw new Error('Failed to fetch product details');
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

  const fetchTemplate = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/users/order-templates`, {
        headers: {
          'auth-token': authToken,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch order templates');
      const data = await response.json();
      const template = data.orderTemplates[Number(index)];
      if (template) {
        setDisplayName(template.displayName || '');
        setProducts(template.products || []);
        if (template.products.length > 0) {
          const productIds = template.products.map(p => p.productId);
          const details = await fetchProductDetails(productIds);
          setProductDetails(details);
        }
      }
    } catch (err) {
      setError(err.message);
      toast.error('Lỗi khi lấy thông tin mẫu hóa đơn');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllProducts = async () => {
    try {
      const response = await fetch(`${apiUrl}/products/?search=${searchTerm}`, {
        credentials: "include",
      });
      const result = await response.json();
      setSearchProducts(result.products);
    } catch (error) {
      console.error("Error searching products:", error);
      toast.error("Lỗi khi tìm kiếm sản phẩm");
    }
  };

  const handleAddProduct = async (product) => {
    try {
      const productDetails = await fetchProductDetails([product._id]);
      const selectedProduct = productDetails[product._id] || {};
      const newProduct = {
        productId: product._id,
        quantity: 1,
      };

      setProducts([...products, newProduct]);
      setProductDetails(prev => ({ ...prev, [product._id]: selectedProduct }));
      setOpenAddDialog(false);
      toast.success('Thêm sản phẩm thành công');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleProductChange = (productIndex, field, value) => {
    const updatedProducts = products.map((product, i) =>
      i === productIndex ? { ...product, [field]: field === 'quantity' ? Number(value) || 1 : value } : product
    );
    setProducts(updatedProducts);

    if (field === 'productId' && value) {
      fetchProductDetails([value]).then(details => {
        setProductDetails(prev => ({ ...prev, ...details }));
      });
    }
  };

  const handleRemoveProduct = (productIndex) => {
    setProducts(products.filter((_, i) => i !== productIndex));
    toast.success('Xóa sản phẩm thành công');
  };

  const handleSaveTemplate = async () => {
    if (!displayName.trim()) {
      toast.error('Vui lòng nhập tên mẫu hóa đơn');
      return;
    }

    try {
      const body = {
        displayName: displayName.trim(),
        products: products.map(p => ({ productId: p.productId, quantity: p.quantity })),
      };
      let response;
      if (index !== undefined) {
        response = await fetch(`${apiUrl}/users/order-template/${index}/products`, {
          method: 'PUT',
          headers: {
            'auth-token': authToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } else {
        response = await fetch(`${apiUrl}/users/order-templates`, {
          method: 'POST',
          headers: {
            'auth-token': authToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      }

      if (!response.ok) throw new Error('Failed to save order template');
      toast.success('Lưu mẫu hóa đơn thành công');
      navigate('/importorder');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSaveDisplayName = async () => {
    if (!displayName.trim()) {
      toast.error('Vui lòng nhập tên mẫu hóa đơn');
      return;
    }

    if (index === undefined) {
      toast.error('Vui lòng lưu mẫu trước khi cập nhật tên');
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/users/order-template/${index}/display-name`, {
        method: 'PUT',
        headers: {
          'auth-token': authToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });

      if (!response.ok) throw new Error('Failed to update display name');
      toast.success('Cập nhật tên mẫu hóa đơn thành công');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteTemplate = async () => {
    if (index === undefined) {
      toast.error('Không có mẫu để xóa');
      return;
    }

    if (!window.confirm('Bạn có chắc muốn xóa mẫu hóa đơn này?')) return;

    try {
      const response = await fetch(`${apiUrl}/users/order-template/${index}`, {
        method: 'DELETE',
        headers: {
          'auth-token': authToken,
        },
      });

      if (!response.ok) throw new Error('Failed to delete order template');
      toast.success('Xóa mẫu hóa đơn thành công');
      navigate('/importorder');
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    if (authToken) {
      if (index !== undefined) fetchTemplate();
    } else {
      navigate('/login');
    }
  }, [authToken, index, navigate]);

  if (loading) return <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box>;
  if (error) return <Box p={2}><Alert severity="error">Error: {error}</Alert></Box>;

  return (
    <Box p={2}>
      <Box display="flex" justifyContent="space-between" mb={2}>
        <Typography variant="h5">Chỉnh sửa mẫu hóa đơn</Typography>
        <Box display="flex" gap={2}>
          {index !== undefined && (
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteTemplate}
            >
              Xóa mẫu
            </Button>
          )}
          <Button variant="contained" color="success" onClick={handleSaveTemplate}>
            Lưu mẫu
          </Button>
        </Box>
      </Box>

      <Box display="flex" alignItems="center" gap={2} mb={2}>
        <TextField
          label="Tên mẫu hóa đơn"
          fullWidth
          variant="outlined"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nhập tên mẫu hóa đơn"
          size='small'
          sx={{ width: '300px'}}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleSaveDisplayName}
          disabled={index === undefined}
        >
          Lưu tên
        </Button>
      </Box>

      <Box display="flex" justifyContent="flex-start" mb={2}>
        <Button variant="contained" color="primary" onClick={() => setOpenAddDialog(true)}>
          Thêm sản phẩm
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Tên sản phẩm</TableCell>
              <TableCell>Hình ảnh</TableCell>
              <TableCell>Mã sản phẩm</TableCell>
              <TableCell>Số lượng</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.length > 0 ? (
              products.map((product, index) => (
                <TableRow key={index}>
                  <TableCell>
                    {productDetails[product.productId]?.name || 'Chưa chọn'}
                  </TableCell>
                  <TableCell>
                    {productDetails[product.productId]?.variant?.[0]?.imgUrl ? (
                      <img
                        src={productDetails[product.productId]?.variant?.[0]?.imgUrl}
                        alt={productDetails[product.productId]?.name || "Sản phẩm"}
                        style={{ width: "50px", height: "50px", objectFit: "cover" }}
                      />
                    ) : (
                      "N/A"
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography>{productDetails[product.productId]?.code || 'N/A'}</Typography>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={product.quantity}
                      onChange={(e) => handleProductChange(index, 'quantity', e.target.value)}
                      inputProps={{ min: 1 }}
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton color="error" onClick={() => handleRemoveProduct(index)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  Chưa có sản phẩm nào
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialog thêm sản phẩm */}
      <Dialog open={openAddDialog} onClose={() => setOpenAddDialog(false)} disableScrollLock>
        <DialogTitle>Thêm sản phẩm vào mẫu</DialogTitle>
        <DialogContent>
          <Box display="flex" gap={2} mb={2}>
            <TextField
              label="Tìm kiếm sản phẩm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
            />
            <Button variant="contained" onClick={fetchAllProducts}>Tìm</Button>
          </Box>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Tên</TableCell>
                  <TableCell>Hình ảnh</TableCell>
                  <TableCell>Mã</TableCell>
                  <TableCell>Hãng</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {searchProducts.map(product => (
                  <TableRow
                    key={product._id}
                    hover
                    onClick={() => handleAddProduct(product)}
                    style={{ cursor: 'pointer' }}
                  >
                    <TableCell>{product.name}</TableCell>
                    <TableCell>
  <img
    src={product.variant?.[0]?.imgUrl}
    alt=""
    style={{ width: "50px", height: "50px" }}
  />
</TableCell>
                    <TableCell>{product.code || 'N/A'}</TableCell>
                    <TableCell>{product.brand || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddDialog(false)}>Hủy</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default IpOrderTemplate;
