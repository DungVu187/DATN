const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../index");
const { User } = require("../components/user");
const { ActivityLog } = require("../components/activitylog");

beforeAll(async () => {
  await mongoose.connect("mongodb://localhost:27017/EcomTest");
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await User.deleteMany({});
  await ActivityLog.deleteMany({});
});

const createUser = async ({ phone, role, permissions = [], functions = [] }) => {
  const user = new User({
    phone,
    password: "password123",
    name: `${role} ${phone}`,
    role,
    permissions,
    functions,
  });
  await user.save();
  return user;
};

const loginAgent = async (phone) => {
  const agent = request.agent(app);
  await agent
    .post("/users/login")
    .send({ phone, password: "password123" })
    .expect(200);
  return agent;
};

const createSuperadminAgent = async () => {
  await createUser({ phone: "0940000001", role: "superadmin" });
  return loginAgent("0940000001");
};

describe("Permission validation", () => {
  it("creates staff with normalized grantable permissions and no functions", async () => {
    const superadminAgent = await createSuperadminAgent();

    const response = await superadminAgent
      .post("/users/admin-create")
      .send({
        phone: "0940000002",
        password: "password123",
        role: "staff",
        permissions: ["order.edit", "order.excel", "activitylog.view", "order.edit"],
      })
      .expect(201);

    expect(response.body.user.permissions).toEqual(["order.edit", "order.excel", "activitylog.view"]);
    expect(response.body.user.functions).toEqual([]);
  });

  it("rejects staff permissions with a missing dependency", async () => {
    const superadminAgent = await createSuperadminAgent();

    const response = await superadminAgent
      .post("/users/admin-create")
      .send({
        phone: "0940000003",
        password: "password123",
        role: "staff",
        permissions: ["order.excel"],
      })
      .expect(400);

    expect(response.body.message).toContain("order.edit");
    expect(await User.findOne({ phone: "0940000003" })).toBeNull();
  });

  it("rejects legacy and admin-fixed permissions", async () => {
    const superadminAgent = await createSuperadminAgent();

    for (const [phone, permissions] of [
      ["0940000004", ["read_order"]],
      ["0940000005", ["account.manage"]],
    ]) {
      const response = await superadminAgent
        .post("/users/admin-create")
        .send({
          phone,
          password: "password123",
          role: "staff",
          permissions,
        })
        .expect(400);

      expect(response.body.message).toContain(permissions[0]);
      expect(await User.findOne({ phone })).toBeNull();
    }
  });

  it("forces customers created by staff to have no permissions or functions", async () => {
    await createUser({
      phone: "0940000006",
      role: "staff",
      permissions: ["customer.create"],
    });
    const staffAgent = await loginAgent("0940000006");

    const response = await staffAgent
      .post("/users/admin-create")
      .send({
        phone: "0940000007",
        password: "password123",
        role: "customer",
        permissions: ["product.delete"],
      })
      .expect(201);

    expect(response.body.user.role).toBe("customer");
    expect(response.body.user.permissions).toEqual([]);
    expect(response.body.user.functions).toEqual([]);
  });

  it("updates staff permissions without retaining functions", async () => {
    const superadminAgent = await createSuperadminAgent();
    const staff = await createUser({
      phone: "0940000008",
      role: "staff",
      permissions: ["product.view"],
      functions: ["product_management"],
    });

    const response = await superadminAgent
      .put(`/users/${staff._id}/permissions`)
      .send({ permissions: ["product.edit"] })
      .expect(200);

    expect(response.body.user.permissions).toEqual(["product.edit"]);
    expect(response.body.user.functions).toEqual([]);
  });

  it("rejects invalid updates without changing stored permissions", async () => {
    const superadminAgent = await createSuperadminAgent();
    const staff = await createUser({
      phone: "0940000009",
      role: "staff",
      permissions: ["product.view"],
    });

    await superadminAgent
      .put(`/users/${staff._id}/permissions`)
      .send({ permissions: ["update_product"] })
      .expect(400);

    const unchanged = await User.findById(staff._id);
    expect(unchanged.permissions).toEqual(["product.view"]);
  });

  it("rejects scan AI updates without the matching edit permission", async () => {
    const superadminAgent = await createSuperadminAgent();
    const staff = await createUser({
      phone: "0940000010",
      role: "staff",
      permissions: ["iporder.view"],
    });

    const response = await superadminAgent
      .put(`/users/${staff._id}/permissions`)
      .send({ permissions: ["iporder.scan_ai"] })
      .expect(400);

    expect(response.body.message).toContain("iporder.edit");
    const unchanged = await User.findById(staff._id);
    expect(unchanged.permissions).toEqual(["iporder.view"]);
  });

  it("keeps customer updates backward compatible and clears permissions on role change", async () => {
    const superadminAgent = await createSuperadminAgent();
    const customer = await createUser({
      phone: "0940000011",
      role: "customer",
    });
    const staff = await createUser({
      phone: "0940000012",
      role: "staff",
      permissions: ["product.edit"],
      functions: ["product_management"],
    });

    await superadminAgent
      .put(`/users/${customer._id}/permissions`)
      .send({ name: "Khách đã cập nhật" })
      .expect(200);

    const updatedCustomer = await User.findById(customer._id);
    expect(updatedCustomer.name).toBe("Khách đã cập nhật");
    expect(updatedCustomer.permissions).toEqual([]);

    const response = await superadminAgent
      .put(`/users/${staff._id}/permissions`)
      .send({ role: "customer" })
      .expect(200);

    expect(response.body.user.role).toBe("customer");
    expect(response.body.user.permissions).toEqual([]);
    expect(response.body.user.functions).toEqual([]);
  });
});
