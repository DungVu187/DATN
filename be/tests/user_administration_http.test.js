const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../index");
const { User } = require("../components/user");

beforeAll(async () => {
  await mongoose.connect("mongodb://localhost:27017/EcomTest");
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await User.deleteMany({});
});

async function createUser(overrides) {
  const user = new User({
    phone: overrides.phone,
    password: "password123",
    name: overrides.name || "User Administration Test",
    role: overrides.role,
    permissions: overrides.permissions || [],
  });
  await user.save();
  return user;
}

async function loginAgent(phone) {
  const agent = request.agent(app);
  await agent
    .post("/users/login")
    .send({ phone, password: "password123" })
    .expect(200);
  return agent;
}

describe("user administration HTTP characterization", () => {
  let superadminAgent;

  beforeEach(async () => {
    await createUser({ phone: "0932000001", role: "superadmin" });
    superadminAgent = await loginAgent("0932000001");
  });

  it("updates basic user fields and canonicalizes the phone", async () => {
    const customer = await createUser({ phone: "0932000007", role: "customer" });

    const response = await superadminAgent
      .put(`/users/${customer._id}`)
      .send({
        name: "Updated Customer",
        email: "updated@example.com",
        phone: "+84 912 345 678",
      })
      .expect(200);

    expect(response.body.message).toBe("Cập nhật thông tin người dùng thành công");
    expect(response.body.user).toMatchObject({
      name: "Updated Customer",
      email: "updated@example.com",
      phone: "0912345678",
    });

    const storedCustomer = await User.findById(customer._id);
    expect(storedCustomer).toMatchObject({
      name: "Updated Customer",
      email: "updated@example.com",
      phone: "0912345678",
    });
  });
});
