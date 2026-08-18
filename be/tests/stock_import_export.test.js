const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../index");
const { User } = require("../components/user");
const { Product } = require("../components/product");
const { IpOrder } = require("../components/iporder");
const { EpOrder } = require("../components/eporder");
const { StorageHistory } = require("../components/storagehistory");

const ADMIN_PHONE = "0962000001";

const cleanCollections = async () => {
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    IpOrder.deleteMany({}),
    EpOrder.deleteMany({}),
    StorageHistory.deleteMany({}),
  ]);
};

const createAdminAgent = async () => {
  const admin = new User({
    phone: ADMIN_PHONE,
    password: "password123",
    name: "Stock Import Export Admin",
    role: "admin",
  });
  await admin.save();

  const agent = request.agent(app);
  const loginResponse = await agent
    .post("/users/admin/login")
    .send({ phone: ADMIN_PHONE, password: "password123" });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.headers["set-cookie"]).toBeDefined();
  return agent;
};

const createProduct = ({ name = "Stock Movement Product", quantityInStorage, quantityForSale }) => {
  return Product.create({
    type: "PLC",
    name,
    brand: "Test Brand",
    section: "Thiết bị tự động hóa",
    value: "PLC",
    warranty: "12 tháng",
    variant: [{
      price: "100000",
      color: "Xám",
      quantityForSale,
      quantityInStorage,
    }],
  });
};

const createIpOrder = ({ orderName, productList }) => {
  return IpOrder.create({
    orderName,
    userName: "Import Seeder",
    productList,
  });
};

const createEpOrder = ({ orderName, productList }) => {
  return EpOrder.create({
    orderName,
    userName: "Export Seeder",
    productList,
  });
};

const expectStock = async (productId, quantityForSale, quantityInStorage) => {
  const product = await Product.findById(productId);
  expect(product.variant[0].quantityForSale).toBe(quantityForSale);
  expect(product.variant[0].quantityInStorage).toBe(quantityInStorage);
};

beforeAll(async () => {
  await mongoose.connect("mongodb://localhost:27017/EcomTest");
});

afterAll(async () => {
  await cleanCollections();
  await mongoose.disconnect();
});

afterEach(async () => {
  await cleanCollections();
});

