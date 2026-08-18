import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
const resolveApiUrlMock = vi.hoisted(() => vi.fn((pathValue) => `https://api.test${pathValue}`));

vi.mock("./httpClient", () => ({
  apiFetch: apiFetchMock,
  resolveApiUrl: resolveApiUrlMock,
}));

import {
  addChipValue,
  addProductQuantity,
  addProductSectionValue,
  bulkDeleteProducts,
  createProduct,
  createProductBrand,
  createProductSection,
  deleteProduct,
  deleteProductBrand,
  deleteProductSectionImage,
  deleteProductSectionValue,
  deleteProductSection,
  deleteProductType,
  deleteProductVariantImage,
  getChipValues,
  getProductDetail,
  getProductDisplaySectionValues,
  getProductDisplayTaxonomy,
  getProductSectionDevices,
  getProductSections,
  getProductSectionValues,
  getProductTaxonomy,
  getProducts,
  removeChipValue,
  saveProductType,
  toggleProductDisplay,
  updateProduct,
  updateProductEarn,
  updateProductImportPrice,
  updateProductSectionImage,
  updateProductSectionValue,
  updateProductSection,
  updateProductVat,
  uploadProductDetailImage,
  uploadProductDocument,
  uploadProductImage,
  uploadProductSectionImage,
} from "./productManagementApi";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const originalFetch = globalThis.fetch;

const createResponse = ({
  ok = true,
  status = 200,
  statusText = "OK",
  data,
  text = "",
}) => ({
  ok,
  status,
  statusText,
  json: vi.fn().mockResolvedValue(data),
  text: vi.fn().mockResolvedValue(text),
});

