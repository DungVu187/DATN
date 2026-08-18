const fs = require("fs");
const path = require("path");

const userAdministration = require("../controllers/userAdministration");

const expectedHandlers = [
  "deleteManagedUser",
  "getAllUsers",
  "getCustomers",
  "getPermissionCatalog",
  "updateManagedUser",
  "updateUserPermissions",
];

const expectedRoutes = [
  'router.get("/permission-catalog", authenticateAdminOnly, getPermissionCatalog);',
  'router.get("/all-users", authenticateAdminOnly, getAllUsers);',
  'router.put("/:id/permissions", authenticateAdmin, updateUserPermissions);',
  'router.get("/customers", authenticateAdmin, checkPermission("customer.view"), getCustomers);',
  'router.delete("/:id", authenticateAdmin, checkPermission("customer.delete"), deleteManagedUser);',
  'router.put("/:id", authenticateAdmin, checkPermission("customer.edit"), updateManagedUser);',
];

describe("user administration extraction boundary", () => {
  it("exports one cohesive handler package", () => {
    expect(Object.keys(userAdministration).sort()).toEqual(expectedHandlers);
    for (const handlerName of expectedHandlers) {
      expect(userAdministration[handlerName]).toEqual(expect.any(Function));
    }
  });

  it("keeps authentication and permission middleware in the route facade", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "components", "user.js"),
      "utf8"
    );

    expect(source).toContain('require("../controllers/userAdministration")');
    for (const route of expectedRoutes) {
      expect(source).toContain(route);
    }
  });
});
