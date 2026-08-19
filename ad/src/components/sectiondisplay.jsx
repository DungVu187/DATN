import { useState, useEffect } from "react";
import {
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Box,
  CircularProgress,
  TablePagination,
  Switch,
  Select,
  MenuItem,
  FormControl,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  getStorefrontManagement,
  getStorefrontProductTypes,
  getStorefrontProductsByIds,
  searchStorefrontProducts,
  toggleStorefrontProductDisplay,
  updateStorefrontSection,
  uploadStorefrontSectionImage,
} from "../api/storefrontManagementApi";

const IOSSwitch = styled((props) => (
  <Switch focusVisibleClassName=".Mui-focusVisible" disableRipple {...props} />
))(({ theme }) => ({
  width: 42,
  height: 26,
  padding: 0,
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: 2,
    transitionDuration: '300ms',
    '&.Mui-checked': {
      transform: 'translateX(16px)',
      color: '#fff',
      '& + .MuiSwitch-track': {
        backgroundColor: '#22c55e', // iOS green
        opacity: 1,
        border: 0,
      },
      '&.Mui-disabled + .MuiSwitch-track': {
        opacity: 0.5,
      },
    },
    '&.Mui-focusVisible .MuiSwitch-thumb': {
      color: '#33cf4d',
      border: '6px solid #fff',
    },
    '&.Mui-disabled .MuiSwitch-thumb': {
      color: theme.palette.grey[100],
    },
    '&.Mui-disabled + .MuiSwitch-track': {
      opacity: 0.7,
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 22,
    height: 22,
  },
  '& .MuiSwitch-track': {
    borderRadius: 26 / 2,
    backgroundColor: '#E9E9EA',
    opacity: 1,
    transition: theme.transitions.create(['background-color', 'border'], {
      duration: 500,
    }),
  },
}));

