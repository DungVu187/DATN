const fs = require("fs");
const path = require("path");

jest.mock("../models/user", () => ({
  User: {
    findById: jest.fn(),
  },
}));

const { User } = require("../models/user");
const {
  createOrderTemplate,
  deleteOrderTemplate,
  getOrderTemplates,
  updateOrderTemplateDisplayName,
  updateOrderTemplateProducts,
} = require("../controllers/userOrderTemplates");

function createResponse() {
  const response = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response;
}

function createUser(orderTemplate = []) {
  return {
    orderTemplate,
    save: jest.fn().mockResolvedValue(undefined),
  };
}

describe("user order template extraction", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("keeps the authenticated route facade thin", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "components", "user.js"),
      "utf8"
    );

    expect(source).toContain('require("../controllers/userOrderTemplates")');
    expect(source).toContain('router.put("/order-template/:index/display-name", authenticateUser, updateOrderTemplateDisplayName);');
    expect(source).toContain('router.put("/order-template/:index/products", authenticateUser, updateOrderTemplateProducts);');
    expect(source).toContain('router.get("/order-templates", authenticateUser, getOrderTemplates);');
    expect(source).toContain('router.post("/order-templates", authenticateUser, createOrderTemplate);');
    expect(source).toContain('router.delete("/order-template/:index", authenticateUser, deleteOrderTemplate);');
  });

  it("preserves display-name validation and string index coercion", async () => {
    const response = createResponse();

    await updateOrderTemplateDisplayName(
      { params: { index: "0" }, body: {}, user: { userId: "user-1" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ message: "Display name is required" });
    expect(User.findById).not.toHaveBeenCalled();

    const user = createUser([{ displayName: "Old", products: [] }]);
    User.findById.mockResolvedValue(user);
    response.status.mockClear();
    response.json.mockClear();

    await updateOrderTemplateDisplayName(
      {
        params: { index: "0" },
        body: { displayName: "New", note: "Ghi chú mẫu" },
        user: { userId: "user-1" },
      },
      response
    );

    expect(user.orderTemplate[0].displayName).toBe("New");
    expect(user.orderTemplate[0].note).toBe("Ghi chú mẫu");
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledWith({
      message: "Display name updated successfully",
      orderTemplate: user.orderTemplate[0],
    });
  });

  it("keeps out-of-range templates as 404", async () => {
    const user = createUser([]);
    User.findById.mockResolvedValue(user);
    const response = createResponse();

    await deleteOrderTemplate(
      { params: { index: "0" }, user: { userId: "user-1" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      message: "Order template index out of range",
    });
    expect(user.save).not.toHaveBeenCalled();
  });

  it("keeps product array validation and quantity fallback", async () => {
    const response = createResponse();

    await updateOrderTemplateProducts(
      {
        params: { index: "0" },
        body: { products: "invalid" },
        user: { userId: "user-1" },
      },
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ message: "Products must be an array" });

    const user = createUser([{ displayName: "Template", products: [] }]);
    User.findById.mockResolvedValue(user);
    response.status.mockClear();
    response.json.mockClear();

    await updateOrderTemplateProducts(
      {
        params: { index: "0" },
        body: {
          products: [
            { productId: "product-1", quantity: 0, ignored: true },
            { productId: "product-2", quantity: 3 },
          ],
        },
        user: { userId: "user-1" },
      },
      response
    );

    expect(user.orderTemplate[0].products).toEqual([
      { productId: "product-1", quantity: 1 },
      { productId: "product-2", quantity: 3 },
    ]);
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  it("lists only the embedded order templates", async () => {
    const orderTemplate = [{ displayName: "Template", products: [] }];
    const select = jest.fn().mockResolvedValue({ orderTemplate });
    User.findById.mockReturnValue({ select });
    const response = createResponse();

    await getOrderTemplates({ user: { userId: "user-1" } }, response);

    expect(User.findById).toHaveBeenCalledWith("user-1");
    expect(select).toHaveBeenCalledWith("orderTemplate");
    expect(response.json).toHaveBeenCalledWith({ orderTemplates: orderTemplate });
  });

  it("creates a template with the existing default and response shape", async () => {
    const user = createUser([]);
    User.findById.mockResolvedValue(user);
    const response = createResponse();

    await createOrderTemplate(
      {
        body: { displayName: "Template", note: "Ghi chú mẫu" },
        user: { userId: "user-1" },
      },
      response
    );

    expect(user.orderTemplate).toEqual([
      { displayName: "Template", note: "Ghi chú mẫu", products: [] },
    ]);
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      index: 0,
      orderTemplate: user.orderTemplate[0],
    });
  });

  it("deletes by the existing coerced index and keeps generic failures", async () => {
    const user = createUser([
      { displayName: "First" },
      { displayName: "Second" },
    ]);
    User.findById.mockResolvedValueOnce(user).mockRejectedValueOnce(new Error("db failed"));
    const response = createResponse();

    await deleteOrderTemplate(
      { params: { index: "1" }, user: { userId: "user-1" } },
      response
    );

    expect(user.orderTemplate).toEqual([{ displayName: "First" }]);
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledWith({
      message: "Order template deleted successfully",
    });

    response.status.mockClear();
    response.json.mockClear();
    await deleteOrderTemplate(
      { params: { index: "0" }, user: { userId: "user-1" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ message: "Lỗi server" });
  });
});
