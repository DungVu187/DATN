import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
const resolveApiUrlMock = vi.hoisted(() =>
  vi.fn((pathValue) => `https://api.test${pathValue}`),
);

vi.mock("./httpClient", () => ({
  apiFetch: apiFetchMock,
  resolveApiUrl: resolveApiUrlMock,
}));

import {
  addSalesOrderItem,
  cancelSalesOrder,
  cleanSalesOrderTempImage,
  createAdminSalesOrderDraft,
  deleteSalesOrderImage,
  deleteSalesOrderItem,
  getAdminSalesOrderDetail,
  getProcessingSalesOrderCount,
  getSalesOrderProductsByCodes,
  getSalesOrderProductsByIds,
  getSalesOrderProductsForScan,
  getSalesOrders,
  reorderSalesOrderItems,
  resolveSalesOrderAssetUrl,
  scanSalesOrderInvoice,
  searchSalesOrderProducts,
  updateSalesOrderCustomer,
  updateSalesOrderField,
  updateSalesOrderImages,
  updateSalesOrderItemQuantity,
  uploadSalesOrderImage,
} from "./salesOrderManagementApi";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const jsonHeaders = { "Content-Type": "application/json" };

describe("salesOrderManagementApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it("maps sales-order and product reads", async () => {
    await getSalesOrders({ page: 2, limit: 10, status: "Completed" });
    await getAdminSalesOrderDetail("order-1");
    await searchSalesOrderProducts({ search: "PLC S7", code: "P1", limit: 20 });
    await getSalesOrderProductsForScan();
    await getSalesOrderProductsByIds(["p1", "p2"]);
    await getSalesOrderProductsByCodes(["P1", "P2"]);
    await getProcessingSalesOrderCount();

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/orders?page=2&limit=10&status=Completed",
      { headers: jsonHeaders },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/orders/admin-detail/order-1",
      { headers: jsonHeaders },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/products?search=PLC+S7&code=P1&limit=20",
      { headers: jsonHeaders },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      4,
      "/products/?limit=9999",
      { headers: jsonHeaders },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(5, "/products/fetch-by-ids", {
      method: "POST",
      headers: jsonHeaders,
      json: { ids: ["p1", "p2"] },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(6, "/products/by-codes", {
      method: "POST",
      headers: jsonHeaders,
      json: { codes: ["P1", "P2"] },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      7,
      "/orders/processing-count",
    );
  });

  it("maps sales-order mutations without changing payloads", async () => {
    const reorderedItems = [{ productId: "p1", variantIndex: 0, quantity: 2 }];

    await updateSalesOrderField("order-1", "status", "Completed");
    await createAdminSalesOrderDraft();
    await updateSalesOrderItemQuantity("order-1", 2, 5);
    await addSalesOrderItem("order-1", { productId: "p2", variantIndex: 1, quantity: 3 });
    await updateSalesOrderImages("order-1", ["/images/one.webp"]);
    await reorderSalesOrderItems("order-1", reorderedItems);
    await deleteSalesOrderItem("order-1", 1);
    await updateSalesOrderCustomer("order-1", { userName: "Lan", userPhone: "0901" });
    await cancelSalesOrder("order-1");

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/orders/update-order/order-1", {
      method: "PUT",
      headers: jsonHeaders,
      json: { field: "status", value: "Completed" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/orders/admin-draft", {
      method: "POST",
      headers: jsonHeaders,
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/orders/order-1/items/2", {
      method: "PUT",
      headers: jsonHeaders,
      json: { quantity: 5 },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(4, "/orders/order-1/items", {
      method: "POST",
      headers: jsonHeaders,
      json: { productId: "p2", variantIndex: 1, quantity: 3 },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(5, "/orders/order-1/images", {
      method: "PUT",
      headers: jsonHeaders,
      json: { images: ["/images/one.webp"] },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(6, "/orders/order-1/reorder", {
      method: "PUT",
      headers: jsonHeaders,
      json: { cartItems: reorderedItems },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(7, "/orders/order-1/items/1", {
      method: "DELETE",
      headers: jsonHeaders,
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(8, "/orders/order-1/customer", {
      method: "PUT",
      headers: jsonHeaders,
      json: { userName: "Lan", userPhone: "0901" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(9, "/orders/order-1", {
      method: "PUT",
      headers: jsonHeaders,
      json: { state: "Cancelled" },
    });
  });

  it("keeps invoice and order image multipart contracts", async () => {
    const scanFile = new File(["scan"], "scan.webp", { type: "image/webp" });
    const orderFile = new File(["order"], "order.webp", { type: "image/webp" });

    await scanSalesOrderInvoice(scanFile);
    await cleanSalesOrderTempImage("/tmp/invoice one.webp");
    await uploadSalesOrderImage(orderFile);
    await deleteSalesOrderImage("/orders/invoice one.webp");

    const scanOptions = apiFetchMock.mock.calls[0][1];
    expect(apiFetchMock.mock.calls[0][0]).toBe("/products/scan-invoice");
    expect(scanOptions.method).toBe("POST");
    expect(scanOptions.body).toBeInstanceOf(FormData);
    expect(scanOptions.body.get("invoice")).toBe(scanFile);
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/products/clean-temp-image?imageUrl=%2Ftmp%2Finvoice%20one.webp",
      { method: "DELETE", headers: jsonHeaders },
    );
    const uploadOptions = apiFetchMock.mock.calls[2][1];
    expect(apiFetchMock.mock.calls[2][0]).toBe("/orders/upload-image");
    expect(uploadOptions.method).toBe("POST");
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect(uploadOptions.body.get("invoice")).toBe(orderFile);
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      4,
      "/orders/delete-image?imageUrl=%2Forders%2Finvoice%20one.webp",
      { method: "DELETE", headers: jsonHeaders },
    );
  });

  it("resolves relative invoice images against the API origin", () => {
    expect(resolveSalesOrderAssetUrl("/orders/invoice.webp")).toBe(
      "https://api.test/orders/invoice.webp",
    );
    expect(resolveSalesOrderAssetUrl("https://cdn.test/invoice.webp")).toBe(
      "https://cdn.test/invoice.webp",
    );
    expect(resolveSalesOrderAssetUrl("")).toBe("");
  });

  it("keeps active Sales Order components free of direct HTTP transport", () => {
    for (const componentPath of [
      ["components", "orders.jsx"],
      ["components", "soldproducts.jsx"],
      ["components", "order", "orderdetail.jsx"],
    ]) {
      const source = fs.readFileSync(
        path.join(currentDirectory, "..", ...componentPath),
        "utf8",
      );
      expect(source).toContain("salesOrderManagementApi");
      expect(source).not.toContain("fetch(");
      expect(source).not.toContain("apiFetch");
    }
  });
});
