const fs = require("fs");
const path = require("path");

const productUploads = require("../services/productUploads");
const productComponent = require("../components/product");

const readBackendFile = (relativePath) => fs.readFileSync(
  path.join(__dirname, "..", relativePath),
  "utf8"
);

describe("Product upload boundaries", () => {
  it("keeps the upload service contract and Product facade compatible", () => {
    expect(productUploads).toEqual(expect.objectContaining({
      uploadImage: expect.any(Object),
      uploadDocument: expect.any(Object),
      handleProductImageUpload: expect.any(Function),
      handleProductDocumentUpload: expect.any(Function),
    }));
    expect(productComponent.uploadImage).toBe(productUploads.uploadImage);
  });

  it("keeps upload configuration and middleware implementation out of Product", () => {
    const productSource = readBackendFile("components/product.js");

    expect(productSource).toMatch(/require\(["']\.\.\/services\/productUploads["']\)/);
    expect(productSource).not.toMatch(/multer\.diskStorage/);
    expect(productSource).not.toMatch(/PRODUCT_IMAGE_UPLOAD_SETTINGS/);
    expect(productSource).not.toMatch(/PRODUCT_DOCUMENT_UPLOAD_SETTINGS/);
    expect(productSource).not.toMatch(/handleProductImageUpload\s*=/);
    expect(productSource).not.toMatch(/handleProductDocumentUpload\s*=/);
  });

  it("keeps upload config and field names inside the upload service", () => {
    const uploadServiceSource = readBackendFile("services/productUploads.js");

    expect(uploadServiceSource).toMatch(/require\(["']\.\.\/config\/imageUpload["']\)/);
    expect(uploadServiceSource).toMatch(/\.single\(\s*["']product["']\s*\)/);
    expect(uploadServiceSource).toMatch(/\.single\(\s*["']document["']\s*\)/);
  });
});
