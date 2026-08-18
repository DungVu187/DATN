import React, { useContext, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Rating,
  Typography,
} from "@mui/material";
import LocalPhoneIcon from "@mui/icons-material/LocalPhone";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import { useNavigate } from "react-router-dom";
import { ShopContext } from "../context/shopcontext";
import { formatVariantPrice, isContactOnlyVariant } from "../utils/productpricing";
import SafeProductImage from "./safeproductimage";
import { useLanguage } from "../context/languagecontext.jsx";

function Item({ product }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { addToCart } = useContext(ShopContext);
  const [quantity, setQuantity] = useState(1);
  const primaryVariant = product.variant?.[0] || {};
  const quantityForSale = Number(primaryVariant.quantityForSale || 0);
  const isOutOfStock = quantityForSale <= 0;
  const isContactOnly = isContactOnlyVariant(primaryVariant);
  const imageVersion = encodeURIComponent(product.updatedAt || product._id || "1");
  const imageUrl = primaryVariant.imgUrl
    ? `${primaryVariant.imgUrl}${primaryVariant.imgUrl.includes("?") ? "&" : "?"}v=${imageVersion}`
    : "";

  const handleClick = () => navigate(`/product/${product._id}`);

  const handleAddToCartClick = (event) => {
    event.stopPropagation();
    addToCart(product._id, 0, quantity);
  };

  return (
    <Card className="catalog-product-card" onClick={handleClick}>
      <div className="catalog-product-image-wrap">
        <SafeProductImage
          className="catalog-product-image"
          src={imageUrl}
          alt={product.name}
        />
      </div>

      <CardContent className="catalog-product-content">
        <Typography className="catalog-product-name" component="h2">
          {product.name}
        </Typography>

        <div className="catalog-product-rating">
          <Rating value={Number(product.averageReviews || 0)} precision={0.5} readOnly size="small" />
          <span>({product.reviewCount || 0})</span>
        </div>

        <div className="catalog-product-price">
          {formatVariantPrice(primaryVariant)}
        </div>

        <div className="catalog-product-meta">
          <span>{t("brand_label")} {product.brand || t("unknown")}</span>
          <div>
            <strong>{isOutOfStock ? t("out_of_stock") : `${t("stock_quantity")}: ${quantityForSale}`}</strong>
          </div>
        </div>

        <Box className="catalog-product-purchase" onClick={(event) => event.stopPropagation()}>
          {isContactOnly ? (
            <Button
              className="catalog-contact-button"
              variant="outlined"
              href="tel:0813158383"
              startIcon={<LocalPhoneIcon />}
            >
              0813158383
            </Button>
          ) : (
            <>
              <div className="catalog-quantity-control">
                <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))}>−</button>
                <span>{quantity}</span>
                <button type="button" onClick={() => setQuantity((current) => current + 1)}>+</button>
              </div>
              <IconButton className="catalog-cart-button" onClick={handleAddToCartClick} aria-label={`${t("add_product_to_cart")}: ${product.name}`}>
                <ShoppingCartIcon fontSize="small" />
              </IconButton>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export default Item;
