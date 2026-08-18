import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
const resolveApiUrlMock = vi.hoisted(() =>
  vi.fn((pathValue) => `https://api.test${pathValue}`),
);

vi.mock("./httpClient", () => ({
  apiFetch: apiFetchMock,
  resolveApiUrl: resolveApiUrlMock,
}));

import * as inventoryApi from "./inventoryOrderAdministrationApi";

const jsonHeaders = { "Content-Type": "application/json" };

const expectedExportNames = [
  "addExportOrderLine",
  "addImportOrderLine",
  "cleanInventoryTempImage",
  "completeExportOrder",
  "completeExportOrderLine",
  "completeImportOrder",
  "completeImportOrderLine",
  "createExportOrder",
  "createExportOrderFromImport",
  "createImportOrder",
  "createImportOrderFromExport",
  "createInventoryBrand",
  "createInventoryOrderTemplate",
  "createInventoryProduct",
  "deleteExportOrder",
  "deleteExportOrderImage",
  "deleteExportOrderLine",
  "deleteImportOrder",
  "deleteImportOrderImage",
  "deleteImportOrderLine",
  "deleteInventoryOrderTemplate",
  "getExportOrder",
  "getImportOrder",
  "getInventoryOrderTemplates",
  "getInventoryProduct",
  "getInventoryProductCatalog",
  "getInventoryProductsByCodes",
  "getInventoryProductsByIds",
  "listExportOrders",
  "listImportOrders",
  "reorderExportOrderLines",
  "reorderImportOrderLines",
  "resolveInventoryOrderAssetUrl",
  "scanInventoryInvoice",
  "searchInventoryOrderProducts",
  "searchInventoryOrderTemplateProducts",
  "setExportOrderStatus",
  "setImportOrderStatus",
  "updateExportOrderLine",
  "updateExportOrderMetadata",
  "updateExportOrderName",
  "updateImportOrderLine",
  "updateImportOrderMetadata",
  "updateImportOrderName",
  "updateInventoryOrderHistoryName",
  "updateInventoryOrderTemplateDisplayName",
  "updateInventoryOrderTemplateProducts",
  "uploadExportOrderImage",
  "uploadImportOrderImage",
];

const exerciseOrderContracts = async ({
  prefix,
  getOrder,
  createOrder,
  updateMetadata,
  updateName,
  setStatus,
  completeOrder,
  deleteOrder,
  addLine,
  updateLine,
  deleteLine,
  reorderLines,
  completeLine,
}) => {
  const order = { orderName: "Order 1", productList: [] };
  const metadata = { images: [`/${prefix}/invoice.webp`] };
  const nameChanges = { orderName: "Renamed", note: "Urgent" };
  const line = { productId: "product-1", quantity: 2 };
  const lineChanges = { ...line, status: true };
  const productList = [lineChanges];

  await getOrder("order-1");
  await createOrder(order);
  await updateMetadata("order-1", metadata);
  await updateName("order-1", nameChanges);
  await setStatus("order-1", false);
  await completeOrder("order-1");
  await deleteOrder("order-1");
  await addLine("order-1", line);
  await updateLine("order-1", 2, lineChanges);
  await deleteLine("order-1", 2);
  await reorderLines("order-1", productList);
  await completeLine("order-1", 2);

  expect(apiFetchMock.mock.calls).toEqual([
    [`/${prefix}/orders/order-1`, { headers: jsonHeaders }],
    [
      `/${prefix}/orders`,
      { method: "POST", json: order, headers: jsonHeaders },
    ],
    [
      `/${prefix}/orders/order-1`,
      { method: "PUT", json: metadata, headers: jsonHeaders },
    ],
    [
      `/${prefix}/orders/order-1/name`,
      { method: "PUT", json: nameChanges, headers: jsonHeaders },
    ],
    [
      `/${prefix}/orders/order-1/status`,
      { method: "PUT", json: { status: false }, headers: jsonHeaders },
    ],
    [
      `/${prefix}/orders/order-1/setStatusAndQuantity`,
      { method: "PUT", json: { status: true }, headers: jsonHeaders },
    ],
    [
      `/${prefix}/orders/order-1`,
      { method: "DELETE", headers: jsonHeaders },
    ],
    [
      `/${prefix}/orders/order-1/products`,
      { method: "POST", json: line, headers: jsonHeaders },
    ],
    [
      `/${prefix}/orders/order-1/products/2`,
      { method: "PUT", json: lineChanges, headers: jsonHeaders },
    ],
    [
      `/${prefix}/orders/order-1/products/2`,
      { method: "DELETE", headers: jsonHeaders },
    ],
    [
      `/${prefix}/orders/order-1/reorder`,
      { method: "PUT", json: { productList }, headers: jsonHeaders },
    ],
    [
      `/${prefix}/orders/order-1/products/2/setStatusAndQuantity`,
      { method: "PUT", json: { status: true }, headers: jsonHeaders },
    ],
  ]);
};

describe("inventoryOrderAdministrationApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it("exports exactly the required feature-level API", () => {
    expect(Object.keys(inventoryApi).sort()).toEqual(expectedExportNames.sort());
  });

  it("resolves relative inventory images against the API origin", () => {
    expect(inventoryApi.resolveInventoryOrderAssetUrl("/iporders/a.webp")).toBe(
      "https://api.test/iporders/a.webp",
    );
    expect(
      inventoryApi.resolveInventoryOrderAssetUrl("https://cdn.test/a.webp"),
    ).toBe("https://cdn.test/a.webp");
    expect(inventoryApi.resolveInventoryOrderAssetUrl("")).toBe("");
    expect(inventoryApi.resolveInventoryOrderAssetUrl(null)).toBe("");
    expect(resolveApiUrlMock).toHaveBeenCalledOnce();
  });

  it("keeps blank list filters and omits only undefined values", async () => {
    await inventoryApi.listImportOrders({
      page: 2,
      orderName: "",
      userName: "Lan Anh",
      status: "",
      startDate: undefined,
      endDate: "",
    });
    await inventoryApi.listExportOrders({
      page: 3,
      limit: 20,
      status: "true",
      byCompletedDate: "true",
      startDate: "",
      endDate: undefined,
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/iporders/orders?page=2&orderName=&userName=Lan+Anh&status=&endDate=",
      { headers: jsonHeaders },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/eporders/orders?page=3&limit=20&status=true&byCompletedDate=true&startDate=",
      { headers: jsonHeaders },
    );
  });

  it("maps import order and line contracts", async () => {
    await exerciseOrderContracts({
      prefix: "iporders",
      getOrder: inventoryApi.getImportOrder,
      createOrder: inventoryApi.createImportOrder,
      updateMetadata: inventoryApi.updateImportOrderMetadata,
      updateName: inventoryApi.updateImportOrderName,
      setStatus: inventoryApi.setImportOrderStatus,
      completeOrder: inventoryApi.completeImportOrder,
      deleteOrder: inventoryApi.deleteImportOrder,
      addLine: inventoryApi.addImportOrderLine,
      updateLine: inventoryApi.updateImportOrderLine,
      deleteLine: inventoryApi.deleteImportOrderLine,
      reorderLines: inventoryApi.reorderImportOrderLines,
      completeLine: inventoryApi.completeImportOrderLine,
    });
  });

  it("maps export order and line contracts", async () => {
    await exerciseOrderContracts({
      prefix: "eporders",
      getOrder: inventoryApi.getExportOrder,
      createOrder: inventoryApi.createExportOrder,
      updateMetadata: inventoryApi.updateExportOrderMetadata,
      updateName: inventoryApi.updateExportOrderName,
      setStatus: inventoryApi.setExportOrderStatus,
      completeOrder: inventoryApi.completeExportOrder,
      deleteOrder: inventoryApi.deleteExportOrder,
      addLine: inventoryApi.addExportOrderLine,
      updateLine: inventoryApi.updateExportOrderLine,
      deleteLine: inventoryApi.deleteExportOrderLine,
      reorderLines: inventoryApi.reorderExportOrderLines,
      completeLine: inventoryApi.completeExportOrderLine,
    });
  });

  it("maps template contracts and keeps template delete headerless", async () => {
    const template = {
      displayName: "Import template",
      products: [{ productId: "product-1", quantity: 2 }],
    };

    await inventoryApi.getInventoryOrderTemplates();
    await inventoryApi.createInventoryOrderTemplate(template);
    await inventoryApi.updateInventoryOrderTemplateProducts(4, template);
    await inventoryApi.updateInventoryOrderTemplateDisplayName(
      4,
      "Renamed template",
    );
    await inventoryApi.deleteInventoryOrderTemplate(4);

    expect(apiFetchMock.mock.calls).toEqual([
      ["/users/order-templates", { headers: jsonHeaders }],
      [
        "/users/order-templates",
        { method: "POST", json: template, headers: jsonHeaders },
      ],
      [
        "/users/order-template/4/products",
        { method: "PUT", json: template, headers: jsonHeaders },
      ],
      [
        "/users/order-template/4/display-name",
        {
          method: "PUT",
          json: { displayName: "Renamed template" },
          headers: jsonHeaders,
        },
      ],
      ["/users/order-template/4", { method: "DELETE" }],
    ]);
  });

  it("maps product, search, brand, and history contracts", async () => {
    const product = { name: "PLC S7", code: "PLC-1" };

    await inventoryApi.getInventoryProductsByIds(["product-1", "product-2"]);
    await inventoryApi.getInventoryProductCatalog();
    await inventoryApi.searchInventoryOrderProducts({
      search: "PLC S7",
      code: "",
      limit: undefined,
    });
    await inventoryApi.searchInventoryOrderTemplateProducts(
      "PLC S7&brand=Siemens",
    );
    await inventoryApi.getInventoryProduct("product-1");
    await inventoryApi.getInventoryProductsByCodes(["PLC-1", "PLC-2"]);
    await inventoryApi.createInventoryProduct(product);
    await inventoryApi.createInventoryBrand("Siemens");
    await inventoryApi.updateInventoryOrderHistoryName("order-1", "New name");

    expect(apiFetchMock.mock.calls).toEqual([
      [
        "/products/fetch-inventory-by-ids",
        {
          method: "POST",
          json: { ids: ["product-1", "product-2"] },
          headers: jsonHeaders,
        },
      ],
      ["/products/?limit=9999", { headers: jsonHeaders }],
      ["/products/?search=PLC+S7&code=", { headers: jsonHeaders }],
      [
        "/products/?search=PLC S7&brand=Siemens",
        { headers: jsonHeaders },
      ],
      ["/products/product-1", { headers: jsonHeaders }],
      [
        "/products/by-codes",
        {
          method: "POST",
          json: { codes: ["PLC-1", "PLC-2"] },
          headers: jsonHeaders,
        },
      ],
      [
        "/products/create",
        { method: "POST", json: product, headers: jsonHeaders },
      ],
      [
        "/chips/brands",
        {
          method: "POST",
          json: { Brand: "Siemens" },
          headers: jsonHeaders,
        },
      ],
      [
        "/histories/update-ordername",
        {
          method: "PUT",
          json: { orderId: "order-1", newOrderName: "New name" },
          headers: jsonHeaders,
        },
      ],
    ]);
  });

  it("keeps invoice and order image multipart contracts", async () => {
    const scanFile = new File(["scan"], "scan.webp", { type: "image/webp" });
    const importFile = new File(["import"], "import.webp", {
      type: "image/webp",
    });
    const exportFile = new File(["export"], "export.webp", {
      type: "image/webp",
    });

    await inventoryApi.scanInventoryInvoice(scanFile);
    await inventoryApi.uploadImportOrderImage(importFile);
    await inventoryApi.uploadExportOrderImage(exportFile);

    const expectedCalls = [
      ["/products/scan-invoice", scanFile],
      ["/iporders/upload-image", importFile],
      ["/eporders/upload-image", exportFile],
    ];

    expectedCalls.forEach(([path, file], index) => {
      const [actualPath, options] = apiFetchMock.mock.calls[index];
      expect(actualPath).toBe(path);
      expect(options.method).toBe("POST");
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.get("invoice")).toBe(file);
      expect(options).not.toHaveProperty("headers");
    });
  });

  it("encodes image URLs and keeps JSON delete headers", async () => {
    await inventoryApi.cleanInventoryTempImage(
      "/tmp/invoice one.webp?draft=true",
    );
    await inventoryApi.deleteImportOrderImage(
      "/iporders/invoice one.webp",
    );
    await inventoryApi.deleteExportOrderImage(
      "/eporders/invoice one.webp",
    );

    expect(apiFetchMock.mock.calls).toEqual([
      [
        "/products/clean-temp-image?imageUrl=%2Ftmp%2Finvoice%20one.webp%3Fdraft%3Dtrue",
        { method: "DELETE", headers: jsonHeaders },
      ],
      [
        "/iporders/delete-image?imageUrl=%2Fiporders%2Finvoice%20one.webp",
        { method: "DELETE", headers: jsonHeaders },
      ],
      [
        "/eporders/delete-image?imageUrl=%2Feporders%2Finvoice%20one.webp",
        { method: "DELETE", headers: jsonHeaders },
      ],
    ]);
  });

  it("maps cross-domain order creation without changing payloads", async () => {
    const exportOrder = {
      orderName: "Import 1_export",
      productList: [{ productId: "product-1", quantityEx: 0 }],
    };
    const importOrder = {
      orderName: "Export 1_import",
      productList: [{ productId: "product-2", quantityRe: 0 }],
    };

    await inventoryApi.createExportOrderFromImport(exportOrder);
    await inventoryApi.createImportOrderFromExport(importOrder);

    expect(apiFetchMock.mock.calls).toEqual([
      [
        "/eporders/orders",
        { method: "POST", json: exportOrder, headers: jsonHeaders },
      ],
      [
        "/iporders/orders",
        { method: "POST", json: importOrder, headers: jsonHeaders },
      ],
    ]);
  });

  it("returns raw 400 and 404 responses by identity", async () => {
    const response400 = { ok: false, status: 400 };
    const response404 = { ok: false, status: 404 };
    apiFetchMock
      .mockResolvedValueOnce(response400)
      .mockResolvedValueOnce(response404);

    await expect(inventoryApi.createInventoryBrand("Existing")).resolves.toBe(
      response400,
    );
    await expect(
      inventoryApi.deleteImportOrder("missing-order"),
    ).resolves.toBe(response404);
  });
});
