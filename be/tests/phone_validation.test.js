const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../index");
const {
  User,
  canonicalizePhone,
  isValidVietnamPhone,
} = require("../components/user");

const INVALID_PHONE_MESSAGE = "Số điện thoại không hợp lệ. Vui lòng nhập số điện thoại Việt Nam gồm 10-11 chữ số, bắt đầu bằng 0.";

beforeAll(async () => {
  await mongoose.connect("mongodb://localhost:27017/EcomTest");
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(() => {
  process.env.PUBLIC_SIGNUP_ENABLED = "true";
});

afterEach(async () => {
  await User.deleteMany({});
  process.env.PUBLIC_SIGNUP_ENABLED = "false";
});

describe("Vietnam phone helpers", () => {
  test.each([
    ["0912345678", "0912345678"],
    ["0912 345 678", "0912345678"],
    ["0912.345-678", "0912345678"],
    ["(0912) 345 678", "0912345678"],
    ["+84912345678", "0912345678"],
    ["84912345678", "0912345678"],
  ])("canonicalizePhone(%p) returns %p", (raw, expected) => {
    expect(canonicalizePhone(raw)).toBe(expected);
  });

  it("rejects non-string and regex-like values", () => {
    expect(canonicalizePhone({ $ne: null })).toBeNull();
    expect(isValidVietnamPhone(".*")).toBe(false);
    expect(isValidVietnamPhone("abc")).toBe(false);
  });
});

describe("Phone validation and canonicalization APIs", () => {
  test.each([".*", "abc", "", "123", "84123"])(
    "register rejects invalid phone %p without creating a user",
    async (phone) => {
      const response = await request(app)
        .post("/users/register")
        .send({
          phone,
          password: "password123",
          name: "Invalid Phone User",
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: INVALID_PHONE_MESSAGE });
      expect(await User.countDocuments({})).toBe(0);
    }
  );

  it("registers and stores a valid local phone unchanged", async () => {
    const response = await request(app)
      .post("/users/register")
      .send({
        phone: "0912345678",
        password: "password123",
        name: "Local Phone User",
      });

    expect(response.status).toBe(201);
    const user = await User.findOne({ phone: "0912345678" });
    expect(user).not.toBeNull();
    expect(user.phone).toBe("0912345678");
  });

  test.each(["+84912345678", "0912 345 678"])(
    "registers %p and stores its canonical form",
    async (phone) => {
      const response = await request(app)
        .post("/users/register")
        .send({
          phone,
          password: "password123",
          name: "Canonical Phone User",
        });

      expect(response.status).toBe(201);
      const user = await User.findOne({ phone: "0912345678" });
      expect(user).not.toBeNull();
      expect(user.phone).toBe("0912345678");
    }
  );

  it("treats international and spaced variants as the same phone", async () => {
    const firstResponse = await request(app)
      .post("/users/register")
      .send({
        phone: "+84912345678",
        password: "password123",
        name: "First Canonical User",
      });

    const duplicateResponse = await request(app)
      .post("/users/register")
      .send({
        phone: "0912 345 678",
        password: "password123",
        name: "Duplicate Canonical User",
      });

    expect(firstResponse.status).toBe(201);
    expect(duplicateResponse.status).toBe(400);
    expect(duplicateResponse.body.message).toBe("Email hoặc số điện thoại đã tồn tại");
    expect(await User.countDocuments({ phone: "0912345678" })).toBe(1);
  });

  it("logs in with a spaced phone after registration", async () => {
    const registerResponse = await request(app)
      .post("/users/register")
      .send({
        phone: "0912345678",
        password: "password123",
        name: "Login Phone User",
      });

    const loginResponse = await request(app)
      .post("/users/login")
      .send({
        phone: "0912 345 678",
        password: "password123",
      });

    expect(registerResponse.status).toBe(201);
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.message).toBe("Đăng nhập thành công");
    expect(loginResponse.headers["set-cookie"][0]).toContain("authToken=");
  });

  it("rejects an invalid phone at the schema layer", async () => {
    const user = new User({
      phone: ".*",
      password: "password123",
      role: "customer",
    });

    await expect(user.save()).rejects.toMatchObject({ name: "ValidationError" });
    expect(await User.countDocuments({})).toBe(0);
  });
});
