import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShopContext } from "../context/shopcontext";
import {
  Box,
  Button,
  Checkbox,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Typography,
  IconButton,
  Container,
  CircularProgress,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { Delete, Add, Remove } from "@mui/icons-material";
import "./styles/cart.css";
import { toast } from "react-hot-toast";
import { useLanguage } from "../context/languagecontext.jsx";
import { formatVariantPrice, isContactOnlyVariant } from "../utils/productpricing";
import { getCustomerProfile } from "../api/customerAccountApi";
import { createCustomerOrder } from "../api/customerOrderApi";
import {
  getStorefrontProduct,
  resolveStorefrontAssetUrl,
} from "../api/storefrontCatalogApi";

function Cart() {
  const { t, locale } = useLanguage();
  const navigate = useNavigate();
  const {
    cartItems,
    fetchCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    updateCartItemStatus,
  } = useContext(ShopContext);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [openClearDialog, setOpenClearDialog] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await getCustomerProfile();
        if (response.ok) {
          setIsLoggedIn(true);
        } else {
          setIsLoggedIn(false);
        }
      } catch (error) {
        console.error("Error checking auth:", error);
        setIsLoggedIn(false);
      }
    };
    checkAuth();
  }, []);

  const handleClearItems = () => {
    setOpenClearDialog(true);
  };

  const confirmClearItems = () => {
    clearCart();
    setOpenClearDialog(false);
  };

  const cancelClearItems = () => {
    setOpenClearDialog(false);
  };

  let totalPrice = 0;
  cartItems.forEach((item) => {
    if (item.status) {
      const product = products.find((p) => p._id === item.productId);
      if (product) {
        const variant = product.variant[item.variantIndex];
        if (variant && !isContactOnlyVariant(variant)) {
          totalPrice += variant.price * item.quantity;
        }
      }
    }
  });

  const createOrder = async () => {
    if (isCreatingOrder) return;
    setIsCreatingOrder(true);

    try {
      if (!isLoggedIn) {
        toast.error(t("login_to_order"));
        setTimeout(() => {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }, 1000);
        return;
      }

      const selectedItems = cartItems.filter((item) => item.status);
      if (selectedItems.length === 0) {
        toast.error(t("no_items_selected"));
        return;
      }
      if (selectedItems.some((item) => item.available === false)) {
        toast.error(t("product_unavailable"));
        return;
      }

      // Kiểm tra số lượng tồn kho trước khi đặt hàng
      for (const item of selectedItems) {
        const productRes = await getStorefrontProduct(item.productId);
        if (!productRes.ok) {
          toast.error(t("product_unavailable"));
          return;
        }
        const productData = await productRes.json();
        const variant = productData.variant[item.variantIndex];
        if (!variant || isContactOnlyVariant(variant)) {
          toast.error(t("contact_only_product"));
          return;
        }
        if (variant.quantityForSale < item.quantity) {
          toast.error(
            t("insufficient_stock")
              .replace("{name}", productData.name)
              .replace("{qty}", variant.quantityForSale)
          );
          return;
        }
      }

      let total = 0;
      selectedItems.forEach((item) => {
        const product = products.find((p) => p._id === item.productId);
        if (product) {
          const variant = product.variant[item.variantIndex];
          if (variant && variant.price) {
            total += variant.price * item.quantity;
          }
        }
      });

      const response = await createCustomerOrder({
        cartItems: selectedItems,
        total,
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          toast.error(t("session_expired"));
          setTimeout(() => {
            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          }, 1000);
          return;
        }
        throw new Error(t("order_creation_failed"));
      }

      toast.success(t("order_success"));
      await fetchProducts(); // Cập nhật lại danh sách sản phẩm
      await fetchCart(); // Đồng bộ giỏ hàng mới từ database (các sản phẩm đã đặt đã được server xóa)
      if (data.order && data.order._id) {
        navigate("/myorder", { state: { autoOpenOrderId: data.order._id } });
      }
    } catch (error) {
      console.error("Lỗi khi đặt hàng:", error);
      toast.error(t("order_creation_failed"));
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const productPromises = cartItems.map((item) => {
        const productId = item.productId;
        return getStorefrontProduct(productId)
          .then((res) => (res.ok ? res.json() : null))
          .catch((err) => {
            console.error("Error fetching product:", err);
            return null;
          });
      });

      const fetchedProducts = await Promise.all(productPromises);
      setProducts(fetchedProducts.filter((product) => product !== null));
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error(t("failed_to_load_product"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cartItems.length > 0) {
      fetchProducts();
    } else {
      setProducts([]);
      setLoading(false);
    }
  }, [cartItems]);

  if (loading) {
    return (
      <Container sx={{ display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <div style={{ width: '100%', backgroundColor: 'rgb(235, 246, 254)', padding: '3rem 16px', minHeight: '100vh', boxSizing: 'border-box' }}>
      <Container sx={{ backgroundColor: 'white', margin: 'auto', borderRadius: '5px', boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)', py: '2rem' }}>
        <h1>{t("cart")}</h1>
        {cartItems.length === 0 ? (
          <Typography variant="body1">
            {t("cart_empty")}
          </Typography>
        ) : (
          <List>
            <ListItem
              sx={{
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                fontWeight: "bold",
                bgcolor: "grey.100",
                py: 1,
              }}
            >
              <Box sx={{ width: 40 }} />
              <Box sx={{ width: 56 }} />
              <Box
                sx={{
                  flexGrow: 1,
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr 1fr",
                  gap: 2,
                  marginLeft: "2rem",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ fontWeight: "bold", gridColumn: "1 / 2" }}
                >
                  {t("product_name")}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: "bold", gridColumn: "2 / 3" }}
                >
                  {t("price")}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: "bold", gridColumn: "3 / 4" }}
                >
                  {t("attributes")}
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{ fontWeight: "bold", width: 140, margin: "0 -1rem 0 2rem", textAlign: "center" }}
              >
                {t("quantity")}
              </Typography>
              <Box sx={{ width: 40 }} />
            </ListItem>

            {cartItems.map((item, index) => {
              const product = products.find((p) => p._id === item.productId);
              if (!product) {
                return (
                  <ListItem
                    key={`${item.productId}-${item.variantIndex}`}
                    sx={{ borderBottom: "1px solid #eee", py: 2 }}
                  >
                    <ListItemText
                      primary={t("no_product_info")}
                      secondary={t("remove_unavailable_product")}
                    />
                    <IconButton
                      edge="end"
                      aria-label={t("remove_from_cart")}
                      onClick={() => removeFromCart(item.productId, item.variantIndex)}
                      sx={{ color: "error.main" }}
                    >
                      <Delete />
                    </IconButton>
                  </ListItem>
                );
              }

              const variant = product.variant[item.variantIndex];
              const isContactOnly = isContactOnlyVariant(variant);

              return (
                <ListItem
                  key={`${product._id}-${item.variantIndex}`}
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", md: "row" },
                    alignItems: { xs: "stretch", md: "center" },
                    opacity: item.status ? 1 : 0.5,
                    transition: "opacity 0.3s ease",
                    borderBottom: "1px solid #eee",
                    py: 2,
                    px: { xs: 1, sm: 2 },
                  }}
                >
                  {/* Top content row (Checkbox + Image + Name/Price/Attrs) */}
                  <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
                    <Checkbox
                      checked={item.status}
                      disabled={!item.status && (item.available === false || isContactOnly)}
                      onChange={() => {
                        updateCartItemStatus(
                          item.productId,
                          item.variantIndex,
                          !item.status
                        );
                      }}
                      sx={{ p: { xs: 0.5, sm: 1 } }}
                    />
                    <ListItemAvatar sx={{ minWidth: { xs: 48, sm: 56 }, ml: 1 }}>
                      <Avatar
                        src={variant?.imgUrl ? resolveStorefrontAssetUrl(variant.imgUrl) : "placeholder.jpg"}
                        alt={product.name}
                        sx={{ width: { xs: 48, sm: 56 }, height: { xs: 48, sm: 56 } }}
                      />
                    </ListItemAvatar>

                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: { xs: "column", md: "row" },
                        flexGrow: 1,
                        gap: { xs: 0.5, md: 2 },
                        marginLeft: { xs: "1rem", md: "2rem" },
                        minWidth: 0,
                      }}
                    >
                      <Typography
                        variant="body1"
                        sx={{ 
                          fontWeight: "bold", 
                          width: { xs: "100%", md: "40%" },
                          wordBreak: "break-word"
                        }}
                      >
                        {product.name}
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          width: { xs: "100%", md: "30%" },
                          color: "rgb(255, 123, 0)",
                          fontWeight: "600"
                        }}
                      >
                        {formatVariantPrice(variant)}
                      </Typography>
                      <Typography 
                        variant="body2" 
                        color="text.secondary"
                        sx={{ 
                          width: { xs: "100%", md: "30%" },
                          fontSize: "13px"
                        }}
                      >
                        {[
                          variant?.color,
                          variant?.shape,
                          variant?.frame,
                          variant?.buttonCount,
                        ]
                          .filter(Boolean)
                          .join(" + ")}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Quantity and Delete row */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: { xs: "space-between", md: "flex-end" },
                      mt: { xs: 2, md: 0 },
                      pl: { xs: "110px", md: 0 }, // align with text detail start on mobile
                      width: { xs: "auto", md: "auto" }
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", mr: { xs: 0, md: 2 } }}>
                      <IconButton
                        onClick={() => {
                          const newQuantity = item.quantity - 1;
                          if (newQuantity >= 1) {
                            updateCartItem(
                              item.productId,
                              item.variantIndex,
                              newQuantity
                            );
                          }
                        }}
                        disabled={isContactOnly || item.quantity <= 1}
                        size="small"
                      >
                        <Remove />
                      </IconButton>
                      <TextField
                        size="small"
                        type="number"
                        value={item.quantity}
                        disabled={isContactOnly}
                        onChange={(e) => {
                          const newValue = parseInt(e.target.value, 10);
                          if (!isNaN(newValue) && newValue >= 1) {
                            updateCartItem(
                              item.productId,
                              item.variantIndex,
                              newValue
                            );
                          }
                        }}
                        onBlur={(e) => {
                          const parsedValue = parseInt(e.target.value, 10);
                          const product = products.find(
                            (p) => p._id === item.productId
                          );
                          const variant = product?.variant[item.variantIndex];

                          if (!parsedValue || parsedValue < 1) {
                            updateCartItem(item.productId, item.variantIndex, 1);
                            toast.error(t("min_qty_warning"));
                          } else if (parsedValue > variant?.quantityForSale) {
                            updateCartItem(
                              item.productId,
                              item.variantIndex,
                              variant.quantityForSale
                            );
                            toast.error(
                              t("max_qty_warning") + variant?.quantityForSale
                            );
                          }
                        }}
                        inputProps={{
                          min: 1,
                          style: { textAlign: "center", width: 30, padding: "4px" },
                        }}
                        sx={{
                          mx: 0.5,
                          "& input[type=number]::-webkit-inner-spin-button": {
                            display: "none",
                          },
                          "& input[type=number]::-webkit-outer-spin-button": {
                            display: "none",
                          },
                          "& input[type=number]": { MozAppearance: "textfield" },
                        }}
                      />
                      <IconButton
                        onClick={() => {
                          const product = products.find(
                            (p) => p._id === item.productId
                          );
                          const variant = product?.variant[item.variantIndex];
                          if (variant && item.quantity < variant.quantityForSale) {
                            updateCartItem(
                              item.productId,
                              item.variantIndex,
                              item.quantity + 1
                            );
                          } else {
                            toast.error(t("insufficient_stock_general"));
                          }
                        }}
                        disabled={isContactOnly}
                        size="small"
                      >
                        <Add />
                      </IconButton>
                    </Box>
                    <IconButton
                      edge="end"
                      aria-label={t("remove_from_cart")}
                      onClick={() => removeFromCart(item.productId, item.variantIndex)}
                      sx={{ color: "error.main", ml: 2 }}
                    >
                      <Delete />
                    </IconButton>
                  </Box>
                </ListItem>
              );
            })}
          </List>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "baseline",
            color: "#555",
          }}
        >
          <h2>{t("total")}</h2>
          <p style={{ fontWeight: "600", marginLeft: "10px" }}>
            {totalPrice.toLocaleString(locale)} VND
          </p>
        </div>
        <div style={{ display: "grid", justifyContent: "end" }}>
          <Button
            variant="contained"
            color="error"
            size="small"
            sx={{ width: "130px", margin: "0 0 0 70px" }}
            onClick={handleClearItems}
            disabled={cartItems.length === 0}
          >
            {t("clear_cart")}
          </Button>
          <Button
            variant="contained"
            size="large"
            sx={{ width: "200px", marginTop: 2 }}
            onClick={createOrder}
            disabled={isCreatingOrder || cartItems.length === 0}
          >
            {isCreatingOrder ? t("processing") : t("place_order")}
          </Button>
        </div>

        <Dialog open={openClearDialog} onClose={cancelClearItems}>
          <DialogTitle>{t("confirm_clear_cart")}</DialogTitle>
          <DialogContent>
            <Typography>
              {t("confirm_clear_cart_msg")}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={cancelClearItems} color="primary">
              {t("cancel")}
            </Button>
            <Button
              onClick={confirmClearItems}
              color="error"
              variant="contained"
            >
              {t("clear")}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </div>
  );
}

export default Cart;
