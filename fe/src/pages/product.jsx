import React, { useEffect, useState } from "react";
import {
  TextField,
  Button,
  Select,
  MenuItem,
  Box,
  Pagination,
  Typography,
  InputLabel,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { Link, useLocation, useNavigate } from "react-router-dom";
import FilterListIcon from "@mui/icons-material/FilterList";
import "./styles/product.css";
import Item from "../components/item";
import { text } from "../constants/customerText.js";
import {
  getStorefrontBrands,
  getStorefrontProductTypes,
  getStorefrontSections,
  getStorefrontSectionValues,
  listStorefrontProducts,
} from "../api/storefrontCatalogApi";
const ALL_FILTER_VALUE = "__all__";
const filterSelectMenuProps = {
  disableScrollLock: true,
  PaperProps: {
    sx: {
      maxHeight: 320,
      mt: 0.5,
      border: "1px solid #e5eaf0",
      borderRadius: "8px",
      boxShadow: "0 10px 28px rgba(16, 42, 67, 0.14)",
    },
  },
};

function Product() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  const initialFilters = {
    search: queryParams.get("search") || "",
    brand: queryParams.get("brand") || ALL_FILTER_VALUE,
    type: queryParams.get("type") || ALL_FILTER_VALUE,
    section: queryParams.get("section") || ALL_FILTER_VALUE,
    value: queryParams.get("value") || ALL_FILTER_VALUE,
    sortBy: queryParams.get("sortBy") || "purchaseCount",
    sortOrder: queryParams.get("sortOrder") || "desc",
  };

  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(() => {
    const pageParam = queryParams.get("page");
    return pageParam && !isNaN(parseInt(pageParam)) ? parseInt(pageParam) : 1;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [filters, setFilters] = useState(initialFilters);
  const [openDialog, setOpenDialog] = useState(false);

  const limit = 12;

  const [brands, setBrands] = useState([]);
  const [types, setTypes] = useState([]);
  const [sections, setSections] = useState([]);
  const [values, setValues] = useState([]);

  const fetchProducts = async (overrides = null) => {
    setIsLoadingProducts(true);
    try {
      // Ưu tiên filter/page truyền vào (đọc trực tiếp từ URL) để tránh đọc phải
      // state cũ khi setFilters chưa kịp flush trong cùng một lượt effect.
      const f = overrides?.filters || filters;
      const activePage = overrides?.page ?? page;
      const updatedFilters = {
        page: activePage,
        limit,
        search: f.search,
        brand: f.brand === ALL_FILTER_VALUE ? "" : f.brand,
        type: f.type === ALL_FILTER_VALUE ? "" : f.type,
        section: f.section === ALL_FILTER_VALUE ? "" : f.section,
        value: f.value === ALL_FILTER_VALUE ? "" : f.value,
        sortBy: f.sortBy || "purchaseCount",
        sortOrder: f.sortOrder || "desc",
        display: "true",
      };

      const response = await listStorefrontProducts(updatedFilters);

      const data = await response.json();
      setProducts(data.products || []);
      setTotalProducts(data.total || 0);
      setTotalPages(Math.ceil((data.total || 0) / limit));
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => {
    const updatedFilters = {
      search: queryParams.get("search") || "",
      brand: queryParams.get("brand") || ALL_FILTER_VALUE,
      type: queryParams.get("type") || ALL_FILTER_VALUE,
      section: queryParams.get("section") || ALL_FILTER_VALUE,
      value: queryParams.get("value") || ALL_FILTER_VALUE,
      sortBy: queryParams.get("sortBy") || "purchaseCount",
      sortOrder: queryParams.get("sortOrder") || "desc",
    };
    setFilters(updatedFilters);
    const pageParam = queryParams.get("page");
    const parsedPage = pageParam && !isNaN(parseInt(pageParam)) ? parseInt(pageParam) : 1;
    setPage(parsedPage);

    // Truyền thẳng filter/page vừa parse từ URL để không đọc phải state cũ
    // (setFilters/setPage chưa flush trong cùng lượt chạy effect này).
    fetchProducts({ filters: updatedFilters, page: parsedPage });
  }, [location.search]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "section" ? { value: ALL_FILTER_VALUE } : {}),
    }));

    if (name === "section" && value !== ALL_FILTER_VALUE) {
      fetchValues(value);
    } else if (name === "section" && value === ALL_FILTER_VALUE) {
      setValues([]);
    }
  };

  const fetchValues = async (sectionName) => {
    try {
      const response = await getStorefrontSectionValues(sectionName);
      const data = await response.json();
      setValues(data);
    } catch (error) {
      console.error("Error fetching values:", error);
      setValues([]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const urlQuery = new URLSearchParams({
      ...filters,
      brand: filters.brand === ALL_FILTER_VALUE ? "" : filters.brand,
      type: filters.type === ALL_FILTER_VALUE ? "" : filters.type,
      section: filters.section === ALL_FILTER_VALUE ? "" : filters.section,
      value: filters.value === ALL_FILTER_VALUE ? "" : filters.value,
      sortBy: filters.sortBy || "purchaseCount",
      sortOrder: filters.sortOrder || "desc",
      page: 1,
    }).toString();

    navigate(`/product?${urlQuery}`);
    setPage(1);
    setOpenDialog(false);
  };

  const handlePageChange = (event, newPage) => {
    const urlQuery = new URLSearchParams({
      ...filters,
      brand: filters.brand === ALL_FILTER_VALUE ? "" : filters.brand,
      type: filters.type === ALL_FILTER_VALUE ? "" : filters.type,
      section: filters.section === ALL_FILTER_VALUE ? "" : filters.section,
      value: filters.value === ALL_FILTER_VALUE ? "" : filters.value,
      sortBy: filters.sortBy || "purchaseCount",
      sortOrder: filters.sortOrder || "desc",
      page: newPage,
    }).toString();

    setPage(Number(newPage) || 1);
    navigate(`/product?${urlQuery}`);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [brandsResponse, typesResponse, sectionsResponse] =
          await Promise.all([
            getStorefrontBrands(),
            getStorefrontProductTypes({ cache: "no-store" }),
            getStorefrontSections(),
          ]);
        const brandsData = await brandsResponse.json();
        const typesData = await typesResponse.json();
        const sectionsData = await sectionsResponse.json();
        setBrands(brandsData);
        setTypes(typesData);
        setSections(sectionsData);

        const initialSection = queryParams.get("section");
        if (initialSection && initialSection !== ALL_FILTER_VALUE) {
          fetchValues(initialSection);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
  }, []);

  const isValueDisabled = filters.section === ALL_FILTER_VALUE;

  const filterForm = (
    <form onSubmit={handleSubmit} className="filter-product-string">
      <Typography variant="h6">{text("search_products")}</Typography>
      
      <TextField
        label={text("search_by_name")}
        variant="outlined"
        name="search"
        value={filters.search}
        onChange={handleFilterChange}
        fullWidth
        size="small"
        margin="normal"
      />
      <InputLabel>{text("search_by_brand")}</InputLabel>
      <Select
        value={filters.brand || ALL_FILTER_VALUE}
        MenuProps={filterSelectMenuProps}
        onChange={(e) =>
          handleFilterChange({
            target: { name: "brand", value: e.target.value },
          })
        }
        size="small"
        fullWidth
        sx={{ margin: "8px 0" }}
      >
        <MenuItem value={ALL_FILTER_VALUE}>{text("all_brands")}</MenuItem>
        {brands.map((brand, index) => (
          <MenuItem key={index} value={brand.Brand}>
            {brand.Brand}
          </MenuItem>
        ))}
      </Select>
      <InputLabel>{text("search_by_type")}</InputLabel>
      <Select
        value={filters.type || ALL_FILTER_VALUE}
        MenuProps={filterSelectMenuProps}
        onChange={(e) =>
          handleFilterChange({
            target: { name: "type", value: e.target.value },
          })
        }
        size="small"
        fullWidth
        sx={{ margin: "8px 0" }}
      >
        <MenuItem value={ALL_FILTER_VALUE}>{text("all_types")}</MenuItem>
        {types.map((type, index) => (
          <MenuItem key={index} value={type.Type}>
            {type.Type}
          </MenuItem>
        ))}
      </Select>
      <InputLabel>{text("search_by_section")}</InputLabel>
      <Select
        value={filters.section || ALL_FILTER_VALUE}
        MenuProps={filterSelectMenuProps}
        onChange={handleFilterChange}
        name="section"
        size="small"
        fullWidth
        sx={{ margin: "8px 0" }}
      >
        <MenuItem value={ALL_FILTER_VALUE}>{text("all_sections")}</MenuItem>
        {sections.map((section, index) => (
          <MenuItem key={index} value={section}>
            {section}
          </MenuItem>
        ))}
      </Select>
      <InputLabel>{text("search_by_equipment")}</InputLabel>
      <Select
        value={filters.value || ALL_FILTER_VALUE}
        MenuProps={filterSelectMenuProps}
        onChange={(e) =>
          handleFilterChange({
            target: { name: "value", value: e.target.value },
          })
        }
        disabled={isValueDisabled}
        size="small"
        fullWidth
        sx={{ margin: "8px 0" }}
      >
        <MenuItem value={ALL_FILTER_VALUE}>{text("all_equipment")}</MenuItem>
        {values.map((value, index) => (
          <MenuItem key={index} value={value}>
            {value}
          </MenuItem>
        ))}
      </Select>
      <Typography variant="h6">{text("sort_by")}</Typography>
      <Select
        value={filters.sortBy || "purchaseCount"}
        MenuProps={filterSelectMenuProps}
        onChange={(e) =>
          handleFilterChange({
            target: { name: "sortBy", value: e.target.value },
          })
        }
        size="small"
        fullWidth
        sx={{ margin: "8px 0" }}
      >
        <MenuItem value="createdAt">{text("created_date")}</MenuItem>
        <MenuItem value="averageReviews">{text("rating")}</MenuItem>
        <MenuItem value="purchaseCount">{text("purchases")}</MenuItem>
      </Select>
      <Select
        value={filters.sortOrder || "desc"}
        MenuProps={filterSelectMenuProps}
        onChange={(e) =>
          handleFilterChange({
            target: { name: "sortOrder", value: e.target.value },
          })
        }
        size="small"
        fullWidth
        sx={{ margin: "8px 0" }}
      >
        <MenuItem value="desc">{text("descending")}</MenuItem>
        <MenuItem value="asc">{text("ascending")}</MenuItem>
      </Select>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "16px",
          width: "full",
        }}
      >
        <Button type="submit" variant="contained" color="primary" fullWidth>
          {text("search")}
        </Button>
      </div>
    </form>
  );

  const firstProductIndex = totalProducts === 0 ? 0 : (page - 1) * limit + 1;
  const lastProductIndex = Math.min(page * limit, totalProducts);

  return (
    <main className="product-catalog-page">
      <div className="product-catalog-shell">
        <nav className="product-breadcrumb" aria-label={text("breadcrumb")}>
          <Link to="/"><i className="fa-solid fa-house" /> {text("home")}</Link>
          <i className="fa-solid fa-angle-right" />
          <span>{text("products")}</span>
        </nav>

        <div className="product-page-title-row">
          <h1>{text("products")}</h1>
          <Button
            className="filter-button"
            onClick={() => setOpenDialog(true)}
            variant="outlined"
            startIcon={<FilterListIcon />}
          >
            {text("filters")}
          </Button>
        </div>

        <div className="product-filter-main-container">
          <aside className="filter-desktop">{filterForm}</aside>

          <Dialog
            open={openDialog}
            onClose={() => setOpenDialog(false)}
            fullWidth
            maxWidth="sm"
          >
            <DialogTitle>{text("product_filters")}</DialogTitle>
            <DialogContent>{filterForm}</DialogContent>
          </Dialog>

          <section className="product-results-panel">
            <div className="product-results-toolbar">
              <span>
                {isLoadingProducts
                  ? text("loading_products")
                  : text("product_display_range")
                    .replace("{first}", firstProductIndex)
                    .replace("{last}", lastProductIndex)
                    .replace("{total}", totalProducts)}
              </span>
              <div className="product-view-indicator" aria-hidden="true">
                <i className="fa-solid fa-table-cells-large is-active" />
                <i className="fa-solid fa-list" />
              </div>
            </div>

            {isLoadingProducts ? (
              <div className="product-loading-state">
                <span className="product-loading-spinner" />
                {text("loading_products")}
              </div>
            ) : products.length > 0 ? (
              <div className="product-list-container">
                {products.map((product) => (
                  <div key={product._id} className="product-item">
                    <Item product={product} />
                  </div>
                ))}
              </div>
            ) : (
              <Box className="product-empty-state">
                <Typography variant="h6" sx={{ color: "text.secondary" }}>
              {text("no_products_found", "Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại.")}
                </Typography>
              </Box>
            )}

            {totalPages > 1 && (
              <div className="product-pagination">
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(event, value) => handlePageChange(event, value)}
                  size="medium"
                  color="primary"
                />
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default Product;
