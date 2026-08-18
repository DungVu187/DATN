const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../index");
const { User } = require("../components/user");
const { Order } = require("../components/order");

const PHONE_A = "0900000001";
const PHONE_B = "0900000002";
const REGEX_ATTACKER_PHONE = ".*";
const PREFIX_ATTACKER_PHONE = "09000000";
const REGEX_ATTACKER_INITIAL_PHONE = "0900000098";
const PREFIX_ATTACKER_INITIAL_PHONE = "0900000099";

const createUser = async (phone, name) => {
  const user = new User({
    phone,
    password: "password123",
    name,
    role: "customer",
  });
  await user.save();
  return user;
};

const createOrder = ({ orderCode, userPhone, state = "Processing", status = "Processing" }) => {
  return Order.create({
    orderCode,
    userPhone,
    userName: `Customer ${userPhone}`,
    cartItems: [{
      productId: "idor-test-product",
      variantIndex: 0,
      quantity: 1,
    }],
    total: 100000,
    state,
    status,
  });
};

const loginAgent = async (phone) => {
  const agent = request.agent(app);
  const response = await agent
    .post("/users/login")
    .send({ phone, password: "password123" });

  expect(response.status).toBe(200);
  expect(response.headers["set-cookie"]).toBeDefined();
  return agent;
};

const loginAgentThenSetUnsafePhone = async (initialPhone, unsafePhone) => {
  const agent = await loginAgent(initialPhone);
  const user = await User.findOne({ phone: initialPhone });
  await User.collection.updateOne(
    { _id: user._id },
    { $set: { phone: unsafePhone } }
  );
  return agent;
};

beforeAll(async () => {
  await mongoose.connect("mongodb://localhost:27017/EcomTest");
});

afterAll(async () => {
  await User.deleteMany({});
  await Order.deleteMany({});
  await mongoose.disconnect();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Order.deleteMany({});

  await createUser(PHONE_A, "Customer A");
  await createUser(PHONE_B, "Customer B");
  await createUser(REGEX_ATTACKER_INITIAL_PHONE, "Regex Attacker");
  await createUser(PREFIX_ATTACKER_INITIAL_PHONE, "Prefix Attacker");

  await Promise.all([
    createOrder({ orderCode: "IDOR-A-PROCESSING", userPhone: PHONE_A }),
    createOrder({
      orderCode: "IDOR-A-CANCELLED",
      userPhone: PHONE_A,
      state: "Cancelled",
    }),
    createOrder({
      orderCode: "IDOR-A-DELIVERING",
      userPhone: PHONE_A,
      status: "Delivering",
    }),
    createOrder({ orderCode: "IDOR-B-PROCESSING", userPhone: PHONE_B }),
  ]);
});

afterEach(async () => {
  await User.deleteMany({});
  await Order.deleteMany({});
});

describe("GET /orders/userOrders ownership isolation", () => {
  it("does not let a regex-like phone read another user's orders", async () => {
    const attackerAgent = await loginAgentThenSetUnsafePhone(
      REGEX_ATTACKER_INITIAL_PHONE,
      REGEX_ATTACKER_PHONE
    );
    const response = await attackerAgent.get("/orders/userOrders");

    expect(response.status).toBe(404);
    expect(response.body.orders).toBeUndefined();
    expect(response.body.message).toBe("Không tìm thấy đơn hàng cho số điện thoại này");
  });

  it("does not match another user's phone by prefix", async () => {
    const attackerAgent = await loginAgentThenSetUnsafePhone(
      PREFIX_ATTACKER_INITIAL_PHONE,
      PREFIX_ATTACKER_PHONE
    );
    const response = await attackerAgent.get("/orders/userOrders");

    expect(response.status).toBe(404);
    expect(response.body.orders).toBeUndefined();
    expect(response.body.message).toBe("Không tìm thấy đơn hàng cho số điện thoại này");
  });

  it("returns every order belonging to the authenticated customer only", async () => {
    const customerAgent = await loginAgent(PHONE_A);
    const response = await customerAgent.get("/orders/userOrders");

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Danh sách đơn hàng");
    expect(response.body.orders).toHaveLength(3);
    expect(response.body.orders.every((order) => order.userPhone === PHONE_A)).toBe(true);
    expect(response.body.orders.some((order) => order.userPhone === PHONE_B)).toBe(false);
  });

  it("preserves Cancelled and status filtering for the authenticated customer", async () => {
    const customerAgent = await loginAgent(PHONE_A);

    const cancelledResponse = await customerAgent
      .get("/orders/userOrders")
      .query({ state: "Cancelled" });
    expect(cancelledResponse.status).toBe(200);
    expect(cancelledResponse.body.orders).toHaveLength(1);
    expect(cancelledResponse.body.orders[0]).toMatchObject({
      orderCode: "IDOR-A-CANCELLED",
      userPhone: PHONE_A,
      state: "Cancelled",
    });

    const deliveringResponse = await customerAgent
      .get("/orders/userOrders")
      .query({ state: "Delivering" });
    expect(deliveringResponse.status).toBe(200);
    expect(deliveringResponse.body.orders).toHaveLength(1);
    expect(deliveringResponse.body.orders[0]).toMatchObject({
      orderCode: "IDOR-A-DELIVERING",
      userPhone: PHONE_A,
      state: "Processing",
      status: "Delivering",
    });
  });
});
