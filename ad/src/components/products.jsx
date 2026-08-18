
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  TextField,
  Autocomplete,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  Checkbox,
  Switch,
  Paper,
  Box,
  Typography,
} from "@mui/material";
import "./style/products.css";
import toast from "react-hot-toast";
import { usePermissions } from "../context/usepermissions";
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_UPLOAD_SETTINGS,
} from "../settings/imageUpload";
import ProductTechDocs from "./producttechdocs";
import HomeCategoryIcon from "./homecategoryicon";
import {
  CATEGORY_ICON_OPTIONS,
  getCategoryIcon,
  normalizeTypeName,
} from "../utils/homecategoryicons";
import { formatVariantPrice } from "../utils/productpricing";
import {
  bulkDeleteProducts,
  createProduct,
  createProductBrand,
  createProductSection,
  deleteProductBrand,
  deleteProductSection,
  deleteProductType,
  getProductSections,
  getProductSectionValues,
  getProductTaxonomy,
  getProducts,
  saveProductType,
  toggleProductDisplay,
  updateProductSection,
  uploadProductImage,
} from "../api/productManagementApi";

const createEmptyProduct = () => ({
  type: "",
  name: "",
  code: "",
  vat: "",
  brand: "",
  section: "",
  value: "",
  price: "",
  infoDoc: {
    manual: "",
    dataSheet: "",
    catalog: "",
    others: "",
  },
  documents: [],
  warranty: "",
  solution: "",
  description: "",
  features: "",
  operatingMethod: "",
  advantages: "",
  specifications: "",
});

const productImageExtensionsText = PRODUCT_IMAGE_UPLOAD_SETTINGS.extensions.join(", ");
const WARRANTY_OPTIONS = ["3 tháng", "6 tháng", "12 tháng", "Theo NSX"];

const removeVietnameseTones = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
};

