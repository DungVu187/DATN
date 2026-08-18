import React, { useEffect, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Avatar,
  CircularProgress,
  Box,
  useMediaQuery,
} from "@mui/material";
import PhoneIcon from "@mui/icons-material/Phone";
import InfoIcon from "@mui/icons-material/Info";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import { ShopContext } from "../context/shopcontext";
import { useLanguage } from "../context/languagecontext";
import { isContactOnlyVariant } from "../utils/productpricing";
import {
  getStorefrontSectionValues,
  listStorefrontSectionValueProducts,
} from "../api/storefrontCatalogApi";

const ValueList = () => {
  const { t } = useLanguage();
  const { sectionName } = useParams();
  const [values, setValues] = useState([]);
  const [productsByValue, setProductsByValue] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { addToCart } = useContext(ShopContext);

  const isSmallScreen = useMediaQuery("(max-width:750px)");

  useEffect(() => {
    if (!sectionName) return;

    const fetchData = async () => {
      try {
        const res = await getStorefrontSectionValues(sectionName);
        const valueList = await res.json();
        setValues(valueList);

        const productResults = {};
        for (let value of valueList) {
          const resProd = await listStorefrontSectionValueProducts(sectionName, value);
          const data = await resProd.json();
          productResults[value] = data.products || [];
        }

        setProductsByValue(productResults);
      } catch (err) {
        console.error("Lỗi khi load dữ liệu:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sectionName]);

  if (loading) {
    return (
      <Box textAlign="center" mt={5}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <div
      style={{ backgroundColor: "#ebf6fe", width: "100%", paddingBottom: 16, minHeight: '100vh' }}
    >
      <div style={{ maxWidth: "1000px", margin: "0 auto 50px" }}>
        <Typography
          variant="h4"
          gutterBottom
          style={{
            textAlign: "center",
            padding: "20px",
            textTransform: "uppercase",
          }}
        >
          {sectionName}
        </Typography>

        {values.map((value) => {
          const visibleProducts = productsByValue[value]?.filter(
            (product) => product.display !== false
          );

          if (!visibleProducts || visibleProducts.length === 0) return null;

          return (
            <div key={value} style={{ marginBottom: 48 }}>
              <TableContainer component={Paper} sx={{ boxShadow: "none" }}>
                <Typography
                  variant="h6"
                  gutterBottom
                  sx={{ margin: "10px 0 0 20px" }}
                >
                  {value}
                </Typography>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell align="center">{t("image", "Ảnh")}</TableCell>
                      <TableCell>{t("product_name", "Tên sản phẩm")}</TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleProducts.map((product) => (
                      <TableRow key={product._id}>
                        <TableCell>
                          <Avatar
                            variant="rounded"
                            src={product.variant[0]?.imgUrl}
                            alt={product.name}
                            sx={{
                              width: 56,
                              height: 56,
                              objectFit: "contain",
                              margin: "auto",
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            {product.name}
                          </Typography>
                          {(product.variant?.[0]?.quantityForSale ?? 0) > 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              {t("quantity_left_val", "Còn lại: ")}{product.variant[0].quantityForSale}
                            </Typography>
                          ) : (
                            <Typography variant="body2" color="error" sx={{ mt: 0.5, fontWeight: "bold" }}>
                              {t("out_of_stock_val", "Liên hệ")}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: { xs: "column", sm: "row" },
                              gap: 1,
                              justifyContent: "flex-end",
                            }}
                          >
                            <Button
                              variant="contained"
                              color="success"
                              size="small"
                              href="tel:0813158383"
                              sx={{
                                minWidth: "40px",
                                padding: "6px 12px",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: 1,
                                whiteSpace: "nowrap",
                              }}
                            >
                               {isSmallScreen ? <PhoneIcon /> : (
                                <>
                                  <PhoneIcon sx={{ fontSize: 16 }} />
                                  {t("contact_phone", "Liên hệ: 0813 158 383")}
                                </>
                              )}
                            </Button>
                            <Button
                              variant="contained"
                              color="primary"
                              size="small"
                              onClick={() => addToCart(product._id, 0)}
                              disabled={isContactOnlyVariant(product.variant?.[0])}
                              sx={{
                                minWidth: "40px",
                                padding: "6px 12px",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              {isSmallScreen ? (
                                <ShoppingCartIcon />
                              ) : (
                                t("add_to_cart_short", "Thêm vào giỏ")
                              )}
                            </Button>
                            <Button
                              variant="outlined"
                              color="primary"
                              size="small"
                              onClick={() =>
                                navigate(`/product/${product._id}`)
                              }
                              sx={{
                                minWidth: "40px",
                                padding: "6px 12px",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              {isSmallScreen ? <InfoIcon /> : t("details", "Chi tiết")}
                            </Button>

                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ValueList;
