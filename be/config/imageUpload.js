const PRODUCT_IMAGE_UPLOAD_SETTINGS = {
  maxSizeBytes: 4 * 1024 * 1024,
  maxSizeLabel: "4MB",
  allowedMimeTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
  ],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"],
};

const PRODUCT_DOCUMENT_UPLOAD_SETTINGS = {
  maxSizeBytes: 20 * 1024 * 1024,
  maxSizeLabel: "20MB",
  allowedMimeTypes: ["application/pdf"],
  allowedExtensions: [".pdf"],
};

module.exports = {
  PRODUCT_DOCUMENT_UPLOAD_SETTINGS,
  PRODUCT_IMAGE_UPLOAD_SETTINGS,
};
