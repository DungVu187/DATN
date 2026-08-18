
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
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  createInventoryOrderTemplate,
  getInventoryOrderTemplates,
  getInventoryProductsByIds,
  searchInventoryOrderTemplateProducts,
  updateInventoryOrderTemplateDisplayName,
  updateInventoryOrderTemplateProducts,
} from '../../api/inventoryOrderAdministrationApi';

const IpOrderTemplate = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [note, setNote] = useState('');
  const [products, setProducts] = useState([]);
  const [productDetails, setProductDetails] = useState({});
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [searchProducts, setSearchProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { index } = useParams();
  const returnPath = location.pathname.includes('/exportordertemplate/')
    ? '/exportorder'
    : '/importorder';

  const fetchProductDetails = async (productIds) => {
    try {
      const response = await getInventoryProductsByIds(productIds);
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
      const response = await getInventoryOrderTemplates();
      if (!response.ok) throw new Error('Failed to fetch order templates');
      const data = await response.json();
      const template = data.orderTemplates[Number(index)];
      if (template) {
        setDisplayName(template.displayName || '');
        setNote(template.note || '');
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
      const response = await searchInventoryOrderTemplateProducts(searchTerm);
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
    const nextValue = field === 'quantity'
      ? (value === '' ? '' : Number(value))
      : value;
    const updatedProducts = products.map((product, i) =>
      i === productIndex ? { ...product, [field]: nextValue } : product
    );
    setProducts(updatedProducts);

    if (field === 'productId' && value) {
      fetchProductDetails([value]).then(details => {
        setProductDetails(prev => ({ ...prev, ...details }));
      });
    }
  };

  const handleQuantityBlur = (productIndex, value) => {
    const quantity = Number(value);
    handleProductChange(
      productIndex,
      'quantity',
      Number.isInteger(quantity) && quantity >= 1 ? quantity : 1
    );
  };

  const handleRemoveProduct = (productIndex) => {
    setProducts(products.filter((_, i) => i !== productIndex));
    toast.success('Xóa sản phẩm thành công');
  };

  const handleSaveTemplate = async (navigateAfterSave = true) => {
    if (!displayName.trim()) {
      toast.error('Vui lòng nhập tên mẫu hóa đơn');
      return;
    }

    try {
      const body = {
        displayName: displayName.trim(),
        note: note.trim(),
        products: products.map(p => ({
          productId: p.productId,
          quantity: Number.isInteger(Number(p.quantity)) && Number(p.quantity) >= 1
            ? Number(p.quantity)
            : 1,
        })),
      };
      let response;
      if (index !== undefined) {
        response = await updateInventoryOrderTemplateProducts(index, body);
        if (!response.ok) throw new Error('Failed to save order template');

        response = await updateInventoryOrderTemplateDisplayName(
          index,
          body.displayName,
          body.note
        );
      } else {
        response = await createInventoryOrderTemplate(body);
      }

      if (!response.ok) throw new Error('Failed to save order template');
      toast.success('Lưu mẫu hóa đơn thành công');
      if (navigateAfterSave) navigate(returnPath);
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
      const response = await updateInventoryOrderTemplateDisplayName(
        index,
        displayName.trim(),
        note.trim()
      );

      if (!response.ok) throw new Error('Failed to update display name');
      toast.success('Cập nhật thông tin mẫu hóa đơn thành công');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleEnterKey = (event, action) => {
    if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    action();
  };

  useEffect(() => {
    if (index !== undefined) fetchTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (loading) return <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box>;
  if (error) return <Box p={2}><Alert severity="error">Error: {error}</Alert></Box>;

  return (
    <Box p={2}>
      <Box display="flex" mb={2}>
        <Typography variant="h5">Chỉnh sửa mẫu hóa đơn</Typography>
      </Box>

      <Box display="flex" alignItems="center" gap={2} mb={2} flexWrap="wrap">
        <TextField
          label="Tên mẫu hóa đơn"
          fullWidth
          variant="outlined"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={(event) => handleEnterKey(event, handleSaveDisplayName)}
          placeholder="Nhập tên mẫu hóa đơn"
          size='small'
          sx={{ width: '300px'}}
        />
        <TextField
          label="Ghi chú"
          fullWidth
          variant="outlined"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(event) => handleEnterKey(event, handleSaveDisplayName)}
          placeholder="Nhập ghi chú cho mẫu hóa đơn"
          size="small"
          sx={{ width: '300px' }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleSaveDisplayName}
          disabled={index === undefined}
        >
          Lưu thông tin
        </Button>
        <Button variant="contained" color="success" onClick={() => handleSaveTemplate()}>
          Lưu mẫu
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
                      onBlur={(e) => handleQuantityBlur(index, e.target.value)}
                      onKeyDown={(event) =>
                        handleEnterKey(event, () => handleSaveTemplate(false))
                      }
                      inputProps={{ min: 1, step: 1 }}
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
              onKeyDown={(event) => handleEnterKey(event, fetchAllProducts)}
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
{product.variant?.[0]?.imgUrl ? (
  <img
    src={product.variant?.[0]?.imgUrl}
    alt={product.name || "Sản phẩm"}
    style={{ width: "50px", height: "50px", objectFit: "cover" }}
  />
) : (
  "N/A"
)}
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
