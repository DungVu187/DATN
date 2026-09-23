const request = require("supertest");
const mongoose = require("mongoose");

jest.mock("../mailer", () => ({
  sendNewOrderNotification: jest.fn().mockResolvedValue(undefined),
  sendResetOtpEmail: jest.fn().mockResolvedValue(undefined),
}));

const app = require("../index");
const { User } = require("../components/user");
const { Product } = require("../components/product");
const { Order } = require("../components/order");
const { StorageHistory } = require("../components/storagehistory");
const { defaultPermissionsFor } = require("./fixtures/adminPermissions");
const Counter = mongoose.model("Counter");

const CUSTOMER_PHONE = "0961000001";
const SECOND_CUSTOMER_PHONE = "0961000003";
const ADMIN_PHONE = "0961000002";

const cleanCollections = async () => {
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    StorageHistory.deleteMany({}),
    Counter.deleteMany({}),
  ]);
};

const createProduct = ({ quantityForSale, quantityInStorage = quantityForSale }) => {
  return Product.create({
    type: "PLC",
    name: `Lifecycle Product ${quantityForSale}-${quantityInStorage}`,
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

const createUserAndAgent = async ({ phone, role }) => {
  const user = new User({
    phone,
    password: "password123",
    name: `${role} Stock Test`,
    role,
    permissions: defaultPermissionsFor(role),
  });
  await user.save();

  const agent = request.agent(app);
  const endpoint = role === "customer" ? "/users/login" : "/users/admin/login";
  const loginResponse = await agent
    .post(endpoint)
    .send({ phone, password: "password123" });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.headers["set-cookie"]).toBeDefined();
  return agent;
};

const placeOrder = (agent, product, quantity) => {
  return agent
    .post("/orders/create-order")
    .send({
      cartItems: [{
        productId: product._id.toString(),
        variantIndex: 0,
        quantity,
      }],
      total: 1,
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

describe("Stock lifecycle for customer orders", () => {
  it("subtracts exactly three sale units for a successful order", async () => {
    const product = await createProduct({ quantityForSale: 10, quantityInStorage: 10 });
    const customerAgent = await createUserAndAgent({ phone: CUSTOMER_PHONE, role: "customer" });

    const response = await placeOrder(customerAgent, product, 3);

    expect(response.status).toBe(201);
    await expectStock(product._id, 7, 10);
    expect(await Order.countDocuments({ userPhone: CUSTOMER_PHONE })).toBe(1);
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it("rejects an order above available sale stock without changing inventory", async () => {
    const product = await createProduct({ quantityForSale: 2, quantityInStorage: 10 });
    const customerAgent = await createUserAndAgent({ phone: CUSTOMER_PHONE, role: "customer" });

    const response = await placeOrder(customerAgent, product, 5);

    expect(response.status).toBe(400);
    await expectStock(product._id, 2, 10);
    expect(await Order.countDocuments({ userPhone: CUSTOMER_PHONE })).toBe(0);
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it("allows ordering exactly all available sale stock without going negative", async () => {
    const product = await createProduct({ quantityForSale: 5, quantityInStorage: 5 });
    const customerAgent = await createUserAndAgent({ phone: CUSTOMER_PHONE, role: "customer" });

    const response = await placeOrder(customerAgent, product, 5);

    expect(response.status).toBe(201);
    await expectStock(product._id, 0, 5);
    expect(await Order.countDocuments({ userPhone: CUSTOMER_PHONE })).toBe(1);
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it("restores sale stock when the customer cancels an order", async () => {
    const product = await createProduct({ quantityForSale: 10, quantityInStorage: 10 });
    const customerAgent = await createUserAndAgent({ phone: CUSTOMER_PHONE, role: "customer" });
    const createResponse = await placeOrder(customerAgent, product, 3);
    expect(createResponse.status).toBe(201);
    await expectStock(product._id, 7, 10);

    const cancelResponse = await customerAgent
      .put(`/orders/${createResponse.body.order._id}`)
      .send({ state: "Cancelled" });

    expect(cancelResponse.status).toBe(200);
    await expectStock(product._id, 10, 10);
    const cancelledOrder = await Order.findById(createResponse.body.order._id);
    expect(cancelledOrder.state).toBe("Cancelled");
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it("subtracts storage on completion and restores it on completion rollback", async () => {
    const product = await createProduct({ quantityForSale: 10, quantityInStorage: 10 });
    const customerAgent = await createUserAndAgent({ phone: CUSTOMER_PHONE, role: "customer" });
    const adminAgent = await createUserAndAgent({ phone: ADMIN_PHONE, role: "admin" });
    const createResponse = await placeOrder(customerAgent, product, 3);
    expect(createResponse.status).toBe(201);
    await expectStock(product._id, 7, 10);

    const completeResponse = await adminAgent
      .put(`/orders/update-order/${createResponse.body.order._id}`)
      .send({ field: "status", value: "Completed" });

    expect(completeResponse.status).toBe(200);
    await expectStock(product._id, 7, 7);
    let histories = await StorageHistory.find({ productId: product._id }).sort({ createdAt: 1 });
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({ quantity: -3, source: "online_sale" });

    const revertResponse = await adminAgent
      .put(`/orders/update-order/${createResponse.body.order._id}`)
      .send({ field: "status", value: "Processing" });

    expect(revertResponse.status).toBe(200);
    await expectStock(product._id, 7, 10);
    histories = await StorageHistory.find({ productId: product._id }).sort({ createdAt: 1 });
    expect(histories).toHaveLength(2);
    expect(histories.map((history) => ({
      quantity: history.quantity,
      source: history.source,
    }))).toEqual([
      { quantity: -3, source: "online_sale" },
      { quantity: 3, source: "online_sale_revert" },
    ]);
  });

  it("does not sell the final unit twice in sequential requests", async () => {
    const product = await createProduct({ quantityForSale: 1, quantityInStorage: 1 });
    const customerAgent = await createUserAndAgent({ phone: CUSTOMER_PHONE, role: "customer" });

    const firstResponse = await placeOrder(customerAgent, product, 1);
    expect(firstResponse.status).toBe(201);
    await expectStock(product._id, 0, 1);

    const secondResponse = await placeOrder(customerAgent, product, 1);
    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.message).toContain('chỉ nhận liên hệ');
    await expectStock(product._id, 0, 1);
    expect(await Order.countDocuments({ userPhone: CUSTOMER_PHONE })).toBe(1);
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it("allows only one of two concurrent customers to reserve the final unit", async () => {
    const product = await createProduct({ quantityForSale: 1, quantityInStorage: 1 });
    const firstCustomer = await createUserAndAgent({
      phone: CUSTOMER_PHONE,
      role: "customer",
    });
    const secondCustomer = await createUserAndAgent({
      phone: SECOND_CUSTOMER_PHONE,
      role: "customer",
    });

    const responses = await Promise.all([
      placeOrder(firstCustomer, product, 1),
      placeOrder(secondCustomer, product, 1),
    ]);

    const responseStatuses = responses.map((response) => response.status).sort();
    expect(responseStatuses[0]).toBe(201);
    expect([400, 409]).toContain(responseStatuses[1]);
    await expectStock(product._id, 0, 1);
    expect(await Order.countDocuments({})).toBe(1);
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });

  it("rolls back reserved stock when saving the order fails", async () => {
    const product = await createProduct({ quantityForSale: 4, quantityInStorage: 4 });
    const customerAgent = await createUserAndAgent({
      phone: CUSTOMER_PHONE,
      role: "customer",
    });
    jest.spyOn(Order.prototype, "save").mockRejectedValueOnce(
      new Error("forced order save failure")
    );

    const response = await placeOrder(customerAgent, product, 3);

    expect(response.status).toBe(500);
    await expectStock(product._id, 4, 4);
    expect(await Order.countDocuments({})).toBe(0);
  });

  it("applies concurrent completion and completion rollback only once", async () => {
    const product = await createProduct({ quantityForSale: 5, quantityInStorage: 5 });
    const customerAgent = await createUserAndAgent({
      phone: CUSTOMER_PHONE,
      role: "customer",
    });
    const adminAgent = await createUserAndAgent({ phone: ADMIN_PHONE, role: "admin" });
    const createResponse = await placeOrder(customerAgent, product, 2);
    const orderId = createResponse.body.order._id;

    const completionResponses = await Promise.all([
      adminAgent.put(`/orders/update-order/${orderId}`).send({ field: "status", value: "Completed" }),
      adminAgent.put(`/orders/update-order/${orderId}`).send({ field: "status", value: "Completed" }),
    ]);

    expect(completionResponses.some((response) => response.status === 200)).toBe(true);
    expect(completionResponses.every((response) => [200, 409].includes(response.status))).toBe(true);
    await expectStock(product._id, 3, 3);
    let productAfterCompletion = await Product.findById(product._id);
    expect(productAfterCompletion.purchaseCount).toBe(2);
    expect(await StorageHistory.countDocuments({
      productId: product._id,
      source: "online_sale",
    })).toBe(1);

    const rollbackResponses = await Promise.all([
      adminAgent.put(`/orders/update-order/${orderId}`).send({ field: "status", value: "Processing" }),
      adminAgent.put(`/orders/update-order/${orderId}`).send({ field: "status", value: "Processing" }),
    ]);

    expect(rollbackResponses.some((response) => response.status === 200)).toBe(true);
    expect(rollbackResponses.every((response) => [200, 409].includes(response.status))).toBe(true);
    await expectStock(product._id, 3, 5);
    productAfterCompletion = await Product.findById(product._id);
    expect(productAfterCompletion.purchaseCount).toBe(0);
    expect(await StorageHistory.countDocuments({
      productId: product._id,
      source: "online_sale_revert",
    })).toBe(1);
  });

  it("restores reserved stock only once when cancellation is submitted concurrently", async () => {
    const product = await createProduct({ quantityForSale: 5, quantityInStorage: 5 });
    const customerAgent = await createUserAndAgent({
      phone: CUSTOMER_PHONE,
      role: "customer",
    });
    const createResponse = await placeOrder(customerAgent, product, 2);
    const orderId = createResponse.body.order._id;
    await expectStock(product._id, 3, 5);

    const responses = await Promise.all([
      customerAgent.put(`/orders/${orderId}`).send({ state: "Cancelled" }),
      customerAgent.put(`/orders/${orderId}`).send({ state: "Cancelled" }),
    ]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.every((response) => [200, 400, 409].includes(response.status))).toBe(true);
    await expectStock(product._id, 5, 5);
    const cancelledOrder = await Order.findById(orderId);
    expect(cancelledOrder.state).toBe("Cancelled");
  });

  it("does not lose purchaseCount when a manual increment races order completion", async () => {
    const product = await createProduct({ quantityForSale: 5, quantityInStorage: 5 });
    const customerAgent = await createUserAndAgent({
      phone: CUSTOMER_PHONE,
      role: "customer",
    });
    const adminAgent = await createUserAndAgent({ phone: ADMIN_PHONE, role: "admin" });
    const createResponse = await placeOrder(customerAgent, product, 1);
    const orderId = createResponse.body.order._id;

    const [completionResponse, manualResponse] = await Promise.all([
      adminAgent
        .put(`/orders/update-order/${orderId}`)
        .send({ field: "status", value: "Completed" }),
      adminAgent
        .put(`/products/purchase/${product._id}`)
        .send({ action: "increase", amount: 1 }),
    ]);

    expect(completionResponse.status).toBe(200);
    expect(manualResponse.status).toBe(200);
    await expectStock(product._id, 4, 4);
    const persistedProduct = await Product.findById(product._id);
    expect(persistedProduct.purchaseCount).toBe(2);
    expect(await StorageHistory.countDocuments({
      productId: product._id,
      source: "online_sale",
    })).toBe(1);
  });
});
