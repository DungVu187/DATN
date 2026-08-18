export const PRODUCT_IMAGE_UPLOAD_SETTINGS = {
  maxSizeBytes: 4 * 1024 * 1024,
  maxSizeLabel: "4MB",
  mimeTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
  ],
  extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"],
};

export const PRODUCT_IMAGE_ACCEPT = [
  ...PRODUCT_IMAGE_UPLOAD_SETTINGS.mimeTypes,
  ...PRODUCT_IMAGE_UPLOAD_SETTINGS.extensions,
].join(",");