describe("Import and export stock accounting", () => {
  it("completes one import line and records a positive line history", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 10, quantityForSale: 8 });
    const order = await createIpOrder({
      orderName: "Import line completion",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 3,
        quantityRe: 0,
        status: false,
      }],
    });

    const response = await agent
      .put(`/iporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });

    expect(response.status).toBe(200);
    await expectStock(product._id, 11, 13);
    const histories = await StorageHistory.find({ productId: product._id });
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({ quantity: 3, source: "order_line_complete" });
  });

  it("applies a concurrently submitted import line only once", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 5, quantityForSale: 5 });
    const order = await createIpOrder({
      orderName: "Concurrent import line completion",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 2,
        quantityRe: 0,
        status: false,
      }],
    });

    const responses = await Promise.all([
      agent
        .put(`/iporders/orders/${order._id}/products/0/setStatusAndQuantity`)
        .send({ status: true }),
      agent
        .put(`/iporders/orders/${order._id}/products/0/setStatusAndQuantity`)
        .send({ status: true }),
    ]);

    expect(responses.some((response) => response.status === 200)).toBe(true);
    expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
    await expectStock(product._id, 7, 7);

    const persistedOrder = await IpOrder.findById(order._id);
    expect(persistedOrder.productList[0]).toMatchObject({
      quantityRe: 2,
      status: true,
    });
    const histories = await StorageHistory.find({
      productId: product._id,
      source: "order_line_complete",
    });
    expect(histories).toHaveLength(1);
    expect(histories[0].quantity).toBe(2);
  });

  it("completes an entire import order and records each remaining positive delta", async () => {
    const agent = await createAdminAgent();
    const firstProduct = await createProduct({
      name: "First Bulk Import Product",
      quantityInStorage: 10,
      quantityForSale: 8,
    });
    const secondProduct = await createProduct({
      name: "Second Bulk Import Product",
      quantityInStorage: 7,
      quantityForSale: 5,
    });
    const order = await createIpOrder({
      orderName: "Bulk import completion",
      productList: [
        {
          productId: firstProduct._id.toString(),
          price: "100000",
          unit: "cái",
          quantity: 4,
          quantityRe: 1,
          status: false,
        },
        {
          productId: secondProduct._id.toString(),
          price: "100000",
          unit: "cái",
          quantity: 2,
          quantityRe: 0,
          status: false,
        },
      ],
    });

    const response = await agent
      .put(`/iporders/orders/${order._id}/setStatusAndQuantity`)
      .send({ status: true });

    expect(response.status).toBe(200);
    await expectStock(firstProduct._id, 11, 13);
    await expectStock(secondProduct._id, 7, 9);
    const histories = await StorageHistory.find({ orderId: order._id.toString() }).sort({ quantity: 1 });
    expect(histories).toHaveLength(2);
    expect(histories.map((history) => ({
      quantity: history.quantity,
      source: history.source,
    }))).toEqual([
      { quantity: 2, source: "order_bulk_complete" },
      { quantity: 3, source: "order_bulk_complete" },
    ]);
  });

  it("applies only the received-quantity delta when an import line is edited repeatedly", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 10, quantityForSale: 10 });
    const order = await createIpOrder({
      orderName: "Import quantity delta",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 10,
        quantityRe: 0,
        status: false,
      }],
    });

    const firstResponse = await agent
      .put(`/iporders/orders/${order._id}/products/0`)
      .send({ quantityRe: 3 });

    expect(firstResponse.status).toBe(200);
    await expectStock(product._id, 13, 13);
    let histories = await StorageHistory.find({ productId: product._id }).sort({ createdAt: 1 });
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({ quantity: 3, source: "order_line_manual" });

    const secondResponse = await agent
      .put(`/iporders/orders/${order._id}/products/0`)
      .send({ quantityRe: 5 });

    const productAfterSecondEdit = await Product.findById(product._id);
    const orderAfterSecondEdit = await IpOrder.findById(order._id);
    histories = await StorageHistory.find({ productId: product._id }).sort({ createdAt: 1 });
    expect({
      status: secondResponse.status,
      persistedProductId: orderAfterSecondEdit.productList[0].productId,
      persistedQuantityRe: orderAfterSecondEdit.productList[0].quantityRe,
      quantityForSale: productAfterSecondEdit.variant[0].quantityForSale,
      quantityInStorage: productAfterSecondEdit.variant[0].quantityInStorage,
      historyQuantities: histories.map((history) => history.quantity),
      historySources: histories.map((history) => history.source),
    }).toEqual({
      status: 200,
      persistedProductId: product._id.toString(),
      persistedQuantityRe: 5,
      quantityForSale: 15,
      quantityInStorage: 15,
      historyQuantities: [3, 2],
      historySources: ["order_line_manual", "order_line_manual"],
    });
  });

  it("rejects pre-completed import lines when an order is created", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 5, quantityForSale: 5 });

    const response = await agent
      .post("/iporders/orders")
      .send({
        orderName: "Forged pre-completed import",
        productList: [{
          productId: product._id.toString(),
          price: "100000",
          unit: "cái",
          quantity: 1,
          quantityRe: 1,
          status: true,
        }],
      });

    expect(response.status).toBe(400);
    expect(await IpOrder.countDocuments({ orderName: "Forged pre-completed import" })).toBe(0);
    await expectStock(product._id, 5, 5);
  });

  it("rejects string import status values instead of casting them to completed", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 5, quantityForSale: 5 });
    const order = await createIpOrder({
      orderName: "String import status bypass",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 1,
        quantityRe: 0,
        status: false,
      }],
    });

    const [lineResponse, orderResponse] = await Promise.all([
      agent
        .put(`/iporders/orders/${order._id}/products/0/status`)
        .send({ status: "true" }),
      agent
        .put(`/iporders/orders/${order._id}/status`)
        .send({ status: "true" }),
    ]);

    expect(lineResponse.status).toBe(400);
    expect(orderResponse.status).toBe(400);
    const persistedOrder = await IpOrder.findById(order._id);
    expect(persistedOrder.status).toBe(false);
    expect(persistedOrder.productList[0].status).toBe(false);
    await expectStock(product._id, 5, 5);
  });

  it("ignores client skipStockUpdate on imports and records the real stock movement", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 5, quantityForSale: 5 });
    const order = await createIpOrder({ orderName: "Import skip bypass", productList: [] });

    const response = await agent
      .post(`/iporders/orders/${order._id}/products`)
      .send({
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 1,
        quantityRe: 1,
        status: true,
        skipStockUpdate: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.productList[0]).toMatchObject({
      quantityRe: 1,
      status: true,
      stockAppliedQuantity: 1,
    });
    await expectStock(product._id, 6, 6);
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(1);
  });

  it("does not let an import line edit move applied stock to another product", async () => {
    const agent = await createAdminAgent();
    const firstProduct = await createProduct({
      name: "Original import product",
      quantityInStorage: 2,
      quantityForSale: 2,
    });
    const secondProduct = await createProduct({
      name: "Replacement import product",
      quantityInStorage: 2,
      quantityForSale: 2,
    });
    const order = await createIpOrder({ orderName: "Import product move bypass", productList: [] });
    const addResponse = await agent
      .post(`/iporders/orders/${order._id}/products`)
      .send({
        productId: firstProduct._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 1,
        quantityRe: 1,
      });
    expect(addResponse.status).toBe(200);

    const editResponse = await agent
      .put(`/iporders/orders/${order._id}/products/0`)
      .send({
        ...addResponse.body.productList[0],
        productId: secondProduct._id.toString(),
      });

    expect(editResponse.status).toBe(400);
    await expectStock(firstProduct._id, 3, 3);
    await expectStock(secondProduct._id, 2, 2);
    const persistedOrder = await IpOrder.findById(order._id);
    expect(persistedOrder.productList[0].productId).toBe(firstProduct._id.toString());
  });

  it("keeps legacy zero-quantity import and export orders editable for metadata only", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 1, quantityForSale: 1 });
    const importOrder = await createIpOrder({
      orderName: "Legacy zero import",
      productList: [{
        productId: product._id.toString(),
        price: "0",
        unit: "cái",
        quantity: 0,
        quantityRe: 0,
        status: false,
      }],
    });
    const exportOrder = await createEpOrder({
      orderName: "Legacy zero export",
      productList: [{
        productId: product._id.toString(),
        price: "0",
        unit: "cái",
        quantity: 0,
        quantityEx: 0,
        status: false,
      }],
    });

    const [importResponse, exportResponse] = await Promise.all([
      agent
        .put(`/iporders/orders/${importOrder._id}`)
        .send({ images: ["/invoice-images/import.webp"] }),
      agent
        .put(`/eporders/orders/${exportOrder._id}`)
        .send({ images: ["/invoice-images/export.webp"] }),
    ]);

    expect(importResponse.status).toBe(200);
    expect(exportResponse.status).toBe(200);
    expect(importResponse.body.images).toEqual(["/invoice-images/import.webp"]);
    expect(exportResponse.body.images).toEqual(["/invoice-images/export.webp"]);
    await expectStock(product._id, 1, 1);
  });

  it("exports available stock and records a negative line history", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 10, quantityForSale: 8 });
    const order = await createEpOrder({
      orderName: "Export available stock",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 3,
        quantityEx: 0,
        status: false,
      }],
    });

    const response = await agent
      .put(`/eporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });

    expect(response.status).toBe(200);
    await expectStock(product._id, 5, 7);
    const histories = await StorageHistory.find({ productId: product._id });
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({ quantity: -3, source: "order_line_complete" });
  });

  it("allows only one of two export orders to consume the final unit", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 1, quantityForSale: 1 });
    const firstOrder = await createEpOrder({
      orderName: "Concurrent export first",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 1,
        quantityEx: 0,
        status: false,
      }],
    });
    const secondOrder = await createEpOrder({
      orderName: "Concurrent export second",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 1,
        quantityEx: 0,
        status: false,
      }],
    });

    const responses = await Promise.all([
      agent
        .put(`/eporders/orders/${firstOrder._id}/products/0/setStatusAndQuantity`)
        .send({ status: true }),
      agent
        .put(`/eporders/orders/${secondOrder._id}/products/0/setStatusAndQuantity`)
        .send({ status: true }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    await expectStock(product._id, 0, 0);
    const persistedOrders = await EpOrder.find({
      _id: { $in: [firstOrder._id, secondOrder._id] },
    });
    expect(persistedOrders.filter((order) => order.productList[0].status)).toHaveLength(1);
    expect(await StorageHistory.countDocuments({
      productId: product._id,
      source: "order_line_complete",
    })).toBe(1);
  });

  it("applies a concurrently submitted export line only once", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 5, quantityForSale: 5 });
    const order = await createEpOrder({
      orderName: "Concurrent duplicate export",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 2,
        quantityEx: 0,
        status: false,
      }],
    });

    const responses = await Promise.all([
      agent
        .put(`/eporders/orders/${order._id}/products/0/setStatusAndQuantity`)
        .send({ status: true }),
      agent
        .put(`/eporders/orders/${order._id}/products/0/setStatusAndQuantity`)
        .send({ status: true }),
    ]);

    expect(responses.some((response) => response.status === 200)).toBe(true);
    expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
    await expectStock(product._id, 3, 3);
    const persistedOrder = await EpOrder.findById(order._id);
    expect(persistedOrder.productList[0]).toMatchObject({
      quantityEx: 2,
      status: true,
    });
    expect(await StorageHistory.countDocuments({
      productId: product._id,
      source: "order_line_complete",
    })).toBe(1);
  });

  it("rolls back a bulk export when sale stock is insufficient for a later product", async () => {
    const agent = await createAdminAgent();
    const firstProduct = await createProduct({
      name: "Bulk rollback first product",
      quantityInStorage: 1,
      quantityForSale: 1,
    });
    const secondProduct = await createProduct({
      name: "Bulk rollback second product",
      quantityInStorage: 1,
      quantityForSale: 0,
    });
    const order = await createEpOrder({
      orderName: "Bulk export rollback",
      productList: [firstProduct, secondProduct].map((product) => ({
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 1,
        quantityEx: 0,
        status: false,
      })),
    });

    const response = await agent
      .put(`/eporders/orders/${order._id}/setStatusAndQuantity`)
      .send({ status: true });

    expect(response.status).toBe(400);
    await expectStock(firstProduct._id, 1, 1);
    await expectStock(secondProduct._id, 0, 1);
    const persistedOrder = await EpOrder.findById(order._id);
    expect(persistedOrder.status).toBe(false);
    expect(persistedOrder.productList.every((item) => item.status === false)).toBe(true);
    expect(await StorageHistory.countDocuments({ orderId: order._id.toString() })).toBe(0);
  });

  it("rejects export when sale stock is insufficient and leaves both stock fields unchanged", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 10, quantityForSale: 2 });
    const order = await createEpOrder({
      orderName: "Export insufficient sale stock",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 4,
        quantityEx: 0,
        status: false,
      }],
    });

    const response = await agent
      .put(`/eporders/orders/${order._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });

    const productAfterRejectedExport = await Product.findById(product._id);
    const histories = await StorageHistory.find({ productId: product._id });
    expect({
      status: response.status,
      quantityForSale: productAfterRejectedExport.variant[0].quantityForSale,
      quantityInStorage: productAfterRejectedExport.variant[0].quantityInStorage,
      historyQuantities: histories.map((history) => history.quantity),
      historySources: histories.map((history) => history.source),
    }).toEqual({
      status: 400,
      quantityForSale: 2,
      quantityInStorage: 10,
      historyQuantities: [],
      historySources: [],
    });
  });

  it("rejects pre-completed export lines when an order is created", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 5, quantityForSale: 5 });

    const response = await agent
      .post("/eporders/orders")
      .send({
        orderName: "Forged pre-completed export",
        productList: [{
          productId: product._id.toString(),
          price: "100000",
          unit: "cái",
          quantity: 1,
          quantityEx: 1,
          status: true,
        }],
      });

    expect(response.status).toBe(400);
    expect(await EpOrder.countDocuments({ orderName: "Forged pre-completed export" })).toBe(0);
    await expectStock(product._id, 5, 5);
  });

  it("rejects string status values instead of letting Mongoose cast them to completed", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 5, quantityForSale: 5 });
    const order = await createEpOrder({
      orderName: "String status bypass",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 1,
        quantityEx: 0,
        status: false,
      }],
    });

    const [lineResponse, orderResponse] = await Promise.all([
      agent
        .put(`/eporders/orders/${order._id}/products/0/status`)
        .send({ status: "true" }),
      agent
        .put(`/eporders/orders/${order._id}/status`)
        .send({ status: "true" }),
    ]);

    expect(lineResponse.status).toBe(400);
    expect(orderResponse.status).toBe(400);
    const persistedOrder = await EpOrder.findById(order._id);
    expect(persistedOrder.status).toBe(false);
    expect(persistedOrder.productList[0].status).toBe(false);
    await expectStock(product._id, 5, 5);
  });

  it("tracks the AI zero-stock exception without creating stock when progress is reduced", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 0, quantityForSale: 0 });
    const order = await createEpOrder({ orderName: "AI zero-stock exception", productList: [] });

    const addResponse = await agent
      .post(`/eporders/orders/${order._id}/products`)
      .send({
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 2,
        quantityEx: 2,
        status: true,
        isAIScan: true,
        skipStockUpdate: true,
      });

    expect(addResponse.status).toBe(200);
    expect(addResponse.body.productList[0]).toMatchObject({
      quantityEx: 2,
      status: true,
      stockAppliedQuantity: 0,
      stockUpdateSkipped: true,
    });
    await expectStock(product._id, 0, 0);

    const editResponse = await agent
      .put(`/eporders/orders/${order._id}/products/0`)
      .send({
        ...addResponse.body.productList[0],
        quantityEx: 0,
        status: false,
      });

    expect(editResponse.status).toBe(200);
    expect(editResponse.body.productList[0]).toMatchObject({
      quantityEx: 0,
      status: false,
      stockAppliedQuantity: 0,
    });
    await expectStock(product._id, 0, 0);
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it("does not let skipStockUpdate bypass a product that has stock", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 1, quantityForSale: 1 });
    const order = await createEpOrder({ orderName: "Invalid stock bypass", productList: [] });

    const response = await agent
      .post(`/eporders/orders/${order._id}/products`)
      .send({
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 1,
        quantityEx: 1,
        status: true,
        isAIScan: true,
        skipStockUpdate: true,
      });

    expect(response.status).toBe(400);
    const persistedOrder = await EpOrder.findById(order._id);
    expect(persistedOrder.productList).toHaveLength(0);
    await expectStock(product._id, 1, 1);
  });

  it("does not let an export line edit move applied stock to another product", async () => {
    const agent = await createAdminAgent();
    const firstProduct = await createProduct({
      name: "Original export product",
      quantityInStorage: 2,
      quantityForSale: 2,
    });
    const secondProduct = await createProduct({
      name: "Replacement export product",
      quantityInStorage: 2,
      quantityForSale: 2,
    });
    const order = await createEpOrder({ orderName: "Product move bypass", productList: [] });
    const addResponse = await agent
      .post(`/eporders/orders/${order._id}/products`)
      .send({
        productId: firstProduct._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 1,
        quantityEx: 1,
      });
    expect(addResponse.status).toBe(200);

    const editResponse = await agent
      .put(`/eporders/orders/${order._id}/products/0`)
      .send({
        ...addResponse.body.productList[0],
        productId: secondProduct._id.toString(),
      });

    expect(editResponse.status).toBe(400);
    await expectStock(firstProduct._id, 1, 1);
    await expectStock(secondProduct._id, 2, 2);
    const persistedOrder = await EpOrder.findById(order._id);
    expect(persistedOrder.productList[0].productId).toBe(firstProduct._id.toString());
  });

  it("keeps net stock at original plus six after importing ten and exporting four", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 5, quantityForSale: 5 });
    const importOrder = await createIpOrder({
      orderName: "Consistency import",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 10,
        quantityRe: 0,
        status: false,
      }],
    });

    const importResponse = await agent
      .put(`/iporders/orders/${importOrder._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });

    expect(importResponse.status).toBe(200);
    await expectStock(product._id, 15, 15);
    let histories = await StorageHistory.find({ productId: product._id });
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({ quantity: 10, source: "order_line_complete" });

    const exportOrder = await createEpOrder({
      orderName: "Consistency export",
      productList: [{
        productId: product._id.toString(),
        price: "100000",
        unit: "cái",
        quantity: 4,
        quantityEx: 0,
        status: false,
      }],
    });
    const exportResponse = await agent
      .put(`/eporders/orders/${exportOrder._id}/products/0/setStatusAndQuantity`)
      .send({ status: true });

    expect(exportResponse.status).toBe(200);
    await expectStock(product._id, 11, 11);
    histories = await StorageHistory.find({ productId: product._id }).sort({ quantity: -1 });
    expect(histories).toHaveLength(2);
    expect(histories.map((history) => ({
      quantity: history.quantity,
      source: history.source,
    }))).toEqual([
      { quantity: 10, source: "order_line_complete" },
      { quantity: -4, source: "order_line_complete" },
    ]);
  });
});