describe("productManagementApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps active product-detail reads and image operations", async () => {
    const hiddenResponse = createResponse({
      ok: false,
      status: 404,
      data: { message: "Missing" },
    });
    apiFetchMock
      .mockResolvedValueOnce(createResponse({ data: { _id: "p1" } }))
      .mockResolvedValueOnce(hiddenResponse)
      .mockResolvedValueOnce(createResponse({}))
      .mockResolvedValueOnce(createResponse({
        data: { success: false, message: "Rejected" },
      }));

    await expect(getProductDetail("p1", { admin: true })).resolves.toEqual({
      _id: "p1",
    });
    await expect(getProductDetail("hidden")).resolves.toBeNull();
    expect(hiddenResponse.json).not.toHaveBeenCalled();

    await expect(deleteProductVariantImage("p1", 0)).resolves.toBeUndefined();
    const image = new File(["image"], "detail.webp", { type: "image/webp" });
    await expect(uploadProductDetailImage(image)).resolves.toEqual({
      success: false,
      message: "Rejected",
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/products/p1/admin-detail");
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/products/hidden");
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/products/p1/0/image",
      { method: "DELETE" },
    );
    const uploadOptions = apiFetchMock.mock.calls[3][1];
    expect(apiFetchMock.mock.calls[3][0]).toBe("/products/upload/image");
    expect(uploadOptions.method).toBe("POST");
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect(uploadOptions.body.get("product")).toBe(image);
  });

  it("maps product-detail mutations without parsing success bodies", async () => {
    const successfulResponse = createResponse({ data: { message: "ok" } });
    apiFetchMock.mockResolvedValue(successfulResponse);

    await updateProduct("p1", { name: "PLC" });
    await deleteProduct("p1");
    await addProductQuantity("p1", 0, "3");
    await updateProductVat("p1", "10");
    await updateProductEarn("p1", 0, 25);
    await updateProductImportPrice("p1", 0, "1.000");

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/products/p1", {
      method: "PUT",
      json: { name: "PLC" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/products/p1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/products/p1/0", {
      method: "POST",
      json: { quantity: "3", orderId: "", orderName: "" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(4, "/products/p1", {
      method: "PUT",
      json: { vat: "10" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      5,
      "/products/p1/0/update-earn",
      { method: "PUT", json: { earn: 25 } },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      6,
      "/products/p1/0/update-import-price",
      { method: "PUT", json: { importPrice: "1.000" } },
    );
    expect(successfulResponse.json).not.toHaveBeenCalled();

    apiFetchMock.mockResolvedValueOnce(createResponse({
      ok: false,
      data: { message: "Product conflict" },
    }));
    await expect(updateProduct("p1", {})).rejects.toThrow("Product conflict");
  });

  it("keeps product-detail taxonomy reads public and independently optional", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(createResponse({ data: [{ Brand: "ABB" }] }))
      .mockResolvedValueOnce(createResponse({ ok: false, data: [] }))
      .mockResolvedValueOnce(createResponse({ data: ["Automation"] }))
      .mockResolvedValueOnce(createResponse({ ok: false, data: [] }));

    await expect(getProductDisplayTaxonomy()).resolves.toEqual({
      brands: [{ Brand: "ABB" }],
      types: null,
      sections: ["Automation"],
    });
    await expect(
      getProductDisplaySectionValues("Factory Automation"),
    ).resolves.toBeNull();

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, "https://api.test/chips/brands");
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.test/products/types",
      { cache: "no-store" },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(3, "https://api.test/chips/section");
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      4,
      "https://api.test/chips/Factory Automation/value",
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("keeps chip and section-detail reads public and sequential", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(createResponse({
        data: {
          Color: ["Red"],
          Shapes: ["Square"],
          Frames: ["Black"],
          ButtonCount: ["2"],
        },
      }))
      .mockResolvedValueOnce(createResponse({ data: ["Automation"] }))
      .mockResolvedValueOnce(createResponse({
        data: {
          Section: [{ name: "Automation", imgUrl: "/sections/auto.webp" }],
        },
      }))
      .mockResolvedValueOnce(createResponse({ data: ["PLC"] }));

    await expect(getChipValues()).resolves.toEqual({
      Color: ["Red"],
      Shapes: ["Square"],
      Frames: ["Black"],
      ButtonCount: ["2"],
    });
    await expect(getProductSectionDevices("Automation")).resolves.toEqual({
      devices: ["PLC"],
      image: {
        imgUrl: "/sections/auto.webp",
        filename: "auto.webp",
      },
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, "https://api.test/chips/getValues");
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, "https://api.test/chips/section");
    expect(globalThis.fetch).toHaveBeenNthCalledWith(3, "https://api.test/chips/section-doc");
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      4,
      "https://api.test/chips/Automation/value",
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("maps chip and section-value mutation contracts", async () => {
    const successfulDelete = createResponse({ data: { message: "ok" } });
    apiFetchMock
      .mockResolvedValueOnce(createResponse({
        ok: false,
        data: { message: "Update rejected" },
      }))
      .mockResolvedValueOnce(successfulDelete)
      .mockResolvedValueOnce(createResponse({ data: { message: "Added" } }))
      .mockResolvedValueOnce(createResponse({ ok: false }))
      .mockResolvedValueOnce(createResponse({
        ok: false,
        data: { message: "Section rejected" },
      }));

    await expect(
      updateProductSectionValue("Automation", "PLC", "PLC S7"),
    ).resolves.toEqual({
      ok: false,
      data: { message: "Update rejected" },
    });
    await expect(
      deleteProductSectionValue("Automation", "PLC"),
    ).resolves.toEqual({ ok: true, data: null });
    expect(successfulDelete.json).not.toHaveBeenCalled();
    await expect(addChipValue("Color", "Red")).resolves.toEqual({
      ok: true,
      data: { message: "Added" },
    });
    await expect(removeChipValue("Color", "Red")).resolves.toBe(false);
    await expect(
      addProductSectionValue("Automation", "PLC"),
    ).resolves.toEqual({
      ok: false,
      data: { message: "Section rejected" },
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/chips/Automation/value", {
      method: "PUT",
      json: { oldValue: "PLC", newValue: "PLC S7" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/chips/Automation/value", {
      method: "DELETE",
      json: { value: "PLC" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/chips/addValue", {
      method: "POST",
      json: { type: "Color", value: "Red" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(4, "/chips/removeValue", {
      method: "POST",
      json: { type: "Color", value: "Red" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(5, "/chips/Automation/value", {
      method: "POST",
      json: { value: "PLC" },
    });
  });

  it("preserves the section image transport sequence and ignored statuses", async () => {
    const failedUpload = createResponse({
      ok: false,
      data: { message: "Too large" },
    });
    apiFetchMock
      .mockResolvedValueOnce(createResponse({
        data: { imgUrl: "/section-images/automation.webp" },
      }))
      .mockResolvedValueOnce(createResponse({ ok: false }))
      .mockResolvedValueOnce(createResponse({ ok: false }))
      .mockResolvedValueOnce(failedUpload);

    const file = new File(["image"], "automation.webp", { type: "image/webp" });
    await expect(uploadProductSectionImage(file)).resolves.toEqual({
      ok: true,
      data: { imgUrl: "/section-images/automation.webp" },
    });
    await deleteProductSectionImage("old image.webp");
    await updateProductSectionImage(
      "Factory Automation",
      "PLC",
      "/section-images/automation.webp",
    );
    await expect(uploadProductSectionImage(file)).resolves.toEqual({
      ok: false,
      data: null,
    });
    expect(failedUpload.json).not.toHaveBeenCalled();

    const uploadOptions = apiFetchMock.mock.calls[0][1];
    expect(apiFetchMock.mock.calls[0][0]).toBe("/chips/upload-section-image");
    expect(uploadOptions.method).toBe("POST");
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect(uploadOptions.body.get("sectionImage")).toBe(file);
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/chips/delete-section-image/old image.webp",
      { method: "DELETE" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/chips/Factory Automation/value",
      {
        method: "PUT",
        json: {
          oldValue: "PLC",
          newValue: "PLC",
          imgUrl: "/section-images/automation.webp",
        },
      },
    );
  });

  it("builds product queries and preserves bulk-delete errors", async () => {
    const successfulBulkDelete = createResponse({ data: { deletedCount: 0 } });
    apiFetchMock
      .mockResolvedValueOnce(createResponse({ data: { products: [], total: 0 } }))
      .mockResolvedValueOnce(createResponse({
        ok: false,
        status: 400,
        data: { message: "Không thể xóa sản phẩm" },
      }))
      .mockResolvedValueOnce(successfulBulkDelete);

    await expect(
      getProducts({
        page: 2,
        limit: 25,
        filters: { brand: "ABB", sortOrder: "desc" },
      }),
    ).resolves.toEqual({ products: [], total: 0 });
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/products?page=2&limit=25&brand=ABB&sortOrder=desc",
    );

    await expect(bulkDeleteProducts(["p1", "p2"])).rejects.toThrow(
      "Không thể xóa sản phẩm",
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/products/bulk-delete", {
      method: "POST",
      json: { ids: ["p1", "p2"] },
    });

    await expect(bulkDeleteProducts(["missing-product"])).resolves.toBeUndefined();
    expect(successfulBulkDelete.json).not.toHaveBeenCalled();
  });

  it("keeps taxonomy requests public and preserves the no-store type request", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(createResponse({ data: [{ Brand: "ABB" }] }))
      .mockResolvedValueOnce(createResponse({ data: [{ Type: "PLC" }] }))
      .mockResolvedValueOnce(createResponse({ data: [{ name: "Automation" }] }));

    await expect(getProductTaxonomy()).resolves.toEqual({
      brands: [{ Brand: "ABB" }],
      types: [{ Type: "PLC" }],
      sections: [{ name: "Automation" }],
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, "https://api.test/chips/brands");
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.test/products/types",
      { cache: "no-store" },
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(3, "https://api.test/chips/section");
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("preserves section validation and missing-value errors", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(createResponse({ data: { invalid: true } }))
      .mockResolvedValueOnce(createResponse({ ok: false, status: 404, data: [] }));

    await expect(getProductSections()).rejects.toThrow("Dữ liệu không hợp lệ");
    await expect(getProductSectionValues("Missing")).rejects.toThrow(
      "Không tìm thấy dữ liệu",
    );
  });

  it("handles display updates and product media FormData", async () => {
    const displayData = { message: "Đã cập nhật", product: { display: false } };
    const uploadData = { success: true, imgUrl: "/images/product.webp" };
    const documentData = {
      success: true,
      url: "/documents/manual.pdf",
      fileName: "manual.pdf",
    };
    apiFetchMock
      .mockResolvedValueOnce(createResponse({ data: displayData }))
      .mockResolvedValueOnce(createResponse({ data: uploadData }))
      .mockResolvedValueOnce(createResponse({ data: documentData }))
      .mockResolvedValueOnce(createResponse({
        data: { success: false, message: "Image rejected" },
      }));

    await expect(toggleProductDisplay("p1")).resolves.toEqual(displayData);
    const file = new File(["image"], "product.webp", { type: "image/webp" });
    await expect(uploadProductImage(file)).resolves.toBe("/images/product.webp");

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/products/p1/toggle-display", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
    });
    const uploadOptions = apiFetchMock.mock.calls[1][1];
    expect(apiFetchMock.mock.calls[1][0]).toBe("/products/upload/image");
    expect(uploadOptions.method).toBe("POST");
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect(uploadOptions.body.get("product")).toBe(file);

    const documentFile = new File(["pdf"], "manual.pdf", {
      type: "application/pdf",
    });
    await expect(uploadProductDocument(documentFile)).resolves.toEqual(documentData);
    const documentOptions = apiFetchMock.mock.calls[2][1];
    expect(apiFetchMock.mock.calls[2][0]).toBe("/products/upload/document");
    expect(documentOptions.method).toBe("POST");
    expect(documentOptions.body).toBeInstanceOf(FormData);
    expect(documentOptions.body.get("document")).toBe(documentFile);

    await expect(uploadProductImage(file)).rejects.toThrow("Image rejected");
  });

  it("keeps product creation status handling and brand text errors", async () => {
    apiFetchMock
      .mockResolvedValueOnce(createResponse({ status: 201, data: { product: { _id: "p1" } } }))
      .mockResolvedValueOnce(createResponse({
        ok: false,
        status: 409,
        text: "Brand already exists",
      }))
      .mockResolvedValueOnce(createResponse({
        ok: false,
        status: 500,
        text: "Delete failed",
      }));

    await expect(createProduct({ name: "PLC" })).resolves.toEqual({
      status: 201,
      data: { product: { _id: "p1" } },
    });
    await expect(createProductBrand("ABB")).rejects.toThrow("Brand already exists");
    await expect(deleteProductBrand("brand-1")).rejects.toThrow("Delete failed");
  });

  it("maps product type create-update-delete contracts", async () => {
    apiFetchMock.mockResolvedValue(createResponse({ data: { updatedProducts: 2 } }));

    await saveProductType({ typeName: "PLC", icon: "ri-tb-cpu" });
    await saveProductType({ typeId: "type-1", typeName: "PLC", icon: "ri-tb-robot" });
    await deleteProductType("type-1");

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/products/types", {
      method: "POST",
      json: { Type: "PLC", icon: "ri-tb-cpu" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/products/types/type-1", {
      method: "PUT",
      json: { Type: "PLC", icon: "ri-tb-robot" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/products/types/type-1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("maps section create-delete-update contracts", async () => {
    apiFetchMock.mockResolvedValue(createResponse({ data: { message: "ok" } }));

    await createProductSection("Automation");
    await deleteProductSection("Automation");
    await updateProductSection("Automation", "Factory Automation");

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/chips/section", {
      method: "POST",
      json: { name: "Automation" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/chips/section/Automation", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/chips/section/Automation", {
      method: "PUT",
      json: { name: "Factory Automation" },
    });
  });

  it("keeps the active product catalog free of direct transport code", () => {
    for (const componentName of [
      "products.jsx",
      "producttechdocs.jsx",
      "productdisplay.jsx",
      "chips.jsx",
    ]) {
      const source = fs.readFileSync(
        path.join(currentDirectory, "..", "components", componentName),
        "utf8",
      );
      expect(source).toContain("productManagementApi");
      expect(source).not.toContain("fetch(");
      expect(source).not.toContain("VITE_API_URL");
      expect(source).not.toContain("new FormData");
    }
  });
});