// Moved SectionComponent OUTSIDE of SectionDisplay to prevent component recreation on updates and preserve expanded state.
const SectionComponent = ({
  section,
  displayName,
  defaultExpanded = false,
  manageData,
  setManageData,
  typesList,
  products,
  runStorefrontRequest,
  setActiveSection,
  setOpenAddDialog,
  setSearchTerm,
  setPage,
  fetchAllProducts,
  rowsPerPage,
  setSelectedProductId,
  setOpenDeleteDialog,
}) => {
  const sectionData = manageData?.[section] || {};
  const [name, setName] = useState(sectionData.name || "");

  const isTypeMatched = typesList.some((t) => t.Type === (sectionData.name || ""));
  const [isManual, setIsManual] = useState(!isTypeMatched && (sectionData.name || "") !== "");
  const [selectedType, setSelectedType] = useState(isTypeMatched ? sectionData.name : "");
  const [manualName, setManualName] = useState(!isTypeMatched ? sectionData.name : "");

  // Sync state khi manageData thay đổi
  useEffect(() => {
    const currentName = sectionData.name || "";
    setName(currentName);
    const matched = typesList.some((t) => t.Type === currentName);
    setIsManual(!matched && currentName !== "");
    setSelectedType(matched ? currentName : "");
    setManualName(!matched ? currentName : "");
  }, [sectionData.name, typesList]);

  const handleSaveName = async (finalName) => {
    const result = await runStorefrontRequest(
      updateStorefrontSection(section, { name: finalName }),
    );

    if (result?.success) {
      setManageData(result.data);
      toast.success(`Cập nhật tên thành công`);
    }
  };


  const handleToggleDisplay = async (checked) => {
    const result = await runStorefrontRequest(
      updateStorefrontSection(section, { display: checked }),
    );
    if (result?.success) {
      setManageData(result.data);
      toast.success("Cập nhật trạng thái hiển thị thành công");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const toastId = toast.loading("Đang tải ảnh lên...");
    try {
      const uploadRes = await uploadStorefrontSectionImage(file);
      const uploadResult = await uploadRes.json();
      if (uploadResult.success) {
        const saveResult = await runStorefrontRequest(
          updateStorefrontSection(section, { image: uploadResult.imgUrl }),
        );
        if (saveResult?.success) {
          setManageData(saveResult.data);
          toast.success("Cập nhật ảnh đại diện thành công", { id: toastId });
        } else {
          toast.error("Không thể lưu ảnh vào danh mục", { id: toastId });
        }
      } else {
        toast.error(uploadResult.message || "Tải ảnh thất bại", { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi tải ảnh", { id: toastId });
    }
  };

  const handleDeleteImage = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa ảnh đại diện này?")) return;
    const saveResult = await runStorefrontRequest(
      updateStorefrontSection(section, { image: "" }),
    );
    if (saveResult?.success) {
      setManageData(saveResult.data);
      toast.success("Đã xóa ảnh đại diện");
    }
  };

  const displayTitle = section === "section1" 
    ? `Mục 1: ${sectionData.name || "Sản phẩm bán chạy"}`
    : `${displayName.replace("Mục ", "Mục ")}: ${sectionData.name || "Chưa đặt tên"}`;

  return (
    <Accordion defaultExpanded={defaultExpanded} sx={{ mb: 2, border: "1px solid #e2e8f0", borderRadius: "6px" }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box display="flex" justifyContent="space-between" alignItems="center" width="100%" sx={{ pr: 2 }}>
          <Typography sx={{ fontWeight: 700, color: "#1e293b" }}>
            {displayTitle}
          </Typography>
          <Box display="flex" alignItems="center" gap={1} onClick={(e) => e.stopPropagation()}>
            <IOSSwitch
              checked={sectionData.display !== false}
              onChange={(e) => handleToggleDisplay(e.target.checked)}
            />
            <Typography sx={{ fontSize: "12px", color: sectionData.display !== false ? "#22c55e" : "#64748b", fontWeight: 600 }}>
              {sectionData.display !== false ? "ĐANG HIỆN" : "ĐANG ẨN"}
            </Typography>
          </Box>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ borderTop: "1px solid #f1f5f9", p: 3 }}>
        <Box display="flex" flexWrap="wrap" gap={3} mb={3}>
          {/* Cấu hình Tên (Loại sản phẩm) */}
          <Box display="flex" flexDirection="column" gap={1} sx={{ minWidth: 320 }}>
            <Typography variant="subtitle2" color="textSecondary" sx={{ fontWeight: 600 }}>Tên hiển thị (Loại sản phẩm)</Typography>
            <Box display="flex" gap={1}>
              {section !== "section1" ? (
                <>
                  <FormControl size="small" sx={{ width: 180 }}>
                    <Select
                      value={isManual ? "__manual__" : selectedType}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "__manual__") {
                          setIsManual(true);
                        } else {
                          setIsManual(false);
                          setSelectedType(val);
                          handleSaveName(val);
                        }
                      }}
                    >
                      <MenuItem value="">-- Chọn Loại SP --</MenuItem>
                      {typesList.map((t, idx) => (
                        <MenuItem key={idx} value={t.Type}>{t.Type}</MenuItem>
                      ))}
                      <MenuItem value="__manual__">* Tự nhập chữ *</MenuItem>
                    </Select>
                  </FormControl>
                  {isManual && (
                    <TextField
                      size="small"
                      placeholder="Ghi tay tên mục"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      sx={{ width: 160 }}
                    />
                  )}
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleSaveName(isManual ? manualName : selectedType)}
                  >
                    Lưu
                  </Button>
                </>
              ) : (
                <>
                  <TextField
                    size="small"
                    placeholder="Tên mục bán chạy"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    sx={{ width: 220 }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleSaveName(name)}
                  >
                    Lưu
                  </Button>
                </>
              )}
            </Box>
          </Box>

          {/* Cấu hình Ảnh đại diện bên trái (Chỉ dành cho mục 2 -> 11) */}
          {section !== "section1" && (
            <Box display="flex" flexDirection="column" gap={1} sx={{ minWidth: 320 }}>
              <Typography variant="subtitle2" color="textSecondary" sx={{ fontWeight: 600 }}>Ảnh cứng giới thiệu bên trái</Typography>
              <Box display="flex" alignItems="center" gap={2}>
                {sectionData.image ? (
                  <Box position="relative" sx={{ width: 60, height: 60, border: "1px dashed #ccc", borderRadius: "4px", overflow: "hidden" }}>
                    <img src={sectionData.image} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </Box>
                ) : (
                  <Box sx={{ width: 60, height: 60, border: "1px dashed #cbd5e1", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "10px", textAlign: "center", p: 1 }}>
                    Chưa có ảnh
                  </Box>
                )}
                <Box>
                  <Box display="flex" gap={1}>
                    <Button variant="outlined" component="label" size="small">
                      Tải ảnh lên
                      <input type="file" hidden accept="image/*" onChange={handleImageUpload} />
                    </Button>
                    {sectionData.image && (
                      <Button variant="outlined" color="error" size="small" onClick={handleDeleteImage}>
                        Xóa ảnh
                      </Button>
                    )}
                  </Box>
                  <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: "block", fontSize: "11px" }}>
                    * Kích thước đề xuất: Tỷ lệ dọc 3:4 hoặc 9:16 (Ví dụ: 600x800 px hoặc 1080x1920 px) để hiển thị đẹp nhất.
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </Box>

        {/* Bảng sản phẩm */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: "#334155" }}>
            Danh sách sản phẩm ({ (sectionData.productId || []).length })
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => {
              setActiveSection(section);
              setOpenAddDialog(true);
              setSearchTerm("");
              setPage(0);
              fetchAllProducts("", 1, rowsPerPage);
            }}
          >
            Thêm sản phẩm
          </Button>
        </Box>

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tên</TableCell>
                <TableCell>Hình ảnh</TableCell>
                <TableCell>Loại</TableCell>
                <TableCell>Thương hiệu</TableCell>
                <TableCell>Cụm</TableCell>
                <TableCell>Thiết bị</TableCell>
                <TableCell align="center">Hành động</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(sectionData.productId || []).length > 0 ? (
                (sectionData.productId || []).map((id) => {
                  const product = products.find((p) => p._id === id) || {};
                  return (
                    <TableRow key={id}>
                      <TableCell>{product.name || "N/A"}</TableCell>
                      <TableCell>
                        {product.variant?.[0]?.imgUrl ? (
                          <img
                            src={product.variant?.[0]?.imgUrl}
                            alt={product.name || "Sản phẩm"}
                            style={{ width: 40, height: 40, objectFit: "contain" }}
                          />
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell>{product.type || "N/A"}</TableCell>
                      <TableCell>{product.brand || "N/A"}</TableCell>
                      <TableCell>{product.section || "N/A"}</TableCell>
                      <TableCell>{product.value || "N/A"}</TableCell>
                      <TableCell align="center">
                        <IconButton
                          onClick={() => {
                            setActiveSection(section);
                            setSelectedProductId(id);
                            setOpenDeleteDialog(true);
                          }}
                          color="error"
                          size="small"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} align="center">Chưa có sản phẩm nào</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
};

const SectionDisplay = () => {
  const [manageData, setManageData] = useState(null);
  const [products, setProducts] = useState([]);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [typesList, setTypesList] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [activeSection, setActiveSection] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const navigate = useNavigate();

  const runStorefrontRequest = async (request) => {
    try {
      const response = await request;

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
  };

  // Lấy dữ liệu manages
  const fetchManageData = async () => {
    setLoading(true);
    const result = await runStorefrontRequest(
      getStorefrontManagement({ includeJsonHeader: true }),
    );
    if (result?.success) {
      setManageData(result.data);
      await fetchProductsByIds(result.data);
    }
    setLoading(false);
  };

  // Lấy danh sách Loại sản phẩm
  const fetchTypes = async () => {
    const result = await runStorefrontRequest(getStorefrontProductTypes());
    if (result) {
      const normalized = Array.isArray(result) ? result : result.value || [];
      setTypesList(normalized);
    }
  };

  // Lấy sản phẩm theo IDs
  const fetchProductsByIds = async (manageData) => {
    if (!manageData) return;
    const allProductIds = [
      ...(manageData.section1?.productId || []),
      ...(manageData.section2?.productId || []),
      ...(manageData.section3?.productId || []),
      ...(manageData.section4?.productId || []),
      ...(manageData.section5?.productId || []),
      ...(manageData.section6?.productId || []),
      ...(manageData.section7?.productId || []),
      ...(manageData.section8?.productId || []),
      ...(manageData.section9?.productId || []),
      ...(manageData.section10?.productId || []),
      ...(manageData.section11?.productId || []),
    ];

    if (allProductIds.length === 0) {
      setProducts([]);
      return;
    }

    const result = await runStorefrontRequest(
      getStorefrontProductsByIds(allProductIds),
    );

    if (result?.success) {
      setProducts(result.products || []);
    }
  };

  // Lấy tất cả sản phẩm với tìm kiếm và phân trang
  const fetchAllProducts = async (search = "", pageNum = 1, limit = rowsPerPage) => {
    const result = await runStorefrontRequest(
      searchStorefrontProducts({ search, page: pageNum, limit }),
    );
    if (result?.products) {
      setAvailableProducts(result.products);
    }
  };

  // Chuyển display thành true cho sản phẩm
  const toggleDisplayToTrue = async (productId) => {
    const result = await runStorefrontRequest(
      toggleStorefrontProductDisplay(productId),
    );
    return result?.product?.display ?? null;
  };

  // Thêm sản phẩm
  const handleAddProduct = async (section, productId) => {
    if (!manageData || !manageData[section]) {
      toast.error(`Dữ liệu cho ${section} chưa được tải`);
      return;
    }

    const productToAdd =
      availableProducts.find((p) => p._id === productId) ||
      products.find((p) => p._id === productId);
    if (!productToAdd) {
      toast.error("Không tìm thấy sản phẩm để thêm");
      return;
    }

    let updatedDisplay = productToAdd.display;
    if (!productToAdd.display) {
      updatedDisplay = await toggleDisplayToTrue(productId);
      if (updatedDisplay === null) return;

      setProducts((prev) =>
        prev.map((p) => (p._id === productId ? { ...p, display: updatedDisplay } : p))
      );
      setAvailableProducts((prev) =>
        prev.map((p) => (p._id === productId ? { ...p, display: updatedDisplay } : p))
      );
    }

    const currentProductIds = manageData[section].productId || [];
    const result = await runStorefrontRequest(
      updateStorefrontSection(section, {
        productId: [...new Set([...currentProductIds, productId])],
      }),
    );

    if (result?.success) {
      setManageData(result.data);
      await fetchProductsByIds(result.data);
      setOpenAddDialog(false);
      toast.success("Thêm sản phẩm thành công");
    }
  };

  // Xóa sản phẩm
  const handleDeleteProduct = async () => {
    if (!manageData || !manageData[activeSection]) {
      toast.error(`Dữ liệu cho ${activeSection} chưa được tải`);
      return;
    }

    const currentProductIds = manageData[activeSection].productId || [];
    const updatedProductIds = currentProductIds.filter((id) => id !== selectedProductId);
    const result = await runStorefrontRequest(
      updateStorefrontSection(activeSection, {
        productId: updatedProductIds,
      }),
    );

    if (result?.success) {
      setManageData(result.data);
      await fetchProductsByIds(result.data);
      setOpenDeleteDialog(false);
      toast.success("Xóa sản phẩm thành công");
    }
  };

  // Tìm kiếm sản phẩm với debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (openAddDialog) {
        fetchAllProducts(searchTerm, page + 1, rowsPerPage);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, page, rowsPerPage, openAddDialog]);

  // Lấy dữ liệu ban đầu
  useEffect(() => {
    fetchManageData();
    fetchTypes();
  }, []);

  // Xử lý phân trang
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  if (loading && !manageData) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" p={3}>
        <CircularProgress />
        <Typography mt={2}>Đang tải dữ liệu...</Typography>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <div className="sticky-header">
        <Typography variant="h4" mb={1}>
          Quản lý hiển thị mục sản phẩm
        </Typography>
        <Typography variant="body2" mb={3} sx={{ fontWeight: 550, color: '#e53935' }}>
          * Ghi chú: Mục 1 cần tối thiểu 6 sản phẩm, các mục còn lại cần tối thiểu 5 sản phẩm để hiển thị trên trang chủ.
        </Typography>
      </div>
      {manageData ? (
        <>
          {[...Array(11)].map((_, i) => {
            const secNum = i + 1;
            return (
              <SectionComponent
                key={`section${secNum}`}
                section={`section${secNum}`}
                displayName={`Mục ${secNum}`}
                defaultExpanded={secNum === 1}
                manageData={manageData}
                setManageData={setManageData}
                typesList={typesList}
                products={products}
                runStorefrontRequest={runStorefrontRequest}
                setActiveSection={setActiveSection}
                setOpenAddDialog={setOpenAddDialog}
                setSearchTerm={setSearchTerm}
                setPage={setPage}
                fetchAllProducts={fetchAllProducts}
                rowsPerPage={rowsPerPage}
                setSelectedProductId={setSelectedProductId}
                setOpenDeleteDialog={setOpenDeleteDialog}
              />
            );
          })}
        </>
      ) : (
        <Typography>Không có dữ liệu để hiển thị</Typography>
      )}

      <Dialog open={openAddDialog} onClose={() => setOpenAddDialog(false)} disableScrollLock maxWidth="md" fullWidth>
        <DialogTitle>Thêm sản phẩm</DialogTitle>
        <DialogContent>
          <Box display="flex" gap={2} mb={2} mt={1}>
            <TextField
              label="Tìm kiếm sản phẩm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
            />
            <Button variant="contained" onClick={() => fetchAllProducts(searchTerm, page + 1, rowsPerPage)}>
              Tìm kiếm
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Tên</TableCell>
                  <TableCell>Hình ảnh</TableCell>
                  <TableCell>Loại</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {availableProducts.map((product) => (
                  <TableRow
                    key={product._id}
                    hover
                    onClick={() => handleAddProduct(activeSection, product._id)}
                    style={{ cursor: "pointer" }}
                  >
                    <TableCell>{product.name || "N/A"}</TableCell>
                    <TableCell>
                      {product.variant?.[0]?.imgUrl ? (
                        <img
                          src={product.variant[0].imgUrl}
                          alt={product.name || "Sản phẩm"}
                          style={{ width: 50, height: 50, objectFit: "cover" }}
                        />
                      ) : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell>{product.type || "N/A"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={availableProducts.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddDialog(false)}>Hủy</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDeleteDialog} onClose={() => setOpenDeleteDialog(false)} disableScrollLock>
        <DialogTitle>Xác nhận xóa</DialogTitle>
        <DialogContent>
          Bạn có chắc chắn muốn xóa sản phẩm này khỏi mục hiển thị?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Hủy</Button>
          <Button onClick={handleDeleteProduct} color="error">
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SectionDisplay;
