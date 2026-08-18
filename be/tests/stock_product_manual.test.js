const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../index");
const { User } = require("../components/user");
const { Product } = require("../components/product");
const { StorageHistory } = require("../components/storagehistory");
const { ActivityLog } = require("../components/activitylog");

const ADMIN_PHONE = "0963000001";

const cleanCollections = async () => {
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    StorageHistory.deleteMany({}),
    ActivityLog.deleteMany({}),
  ]);
};

const createAdminAgent = async () => {
  const admin = new User({
    phone: ADMIN_PHONE,
    password: "password123",
    name: "Manual Stock Admin",
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

const createProduct = ({ quantityInStorage = 10, quantityForSale = 10 } = {}) => {
  return Product.create({
    type: "PLC",
    name: "Manual Stock Product",
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

const adjustStock = (agent, product, quantity) => {
  return agent
    .post(`/products/${product._id}/0`)
    .send({
      quantity,
      orderId: "MANUAL-STOCK-TEST",
      orderName: "Manual stock test",
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

describe("Manual product stock adjustments", () => {
  it("adds five units to both stock fields and records a positive manual history", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct();

    const response = await adjustStock(agent, product, 5);

    expect(response.status).toBe(200);
    await expectStock(product._id, 15, 15);
    const histories = await StorageHistory.find({ productId: product._id });
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({ quantity: 5, source: "product_manual" });
  });

  it("subtracts three units from both stock fields and records a negative manual history", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct();

    const response = await adjustStock(agent, product, -3);

    expect(response.status).toBe(200);
    await expectStock(product._id, 7, 7);
    const histories = await StorageHistory.find({ productId: product._id });
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({ quantity: -3, source: "product_manual" });
  });

  it("rejects a zero adjustment without changing stock or writing history", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct();

    const response = await adjustStock(agent, product, 0);

    expect(response.status).toBe(400);
    await expectStock(product._id, 10, 10);
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it("rejects a negative adjustment above stock without changing stock or writing history", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 4, quantityForSale: 4 });

    const response = await adjustStock(agent, product, -5);

    expect(response.status).toBe(400);
    await expectStock(product._id, 4, 4);
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it("updates variant metadata without restoring stale stock values", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct();
    const staleVariant = product.variant[0].toObject();
    expect((await adjustStock(agent, product, 5)).status).toBe(200);

    const response = await agent
      .put(`/products/${product._id}/0`)
      .send({
        price: "125000",
        color: "Đen",
        quantityForSale: staleVariant.quantityForSale,
        quantityInStorage: staleVariant.quantityInStorage,
      });

    expect(response.status).toBe(200);
    const persistedProduct = await Product.findById(product._id);
    expect(persistedProduct.variant[0]).toMatchObject({
      price: "125000",
      color: "Đen",
      quantityForSale: 15,
      quantityInStorage: 15,
    });
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(1);
  });

  it("updates whole-product metadata without restoring stale variant stock values", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct();
    const staleVariant = product.variant[0].toObject();
    expect((await adjustStock(agent, product, 5)).status).toBe(200);

    const response = await agent
      .put(`/products/${product._id}`)
      .send({
        name: "Manual Stock Product Updated",
        variant: [{
          _id: staleVariant._id.toString(),
          price: "130000",
          color: "Đỏ",
          quantityForSale: staleVariant.quantityForSale,
          quantityInStorage: staleVariant.quantityInStorage,
        }],
      });

    expect(response.status).toBe(200);
    const persistedProduct = await Product.findById(product._id);
    expect(persistedProduct.name).toBe("Manual Stock Product Updated");
    expect(persistedProduct.variant[0]).toMatchObject({
      price: "130000",
      color: "Đỏ",
      quantityForSale: 15,
      quantityInStorage: 15,
    });
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(1);
  });

  it("rejects negative stock when a product is created", async () => {
    const agent = await createAdminAgent();

    const response = await agent
      .post("/products/create")
      .send({
        type: "PLC",
        name: "Negative stock product",
        brand: "Test Brand",
        section: "Thiết bị tự động hóa",
        value: "PLC",
        warranty: "12 tháng",
        variant: [{
          price: "100000",
          quantityForSale: -1,
          quantityInStorage: 0,
        }],
      });

    expect(response.status).toBe(400);
    expect(await Product.countDocuments({ name: "Negative stock product" })).toBe(0);
  });

  it("does not accept a client-supplied duplicate variant id", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 0, quantityForSale: 0 });
    const originalVariantId = product.variant[0]._id.toString();

    const response = await agent
      .post(`/products/${product._id}/variant`)
      .send({
        _id: originalVariantId,
        price: "200000",
        quantityForSale: 0,
        quantityInStorage: 0,
      });

    expect(response.status).toBe(201);
    const persistedProduct = await Product.findById(product._id);
    expect(persistedProduct.variant).toHaveLength(2);
    expect(persistedProduct.variant[1]._id.toString()).not.toBe(originalVariantId);
    expect(new Set(persistedProduct.variant.map((item) => item._id.toString())).size).toBe(2);
  });

  it("only deletes a zero-stock last variant so existing indexes cannot shift", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct({ quantityInStorage: 0, quantityForSale: 0 });
    expect((await agent
      .post(`/products/${product._id}/variant`)
      .send({ price: "200000", quantityForSale: 0, quantityInStorage: 0 })).status).toBe(201);

    const shiftedIndexResponse = await agent.delete(`/products/${product._id}/0`);
    expect(shiftedIndexResponse.status).toBe(400);

    const lastIndexResponse = await agent.delete(`/products/${product._id}/1`);
    expect(lastIndexResponse.status).toBe(200);
    const persistedProduct = await Product.findById(product._id);
    expect(persistedProduct.variant).toHaveLength(1);
  });

  it("increments purchaseCount atomically under concurrent manual updates", async () => {
    const agent = await createAdminAgent();
    const product = await createProduct();

    const responses = await Promise.all(
      Array.from({ length: 12 }, () => agent
        .put(`/products/purchase/${product._id}`)
        .send({ action: "increase", amount: 1 }))
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    const persistedProduct = await Product.findById(product._id);
    expect(persistedProduct.purchaseCount).toBe(12);
  });
});
