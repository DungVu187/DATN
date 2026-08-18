import React, { useState } from "react";
import { getStoredTranslation } from "../context/languagecontext.jsx";

function SafeProductImageContent({
  src,
  alt,
  className = "",
  loading = "lazy",
  decoding = "async",
  fetchPriority,
  onError,
  ...imageProps
}) {
  const [hasError, setHasError] = useState(false);
  const accessibleLabel = alt || getStoredTranslation("product_image_alt");
  const imageSource = typeof src === "string" ? src.trim() : src;

  if (!imageSource || hasError) {
    return (
      <span
        className={className}
        role="img"
        aria-label={accessibleLabel}
      />
    );
  }

  const handleError = (event) => {
    setHasError(true);
    onError?.(event);
  };

  return (
    <img
      {...imageProps}
      src={imageSource}
      alt={accessibleLabel}
      className={className}
      loading={loading}
      decoding={decoding}
      fetchpriority={fetchPriority}
      onError={handleError}
    />
  );
}

function SafeProductImage(props) {
  const sourceKey = typeof props.src === "string" ? props.src.trim() : props.src;

  return (
    <SafeProductImageContent
      key={sourceKey || "__missing-product-image"}
      {...props}
    />
  );
}

export default SafeProductImage;