const Products = () => {
  const { can } = usePermissions();
  const canCreate = can("product.create");
  const canEdit = can("product.edit");
  const canDelete = can("product.delete");
  const [products, setProducts] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const topScrollRef = useRef(null);
  const tableContainerRef = useRef(null);
  const [tableWidth, setTableWidth] = useState(1600);
  const stickyHeaderRef = useRef(null);
  const [stickyHeight, setStickyHeight] = useState(0);

  useEffect(() => {
    if (stickyHeaderRef.current) {
      const handleResize = () => {
        setStickyHeight(stickyHeaderRef.current.offsetHeight);
      };
      handleResize();
      window.addEventListener("resize", handleResize);
      const observer = new ResizeObserver(handleResize);
      observer.observe(stickyHeaderRef.current);
      return () => {
        window.removeEventListener("resize", handleResize);
        observer.disconnect();
      };
    }
  }, []);

  const handleTopScroll = () => {
    if (tableContainerRef.current && topScrollRef.current) {
      if (tableContainerRef.current.scrollLeft !== topScrollRef.current.scrollLeft) {
        tableContainerRef.current.scrollLeft = topScrollRef.current.scrollLeft;
      }
    }
  };

  const handleTableScroll = () => {
    if (tableContainerRef.current && topScrollRef.current) {
      if (topScrollRef.current.scrollLeft !== tableContainerRef.current.scrollLeft) {
        topScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
      }
    }
  };

  useEffect(() => {
    const updateWidth = () => {
      if (tableContainerRef.current) {
        setTableWidth(tableContainerRef.current.scrollWidth);
      }
    };
    const timer = setTimeout(updateWidth, 300);
    window.addEventListener("resize", updateWidth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateWidth);
    };
  }, [products]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [isBrandDialogOpen, setIsBrandDialogOpen] = useState(false);
  const [openSectionDialog, setOpenSectionDialog] = useState(false);
  const [newProduct, setNewProduct] = useState(createEmptyProduct);
  const [newProductImageFile, setNewProductImageFile] = useState(null);
  const [newProductImagePreviewUrl, setNewProductImagePreviewUrl] = useState("");
  const [isUploadingProductImage, setIsUploadingProductImage] = useState(false);
  const newProductImageInputRef = useRef(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const [brands, setBrands] = useState([]);
  const [types, setTypes] = useState([]);
  const [sections, setSections] = useState([]);
  const [values, setValues] = useState([]);
  const [sectionName, setSectionName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [typeName, setTypeName] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [typeIcon, setTypeIcon] = useState("ri-tb-box-multiple");
  const [typeIconSearch, setTypeIconSearch] = useState("");
  const [isSavingType, setIsSavingType] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [, setError] = useState("");

  const selectedTypeForEditor = types.find((type) => type._id === selectedTypeId);
  const matchingTypeForEditor = types.find(
    (type) => normalizeTypeName(type.Type) === normalizeTypeName(typeName),
  );
  const typeToEdit = selectedTypeForEditor || matchingTypeForEditor;
  const normalizedIconSearch = normalizeTypeName(typeIconSearch);
  const filteredTypeIconOptions = CATEGORY_ICON_OPTIONS.filter((option) =>
    !normalizedIconSearch
    || normalizeTypeName(option.label).includes(normalizedIconSearch),
  );

  const initialFilters = {
    search: "",
    code: "", // thêm mới
    brand: "Tất cả",
    type: "Tất cả",
    section: "Tất cả",
    value: "Tất cả",
    sortBy: "createdAt",
    sortOrder: "desc",
  };

  const getInitialFilters = () => {
    const savedFilters = sessionStorage.getItem("productFilters");
    return savedFilters ? JSON.parse(savedFilters) : initialFilters;
  };

  const [tempFilters, setTempFilters] = useState(getInitialFilters());

  const normalizeFilters = (filters) => ({
    ...filters,
    brand: filters.brand === "Tất cả" ? "" : filters.brand,
    type: filters.type === "Tất cả" ? "" : filters.type,
    section: filters.section === "Tất cả" ? "" : filters.section,
    value: filters.value === "Tất cả" ? "" : filters.value,
    sortBy: filters.sortBy || "createdAt",
    sortOrder: filters.sortOrder || "desc",
    code: filters.code || "",
    adjusted: showUnadjustedOnly ? "false" : "",
  });

  const [filters, setFilters] = useState(getInitialFilters);
  const [showUnadjustedOnly, setShowUnadjustedOnly] = useState(false);
  const [quickSearch, setQuickSearch] = useState(() => {
    const initFilters = getInitialFilters();
    return initFilters.search || "";
  });

  const searchSuggestions = React.useMemo(() => {
    const suggestions = new Set();
    products.forEach((p) => {
      if (p.name) suggestions.add(p.name);
      if (p.code) suggestions.add(p.code);
      if (p.brand) suggestions.add(p.brand);
    });
    return Array.from(suggestions);
  }, [products]);

  const uniqueProductNames = React.useMemo(() => {
    const names = products.map((p) => p.name).filter(Boolean);
    return Array.from(new Set(names));
  }, [products]);

  const uniqueProductCodes = React.useMemo(() => {
    const codes = products.map((p) => p.code).filter(Boolean);
    return Array.from(new Set(codes));
  }, [products]);
  const [openSearchDialog, setOpenSearchDialog] = useState(false);

  useEffect(() => {
    const savedFilters = sessionStorage.getItem("productFilters");
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        setFilters(parsed);
        setTempFilters(parsed);
        setQuickSearch(parsed.search || "");
        setCurrentPage(1);
      } catch (e) {
        console.error("Lỗi parse filters trên mount:", e);
      }
    }
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setFilters((prev) => {
        if (prev.search === quickSearch) return prev;
        return { ...prev, search: quickSearch };
      });
      setTempFilters((prev) => {
        if (prev.search === quickSearch) return prev;
        return { ...prev, search: quickSearch };
      });
      setCurrentPage(1);
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [quickSearch]);

  useEffect(() => {
    setQuickSearch(filters.search || "");
  }, [filters.search]);

  useEffect(() => {
    setSelectedProductIds([]);
  }, [products]);

  const handleSelectAllClick = (event) => {
    if (event.target.checked) {
      const newSelecteds = products.map((n) => n._id);
      setSelectedProductIds(newSelecteds);
    } else {
      setSelectedProductIds([]);
    }
  };

  const handleSelectRow = (event, id) => {
    event.stopPropagation();
    const selectedIndex = selectedProductIds.indexOf(id);
    let newSelected = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selectedProductIds, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selectedProductIds.slice(1));
    } else if (selectedIndex === selectedProductIds.length - 1) {
      newSelected = newSelected.concat(selectedProductIds.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selectedProductIds.slice(0, selectedIndex),
        selectedProductIds.slice(selectedIndex + 1)
      );
    }
    setSelectedProductIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    const confirmDelete = window.confirm(
      `Bạn có chắc chắn muốn xóa ${selectedProductIds.length} sản phẩm đã chọn? Hành động này không thể hoàn tác.`
    );
    if (!confirmDelete) return;

    try {
      await bulkDeleteProducts(selectedProductIds);

      toast.success("Xóa hàng loạt sản phẩm thành công");
      setSelectedProductIds([]);
      fetchProducts(currentPage, rowsPerPage);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Xóa hàng loạt thất bại");
    }
  };

  const navigate = useNavigate();

  const handleRowClick = (_id) => {
    navigate(`/product/${_id}`);
  };

  const fetchProducts = async (page = currentPage, limit = rowsPerPage) => {
    try {
      const data = await getProducts({
        page,
        limit,
        filters: normalizeFilters(filters),
      });
      setProducts(data.products || []);
      setTotalPages(Math.ceil(data.total / limit));
    } catch (error) {
      console.error("Error fetching products:", error);
      setProducts([]);
    }
  };

  const fetchData = async () => {
    try {
      const { brands: brandsData, types: typesData, sections: sectionData } =
        await getProductTaxonomy();
      setBrands(brandsData);
      setTypes(typesData);
      setSections(sectionData);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const fetchSections = async () => {
    try {
      const data = await getProductSections();
      setSections(data);
    } catch (error) {
      console.error("Error fetching section:", error);
    }
  };

  const fetchValues = async (sectionName) => {
    try {
      const data = await getProductSectionValues(sectionName);
      setValues(data);
    } catch {
      toast.error("Mục này chưa có thiết bị");
      setValues([]);
    }
  };

  // Hàm xử lý thay đổi display
  const handleToggleDisplay = async (productId) => {
    try {
      const updatedProduct = await toggleProductDisplay(productId);
      toast.success(updatedProduct.message);

      setProducts((prevProducts) =>
        prevProducts.map((product) =>
          product._id === productId
            ? { ...product, display: updatedProduct.product.display }
            : product
        )
      );
    } catch (error) {
      console.error("Error toggling display:", error);
      toast.error(error.message);
    }
  };

  const handlePageChange = (event, newPage) => {
    setCurrentPage(newPage + 1);
    fetchProducts(newPage + 1);
  };

  const handleRowsPerPageChange = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1);
    fetchProducts(1, newRowsPerPage);
  };

  useEffect(() => {
    sessionStorage.setItem("productFilters", JSON.stringify(filters));
    fetchProducts(currentPage);
  }, [filters]);

  useEffect(() => {
    fetchData();
    fetchSections();
    fetchProducts(currentPage);
    if (newProduct.section) {
      fetchValues(newProduct.section);
    } else {
      setValues([]);
    }
  }, [filters, newProduct.section]);

  useEffect(() => {
    setCurrentPage(1);
    fetchProducts(1);
  }, [showUnadjustedOnly]);

  useEffect(() => {
    if (!newProductImageFile) {
      setNewProductImagePreviewUrl("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(newProductImageFile);
    setNewProductImagePreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [newProductImageFile]);

  const resetNewProductForm = () => {
    setNewProduct(createEmptyProduct());
    setNewProductImageFile(null);
    if (newProductImageInputRef.current) {
      newProductImageInputRef.current.value = "";
    }
  };

  const openDialog = () => setIsDialogOpen(true);
  const closeDialog = () => {
    setIsDialogOpen(false);
    resetNewProductForm();
  };
  const openBrandDialog = () => setIsBrandDialogOpen(true);
  const closeBrandDialog = () => {
    setBrandName("");
    setIsBrandDialogOpen(false);
  };
  const openTypeDialog = () => setIsTypeDialogOpen(true);
  const closeTypeDialog = () => {
    setTypeName("");
    setSelectedTypeId("");
    setTypeIcon("ri-tb-box-multiple");
    setTypeIconSearch("");
    setIsTypeDialogOpen(false);
  };

  const selectTypeForEditing = (type) => {
    if (!type) {
      setSelectedTypeId("");
      setTypeName("");
      setTypeIcon("ri-tb-box-multiple");
      return;
    }
    if (typeof type === "string") {
      setSelectedTypeId("");
      setTypeName(type);
      setTypeIcon(getCategoryIcon(type));
      return;
    }
    setSelectedTypeId(type._id || "");
    setTypeName(type.Type || "");
    setTypeIcon(type.icon || getCategoryIcon(type.Type));
  };

  const startNewType = () => {
    setSelectedTypeId("");
    setTypeName("");
    setTypeIcon("ri-tb-box-multiple");
    setTypeIconSearch("");
  };
  const handleOpenSectionDialog = () => setOpenSectionDialog(true);
  const handleCloseSectionDialog = () => {
    setOpenSectionDialog(false);
    setSectionName("");
    setNewSectionName("");
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    setNewProduct((prevState) => {
      if (["manual", "dataSheet", "catalog", "others"].includes(name)) {
        return {
          ...prevState,
          infoDoc: {
            ...prevState.infoDoc,
            [name]: value,
          },
        };
      }

      return {
        ...prevState,
        [name]: value,
      };
    });
  };

  const isAllowedProductImageFile = (file) => {
    const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
    const hasAllowedExtension = PRODUCT_IMAGE_UPLOAD_SETTINGS.extensions.includes(extension);
    const hasAllowedMime = file.type
      ? PRODUCT_IMAGE_UPLOAD_SETTINGS.mimeTypes.includes(file.type)
      : true;

    return hasAllowedExtension && hasAllowedMime;
  };

  const handleNewProductImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > PRODUCT_IMAGE_UPLOAD_SETTINGS.maxSizeBytes) {
      toast.error(`Dung lượng ảnh tối đa ${PRODUCT_IMAGE_UPLOAD_SETTINGS.maxSizeLabel}`);
      e.target.value = "";
      return;
    }

    if (!isAllowedProductImageFile(file)) {
      toast.error(`Chỉ chấp nhận ảnh: ${productImageExtensionsText}`);
      e.target.value = "";
      return;
    }

    setNewProductImageFile(file);
  };

  const uploadNewProductImage = async () => {
    if (!newProductImageFile) return "";

    return uploadProductImage(newProductImageFile);
  };

  const buildProductPayload = (imgUrl = "") => {
    if (!imgUrl) return { ...newProduct };

    return {
      ...newProduct,
      variant: [
        {
          price: newProduct.price || "",
          importPrice: "",
          earn: 25,
          imgUrl,
          color: "",
          shape: "",
          buttonCount: "",
          frame: "",
          quantityForSale: 0,
          quantityInStorage: 0,
          note: "",
        },
      ],
    };
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      setIsUploadingProductImage(true);
      const imgUrl = await uploadNewProductImage();
      const productPayload = buildProductPayload(imgUrl);
      const { status, data: result } = await createProduct(productPayload);
      if (status === 201) {
        toast.success("Thêm sản phẩm thành công");
        fetchProducts(currentPage);
        closeDialog();
      } else {
        toast.error(result.message || "Lỗi khi thêm sản phẩm");
      }
    } catch (error) {
      console.error("Lỗi khi thêm sản phẩm:", error);
      toast.error(error.message || "Lỗi khi thêm sản phẩm");
    } finally {
      setIsUploadingProductImage(false);
    }
  };

  const handleCreateBrand = async () => {
    try {
      await createProductBrand(brandName);
      toast.success("Thêm hãng thành công");
      fetchData();
      closeBrandDialog();
    } catch (error) {
      console.error("Error creating type:", error.message);
      alert(`Error: ${error.message}`);
    }
  };

  const handleSaveType = async () => {
    const normalizedName = normalizeTypeName(typeName);
    const typeToUpdate = typeToEdit;

    if (!normalizedName) {
      toast.error("Vui lòng nhập tên loại sản phẩm");
      return;
    }
    if (typeToUpdate && !canEdit) {
      toast.error("Bạn không có quyền sửa loại sản phẩm");
      return;
    }
    if (!typeToUpdate && !canCreate) {
      toast.error("Bạn không có quyền thêm loại sản phẩm");
      return;
    }

    setIsSavingType(true);
    try {
      const result = await saveProductType({
        typeId: typeToUpdate?._id,
        typeName,
        icon: typeIcon,
      });
      const updatedText = result.updatedProducts
        ? ` và cập nhật ${result.updatedProducts} sản phẩm`
        : "";
      toast.success(
        typeToUpdate
          ? `Cập nhật loại sản phẩm thành công${updatedText}`
          : "Thêm loại sản phẩm thành công",
      );
      await fetchData();
      closeTypeDialog();
    } catch (error) {
      console.error("Error saving type:", error.message);
      toast.error(error.message);
    } finally {
      setIsSavingType(false);
    }
  };

  const handleDeleteBrand = async () => {
    if (!brandName) {
      alert("Vui lòng chọn một hãng để xóa");
      return;
    }
    if (!window.confirm(`Bạn có chắc muốn hãng "${brandName}" không?`)) {
      return;
    }
    try {
      const brandToDelete = brands.find((brand) => brand.Brand === brandName);
      if (!brandToDelete || !brandToDelete._id) {
        alert("Không tìm thấy hãng này để xóa.");
        return;
      }
      await deleteProductBrand(brandToDelete._id);
      setTypeName("");
      fetchData();
      toast.success("Xóa hãng thành công!");
      closeBrandDialog();
    } catch (error) {
      console.error("Error deleting type:", error.message);
      alert(`Error: ${error.message}`);
    }
  };

  const handleDeleteType = async () => {
    const normalizedName = normalizeTypeName(typeName);
    const typeToDelete = types.find((type) => type._id === selectedTypeId)
      || types.find((type) => normalizeTypeName(type.Type) === normalizedName);
    if (!typeToDelete) {
      toast.error("Vui lòng chọn một loại sản phẩm có sẵn để xóa");
      return;
    }
    if (!canDelete) {
      toast.error("Bạn không có quyền xóa loại sản phẩm");
      return;
    }
    if (
      !window.confirm(`Bạn có chắc muốn xóa loại sản phẩm "${typeToDelete.Type}" không?`)
    ) {
      return;
    }
    try {
      await deleteProductType(typeToDelete._id);
      await fetchData();
      toast.success("Xóa loại sản phẩm thành công!");
      closeTypeDialog();
    } catch (error) {
      console.error("Error deleting type:", error.message);
      toast.error(error.message);
    }
  };

  const handleAddSection = async () => {
    if (!sectionName.trim()) {
      setError("Tên cụm không được để trống!");
      return;
    }
    try {
      await createProductSection(sectionName);
      fetchSections();
      setSectionName("");
      toast.success("Thêm cụm thành công");
      handleCloseSectionDialog();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteSection = async () => {
    if (!sectionName) {
      toast.error("Vui lòng chọn một cụm sản phẩm để xóa!");
      return;
    }
    try {
      await deleteProductSection(sectionName);
      fetchSections();
      setSectionName("");
      handleCloseSectionDialog();
      toast.success("Xóa thành công!");
    } catch (error) {
      console.error("Lỗi khi xóa:", error);
      toast.info(error.message);
    }
  };

  const handleEditSection = async () => {
    if (!sectionName.trim() || !newSectionName.trim()) {
      toast.error("Vui lòng nhập cả tên cũ và tên mới!");
      return;
    }
    try {
      await updateProductSection(sectionName, newSectionName);
      toast.success("Cập nhật cụm thành công!");
      fetchSections();
      handleCloseSectionDialog();
    } catch (error) {
      console.error("Error updating section:", error);
      toast.error(error.message || "Lỗi khi cập nhật cụm");
    }
  };

  const cellStyle = {
    width: "100%",
    backgroundColor: "inherit",
    fontSize: "0.875rem",
    lineHeight: "1.5",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflow: "hidden",
    display: "block",
    maxHeight: "7em",
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setTempFilters((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "section" ? { value: "Tất cả" } : {}),
    }));
    if (name === "section" && value !== "Tất cả") {
      fetchValues(value);
    } else if (name === "section" && value === "Tất cả") {
      setValues([]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFilters(tempFilters);
    setCurrentPage(1);
    setOpenSearchDialog(false);
  };

  const resetFilters = () => {
    setTempFilters(initialFilters);
    setFilters(initialFilters);
    sessionStorage.removeItem("productFilters");
    setCurrentPage(1);
  };

  const filterForm = (
    <form onSubmit={handleSubmit} className="filter-product-string">
      <Autocomplete
        freeSolo
        size="small"
        options={uniqueProductNames}
        value={tempFilters.search}
        onInputChange={(event, newInputValue) => {
          setTempFilters((prev) => ({ ...prev, search: newInputValue }));
        }}
        onChange={(event, newValue) => {
          setTempFilters((prev) => ({ ...prev, search: newValue || "" }));
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
            label="Tìm kiếm theo tên"
            variant="outlined"
            margin="normal"
          />
        )}
      />
      <Autocomplete
        freeSolo
        size="small"
        options={uniqueProductCodes}
        value={tempFilters.code || ""}
        onInputChange={(event, newInputValue) => {
          setTempFilters((prev) => ({ ...prev, code: newInputValue }));
        }}
        onChange={(event, newValue) => {
          setTempFilters((prev) => ({ ...prev, code: newValue || "" }));
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
            label="Mã sản phẩm"
            variant="outlined"
            margin="normal"
          />
        )}
      />
      <Select
        value={tempFilters.brand || "Tất cả"}
        onChange={(e) =>
          handleFilterChange({
            target: { name: "brand", value: e.target.value },
          })
        }
        size="small"
        fullWidth
        sx={{ margin: "8px 0" }}
      >
        <MenuItem value="Tất cả">Tất cả thương hiệu</MenuItem>
        {brands.map((brand, index) => (
          <MenuItem key={index} value={brand.Brand}>
            {brand.Brand}
          </MenuItem>
        ))}
      </Select>
      <Select
        value={tempFilters.type || "Tất cả"}
        onChange={(e) =>
          handleFilterChange({
            target: { name: "type", value: e.target.value },
          })
        }
        size="small"
        fullWidth
        sx={{ margin: "8px 0" }}
      >
        <MenuItem value="Tất cả">Tất cả loại sản phẩm</MenuItem>
        {types.map((type, index) => (
          <MenuItem key={index} value={type.Type}>
            {type.Type}
          </MenuItem>
        ))}
      </Select>
      <Select
        value={tempFilters.section || "Tất cả"}
        onChange={handleFilterChange}
        name="section"
        size="small"
        fullWidth
        sx={{ margin: "8px 0" }}
      >
        <MenuItem value="Tất cả">Tất cả cụm</MenuItem>
        {sections.map((section, index) => (
          <MenuItem key={index} value={section}>
            {section}
          </MenuItem>
        ))}
      </Select>
      <Select
        value={tempFilters.value || "Tất cả"}
        onChange={(e) =>
          handleFilterChange({
            target: { name: "value", value: e.target.value },
          })
        }
        disabled={tempFilters.section === "Tất cả"}
        size="small"
        fullWidth
        sx={{ margin: "8px 0" }}
      >
        <MenuItem value="Tất cả">Tất cả thiết bị</MenuItem>
        {values.map((value, index) => (
          <MenuItem key={index} value={value}>
            {value}
          </MenuItem>
        ))}
      </Select>
      <div
        style={{
          justifyContent: "center",
          marginTop: "16px",
          width: "full",
        }}
      >
        <Button type="submit" variant="contained" color="primary" fullWidth>
          Tìm kiếm
        </Button>
        <Button
          onClick={resetFilters}
          variant="outlined"
          color="error"
          fullWidth
          sx={{ marginTop: "1rem" }}
        >
          Xóa bộ lọc
        </Button>
      </div>
    </form>
  );

  return (
    <div className="main-product-add-container" style={{ "--sticky-header-height": `${stickyHeight}px` }}>
      <div className="sticky-header" ref={stickyHeaderRef}>
        <h2>Danh mục sản phẩm</h2>
        <div className="product-add-functions">
          <div className="product-add-button-add">
            {(canCreate || canEdit) && (
              <Button
                variant="contained"
                color="primary"
                className="open-product-add-dialog"
                onClick={openDialog}
              >
                Thêm sản phẩm
              </Button>
            )}
            {canCreate && (
              <Button
                variant="contained"
                color="primary"
                className="open-product-add-dialog"
                onClick={openBrandDialog}
                sx={{ marginLeft: 2 }}
              >
                Quản lý hãng
              </Button>
            )}
            {canCreate && (
              <Button
                variant="contained"
                color="primary"
                className="open-product-add-dialog"
                onClick={openTypeDialog}
                sx={{ marginLeft: 2 }}
              >
                Quản lý loại sản phẩm
              </Button>
            )}
            {canCreate && (
              <Button
                variant="contained"
                color="primary"
                className="open-product-add-dialog"
                sx={{ marginLeft: 2 }}
                onClick={handleOpenSectionDialog}
              >
                Quản lý cụm thiết bị
              </Button>
            )}
            <Button
              variant={showUnadjustedOnly ? "contained" : "outlined"}
              color="warning"
              sx={{ marginLeft: 2, minWidth: 220, whiteSpace: "nowrap" }}
              onClick={() => setShowUnadjustedOnly(!showUnadjustedOnly)}
            >
              {showUnadjustedOnly ? "Hiển thị tất cả" : "Sản phẩm chưa điều chỉnh"}
            </Button>
            {canDelete && selectedProductIds.length > 0 && (
              <Button
                variant="contained"
                color="error"
                size="small"
                sx={{ marginLeft: 1, minWidth: "fit-content", whiteSpace: "nowrap" }}
                onClick={handleBulkDelete}
              >
                Xóa ({selectedProductIds.length})
              </Button>
            )}
          </div>
          <div className="filter-desktop">
            <Autocomplete
              freeSolo
              size="small"
              options={searchSuggestions}
              value={quickSearch}
              onInputChange={(event, newInputValue) => {
                setQuickSearch(newInputValue);
              }}
              onChange={(event, newValue) => {
                setQuickSearch(newValue || "");
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
                  label="Tìm kiếm nhanh..."
                  placeholder="Tìm theo tên, mã, hãng..."
                  variant="outlined"
                  sx={{
                    width: 250,
                    mr: 2,
                    bgcolor: "white",
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: "#9EADBF",
                      borderWidth: "1.5px",
                    },
                  }}
                />
              )}
            />
            <Button
              className="filter-button"
              onClick={() => setOpenSearchDialog(true)}
              variant="contained"
              color="primary"
            >
              Bộ lọc
            </Button>
          </div>
        </div>
      </div>

      {/* Thanh cuộn ngang phụ ở trên */}
      <div 
        ref={topScrollRef} 
        onScroll={handleTopScroll} 
        className="top-scrollbar-sticky"
        style={{ 
          position: "sticky",
          top: `${stickyHeight}px`,
          zIndex: 99,
          backgroundColor: "#fff",
          overflowX: "auto", 
          overflowY: "hidden", 
          width: "100%", 
          height: "12px",
          paddingTop: "2px",
          paddingBottom: "2px",
          marginBottom: "6px",
          borderRadius: "4px",
        }}
      >
        <div style={{ width: `${tableWidth}px`, height: "1px" }} />
      </div>

      <div className="product-table-region">
        <TableContainer 
          ref={tableContainerRef}
          onScroll={handleTableScroll}
          component={Paper} 
          sx={{
            overflow: "auto",
            maxHeight: "calc(100vh - 280px)",
            scrollbarGutter: "stable",
            border: "1.5px solid #9EADBF",
          }}
        >
          <Table
            stickyHeader
            size="small"
            sx={{
              minWidth: 1724,
              width: "max(100%, 1724px)",
              tableLayout: "fixed",
              "& .MuiTableCell-root": {
                borderColor: "#C3CEDB",
              },
            }}
          >
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 68 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 236 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 108 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 136 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 132 }} />
              <col style={{ width: 260 }} />
            </colgroup>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#dedede" }}>
                <TableCell align="center" style={{ width: 40, padding: "0 8px" }}>
                  <Checkbox
                    indeterminate={selectedProductIds.length > 0 && selectedProductIds.length < products.length}
                    checked={products.length > 0 && selectedProductIds.length === products.length}
                    onChange={handleSelectAllClick}
                    color="primary"
                    size="small"
                    disabled={!canDelete}
                  />
                </TableCell>
                <TableCell align="center">Hiển thị</TableCell>
                <TableCell align="center">Loại</TableCell>
                <TableCell align="center">Tên</TableCell>
                <TableCell align="center">Mã sản phẩm</TableCell>
                <TableCell align="center">VAT</TableCell>
                <TableCell align="center">Ảnh</TableCell>
                <TableCell align="center">Giá</TableCell>
                <TableCell align="center">Hãng</TableCell>
                <TableCell align="center">Cụm</TableCell>
                <TableCell align="center">Thiết bị</TableCell>
                <TableCell align="center">Bảo hành</TableCell>
                <TableCell align="center">Số lượng tồn</TableCell>
                <TableCell align="center">Số lượng đã bán</TableCell>
                <TableCell align="center">Ghi chú</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((product) => (
                <TableRow
                  className="product-data"
                  key={product._id}
                  onClick={() => handleRowClick(product._id)}
                  hover
                  style={{ cursor: "pointer" }}
                >
                  <TableCell
                    align="center"
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 40, padding: "0 8px" }}
                  >
                    <Checkbox
                      checked={selectedProductIds.includes(product._id)}
                      onChange={(e) => handleSelectRow(e, product._id)}
                      color="primary"
                      size="small"
                      disabled={!canDelete}
                    />
                  </TableCell>
                  <TableCell
                    align="center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canEdit ? (
                      <Switch
                        checked={product.display}
                        color="success"
                        size="small"
                        onChange={() => handleToggleDisplay(product._id)}
                      />
                    ) : (
                      <Switch
                        checked={product.display}
                        color="success"
                        size="small"
                        disabled
                      />
                    )}
                  </TableCell>
                  <TableCell align="center">{product.type}</TableCell>
                  <TableCell align="center">
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div>{product.name}</div>
                      {product.adjusted === false && (
                        <div style={{ marginTop: "4px" }}>
                          <span style={{
                            display: "inline-block",
                            backgroundColor: "#ffebee",
                            color: "#c62828",
                            border: "1px solid #ef9a9a",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontSize: "0.75rem",
                            fontWeight: "bold"
                          }}>
                            Chưa điều chỉnh
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell align="center">{product.code}</TableCell>
                  <TableCell align="center">{product.vat || "N/A"}</TableCell>
                  <TableCell align="center">
{product.variant?.[0]?.imgUrl ? (
  <img
    className="img-products"
    src={product.variant?.[0]?.imgUrl}
    alt="Ảnh sản phẩm"
    style={{
      width: "50px",
      height: "50px",
      objectFit: "cover",
    }}
  />
) : (
  <span>Chưa có ảnh</span>
)}
                  </TableCell>
                  <TableCell align="center">
                    {formatVariantPrice(product.variant?.[0], "")}
                  </TableCell>
                  <TableCell align="center">{product.brand}</TableCell>
                  <TableCell align="center">{product.section}</TableCell>
                  <TableCell align="center">{product.value}</TableCell>
                  <TableCell align="center">{product.warranty}</TableCell>
                  <TableCell align="center">
                    {product.variant?.[0]?.quantityInStorage ?? "Chưa nhập"}
                  </TableCell>
                  <TableCell align="center">{product.purchaseCount}</TableCell>
                  <TableCell align="center" sx={{ verticalAlign: "middle" }}>
                    <div style={cellStyle}>
                      {product.variant?.[0]?.note || ""}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      <Dialog
        open={isDialogOpen}
        onClose={closeDialog}
        disableScrollLock
        scroll="paper"
        maxWidth="lg"
        fullWidth
        className="product-create-dialog"
      >
        <DialogTitle>Thêm sản phẩm mới</DialogTitle>
        <DialogContent>
          <form onSubmit={handleAddProduct} className="product-create-form">
            <div className="product-image-picker">
              <Button
                type="button"
                variant="outlined"
                component="label"
                disabled={isUploadingProductImage}
              >
                Thêm ảnh
                <input
                  ref={newProductImageInputRef}
                  type="file"
                  accept={PRODUCT_IMAGE_ACCEPT}
                  hidden
                  onChange={handleNewProductImageChange}
                />
              </Button>
              <span className="product-image-picker__hint">
                {newProductImageFile
                  ? newProductImageFile.name
                  : `${productImageExtensionsText} - tối đa ${PRODUCT_IMAGE_UPLOAD_SETTINGS.maxSizeLabel}`}
              </span>
              {newProductImagePreviewUrl && (
                <img
                  className="product-image-picker__preview"
                  src={newProductImagePreviewUrl}
                  alt="Ảnh sản phẩm"
                />
              )}
            </div>
            <div className="product-create-fields">
            <Autocomplete
              value={newProduct.type}
              onChange={(event, newValue) => {
                setNewProduct((prevState) => ({
                  ...prevState,
                  type: newValue,
                }));
              }}
              options={types.map((type) => type.Type)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Loại"
                  name="type"
                  required
                  fullWidth
                  margin="normal"
                  size="small"
                />
              )}
              freeSolo
            />
            <TextField
              label="Tên"
              name="name"
              value={newProduct.name}
              onChange={handleInputChange}
              required
              fullWidth
              margin="normal"
              size="small"
            />
            <TextField
              label="Mã sản phẩm"
              name="code"
              value={newProduct.code}
              onChange={handleInputChange}
              fullWidth
              margin="normal"
              size="small"
            />
            <TextField
              label="VAT"
              name="vat"
              value={newProduct.vat}
              onChange={handleInputChange}
              fullWidth
              margin="normal"
              size="small"
            />
            <Autocomplete
              value={newProduct.brand}
              onChange={(event, newValue) => {
                setNewProduct((prevState) => ({
                  ...prevState,
                  brand: newValue,
                }));
              }}
              options={brands.map((brand) => brand.Brand)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Hãng"
                  name="brand"
                  required
                  fullWidth
                  margin="normal"
                  size="small"
                />
              )}
              freeSolo
            />
            <Autocomplete
              value={newProduct.section}
              onChange={(event, newValue) => {
                setNewProduct((prevState) => ({
                  ...prevState,
                  section: newValue,
                }));
              }}
              options={sections}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Cụm"
                  name="section"
                  required
                  fullWidth
                  margin="normal"
                  size="small"
                />
              )}
              freeSolo
            />
            <Autocomplete
              value={newProduct.value}
              onChange={(event, newValue) => {
                setNewProduct((prevState) => ({
                  ...prevState,
                  value: newValue || "",
                }));
              }}
              options={values}
              getOptionLabel={(option) => option}
              disabled={!newProduct.section}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Thiết bị"
                  name="values"
                  fullWidth
                  margin="normal"
                  size="small"
                />
              )}
            />
            <Autocomplete
              freeSolo
              autoSelect
              options={WARRANTY_OPTIONS}
              value={newProduct.warranty || null}
              inputValue={newProduct.warranty || ""}
              onChange={(_, newValue) =>
                setNewProduct((previousProduct) => ({
                  ...previousProduct,
                  warranty: newValue || "",
                }))
              }
              onInputChange={(_, newInputValue) =>
                setNewProduct((previousProduct) => ({
                  ...previousProduct,
                  warranty: newInputValue,
                }))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Bảo hành"
                  required
                  fullWidth
                  margin="normal"
                  size="small"
                />
              )}
            />
            <TextField
              className="product-create-description"
              label="Mô tả"
              name="description"
              value={newProduct.description}
              onChange={handleInputChange}
              multiline
              rows={5}
              fullWidth
              margin="normal"
              size="small"
            />
            <TextField
              className="product-create-specifications"
              label="Thông số kỹ thuật"
              name="specifications"
              value={newProduct.specifications}
              onChange={handleInputChange}
              multiline
              rows={5}
              fullWidth
              margin="normal"
              size="small"
            />
            <ProductTechDocs
              value={newProduct.documents}
              onChange={(documents) =>
                setNewProduct((previousProduct) => ({ ...previousProduct, documents }))
              }
              disabled={!canCreate}
            />
            </div>
          </form>
        </DialogContent>
        <DialogActions>
          <Button
            type="submit"
            variant="contained"
            color="success"
            onClick={handleAddProduct}
            disabled={isUploadingProductImage}
          >
            {isUploadingProductImage ? "Đang thêm..." : "Thêm"}
          </Button>
          <Button variant="outlined" color="secondary" onClick={closeDialog}>
            Hủy
          </Button>
        </DialogActions>
      </Dialog>

      <TablePagination
        rowsPerPageOptions={[50, 100]}
        component="div"
        count={totalPages * rowsPerPage}
        rowsPerPage={rowsPerPage}
        page={currentPage - 1}
        onPageChange={handlePageChange}
        onRowsPerPageChange={handleRowsPerPageChange}
        sx={{
          mt: 1,
          border: "1.5px solid #9EADBF",
          borderRadius: "10px",
          backgroundColor: "#FFFFFF",
        }}
      />
      <Dialog
        open={isTypeDialogOpen}
        onClose={closeTypeDialog}
        disableScrollLock
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Quản lý loại sản phẩm</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={(event) => event.preventDefault()}>
            <Autocomplete
              value={types.find((type) => type._id === selectedTypeId) || null}
              inputValue={typeName}
              onChange={(event, newValue) => selectTypeForEditing(newValue)}
              onInputChange={(event, newValue, reason) => {
                setTypeName(newValue);
                if (reason === "clear") {
                  selectTypeForEditing(null);
                  return;
                }
                if (!selectedTypeId) {
                  const matchedType = types.find(
                    (type) => normalizeTypeName(type.Type) === normalizeTypeName(newValue),
                  );
                  if (matchedType) {
                    setSelectedTypeId(matchedType._id);
                    setTypeIcon(matchedType.icon || getCategoryIcon(matchedType.Type));
                  }
                }
              }}
              options={types}
              getOptionLabel={(option) => typeof option === "string" ? option : option.Type || ""}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              renderOption={(props, option) => {
                const { key, className = "", ...optionProps } = props;
                return (
                  <Box
                    key={key}
                    component="li"
                    {...optionProps}
                    className={`${className} product-type-option`}
                  >
                    <HomeCategoryIcon icon={option.icon || getCategoryIcon(option.Type)} />
                    <span>{option.Type}</span>
                  </Box>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tên loại sản phẩm"
                  name="type"
                  fullWidth
                  margin="normal"
                  size="small"
                  helperText={selectedTypeId
                    ? "Đang sửa loại có sẵn. Bạn có thể đổi cả tên và icon."
                    : "Tên mới sẽ tạo loại sản phẩm mới; tên trùng sẽ chuyển sang cập nhật."}
                />
              )}
              freeSolo
            />
            {selectedTypeId && (
              <Button size="small" onClick={startNewType} sx={{ mb: 1 }}>
                Chuyển sang thêm loại mới
              </Button>
            )}

            <Box className="product-type-icon-title">
              <Typography variant="subtitle1">Chọn icon</Typography>
              <Typography variant="caption" color="text.secondary">
                Đang hiển thị {filteredTypeIconOptions.length}/{CATEGORY_ICON_OPTIONS.length} biểu tượng
              </Typography>
            </Box>

            <Box className="product-type-icon-header">
              <Box className="product-type-icon-preview">
                <HomeCategoryIcon icon={typeIcon} />
                <Box>
                  <Typography variant="subtitle2">Icon đang chọn</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {CATEGORY_ICON_OPTIONS.find((option) => option.value === typeIcon)?.label
                      || typeIcon}
                  </Typography>
                </Box>
              </Box>
              <TextField
                value={typeIconSearch}
                onChange={(event) => setTypeIconSearch(event.target.value)}
                label="Tìm icon"
                size="small"
              />
            </Box>

            <Box className="product-type-icon-grid">
              {filteredTypeIconOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={typeIcon === option.value ? "contained" : "outlined"}
                    className="product-type-icon-button"
                    onClick={() => setTypeIcon(option.value)}
                    title={option.label}
                  >
                    <HomeCategoryIcon icon={option.value} />
                    <span>{option.label}</span>
                  </Button>
                ))}
            </Box>
            <DialogActions>
              <Button
                onClick={handleSaveType}
                variant="contained"
                color="success"
                disabled={
                  isSavingType
                  || !typeName.trim()
                  || (typeToEdit ? !canEdit : !canCreate)
                }
              >
                {isSavingType
                  ? "Đang lưu..."
                  : typeToEdit
                    ? "Cập nhật loại sản phẩm"
                    : "Thêm loại sản phẩm"}
              </Button>
              {canDelete && typeToEdit && (
                <Button
                  onClick={handleDeleteType}
                  variant="contained"
                  color="error"
                >
                  Xóa
                </Button>
              )}
              <Button
                onClick={closeTypeDialog}
                variant="outlined"
                color="secondary"
              >
                Hủy
              </Button>
            </DialogActions>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog open={isBrandDialogOpen} onClose={closeBrandDialog} disableScrollLock>
        <DialogTitle>Quản lý hãng</DialogTitle>
        <DialogContent>
          <form action="javascript:void(0);">
            <Autocomplete
              value={brandName}
              onChange={(event, newValue) => setBrandName(newValue)}
              options={brands.map((brand) => brand.Brand)}
              getOptionLabel={(option) => option}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Hãng"
                  name="brand"
                  fullWidth
                  margin="normal"
                  size="small"
                  onChange={(e) => setBrandName(e.target.value)}
                />
              )}
              freeSolo
            />
            <DialogActions>
              <Button
                onClick={handleCreateBrand}
                variant="contained"
                color="success"
              >
                Thêm
              </Button>
              <Button
                onClick={handleDeleteBrand}
                variant="contained"
                color="error"
              >
                Xóa
              </Button>
              <Button
                onClick={closeBrandDialog}
                variant="outlined"
                color="secondary"
              >
                Hủy
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={openSectionDialog} onClose={handleCloseSectionDialog} disableScrollLock>
        <DialogTitle>Quản lý cụm thiết bị</DialogTitle>
        <DialogContent>
          <form action="javascript:void(0);">
            <Autocomplete
              value={sectionName}
              onChange={(event, newValue) => setSectionName(newValue || "")}
              options={sections}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tên cụm"
                  name="section"
                  fullWidth
                  margin="normal"
                  size="small"
                  onChange={(e) => setSectionName(e.target.value)}
                />
              )}
              freeSolo
            />
            <TextField
              label="Tên cụm mới"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              fullWidth
              margin="normal"
              size="small"
              disabled={!sectionName}
            />
            <DialogActions>
              <Button
                onClick={handleAddSection}
                variant="contained"
                color="success"
              >
                Thêm
              </Button>
              <Button
                onClick={handleEditSection}
                variant="contained"
                color="primary"
                disabled={!sectionName || !newSectionName}
              >
                Sửa
              </Button>
              <Button
                onClick={handleDeleteSection}
                variant="contained"
                color="error"
                disabled={!sectionName}
              >
                Xóa
              </Button>
              <Button
                onClick={() => navigate("/cluster")}
                variant="contained"
                color="info"
              >
                Chi tiết cụm thiết bị
              </Button>
              <Button
                onClick={handleCloseSectionDialog}
                variant="outlined"
                color="secondary"
              >
                Hủy
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openSearchDialog}
        onClose={() => setOpenSearchDialog(false)}
        disableScrollLock
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Bộ lọc sản phẩm</DialogTitle>
        <DialogContent>{filterForm}</DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
