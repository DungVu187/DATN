const fs = require("fs");
const path = require("path");

const authMiddleware = require("../middlewares/auth");
const userSessionController = require("../controllers/userSessions");
const userSessionService = require("../services/userSessions");
const userComponent = require("../components/user");

describe("backend authentication boundaries", () => {
  it("keeps user-component auth exports backward compatible", () => {
    expect(userComponent.authenticateAdmin).toBe(authMiddleware.authenticateAdmin);
    expect(userComponent.authenticateAdminOnly).toBe(authMiddleware.authenticateAdminOnly);
    expect(userComponent.authenticateUser).toBe(authMiddleware.authenticateUser);
    expect(userComponent.checkPermission).toBe(authMiddleware.checkPermission);
    expect(userComponent.checkAnyPermission).toBe(authMiddleware.checkAnyPermission);
    expect(userComponent.hasPermission).toBe(authMiddleware.hasPermission);
    expect(userComponent.getCookieOptions).toBe(authMiddleware.getCookieOptions);
  });

  it("prevents production routes from importing the user route as middleware", () => {
    const componentsRoot = path.join(__dirname, "..", "components");
    const componentFiles = fs.readdirSync(componentsRoot)
      .filter((fileName) => fileName.endsWith(".js") && fileName !== "user.js");

    for (const componentFile of componentFiles) {
      const source = fs.readFileSync(path.join(componentsRoot, componentFile), "utf8");
      expect(source).not.toMatch(/require\(["']\.\/user["']\)/);
    }
  });

  it("keeps authentication implementations out of the user route", () => {
    const userRouteSource = fs.readFileSync(
      path.join(__dirname, "..", "components", "user.js"),
      "utf8"
    );

    expect(userRouteSource).toContain('require("../middlewares/auth")');
    expect(userRouteSource).not.toMatch(/const authenticate(Admin|AdminOnly|User) = async/);
    expect(userRouteSource).not.toMatch(/const check(Any)?Permission =/);
  });

  it("keeps session implementations outside the user route", () => {
    const userRouteSource = fs.readFileSync(
      path.join(__dirname, "..", "components", "user.js"),
      "utf8"
    );
    const userSessionControllerSource = fs.readFileSync(
      path.join(__dirname, "..", "controllers", "userSessions.js"),
      "utf8"
    );

    expect(userRouteSource).toContain('require("../controllers/userSessions")');
    expect(userRouteSource).not.toContain('require("../services/userSessions")');
    expect(userSessionControllerSource).toContain("require('../services/userSessions')");
    expect(userRouteSource).toContain('router.post("/login", authLimiter, loginUser);');
    expect(userRouteSource).toContain('router.post("/admin/login", authLimiter, loginAdmin);');
    expect(userRouteSource).toContain('router.post("/logout", logoutUser);');
    expect(userRouteSource).not.toMatch(/jwt.sign|CryptoJS.AES.decrypt|const createSessionToken/);

    expect(userSessionController.loginUser).toEqual(expect.any(Function));
    expect(userSessionController.loginAdmin).toEqual(expect.any(Function));
    expect(userSessionController.logoutUser).toEqual(expect.any(Function));
    expect(userSessionService.createSessionToken).toEqual(expect.any(Function));
  });
});
