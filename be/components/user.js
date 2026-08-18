const express = require("express");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const {
  User,
  canonicalizePhone,
  isValidVietnamPhone,
} = require("../models/user");
const {
  authenticateAdmin,
  authenticateAdminOnly,
  authenticateUser,
  checkPermission,
  checkAnyPermission,
  hasPermission,
  getCookieOptions,
} = require("../middlewares/auth");
const {
  loginAdmin,
  loginUser,
  logoutUser,
} = require("../controllers/userSessions");
const {
  addAddress,
  deleteAddress,
  getProfile,
  setDefaultAddress,
  updateAddress,
  updateProfile,
} = require("../controllers/userProfile");
const {
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/userPasswords");
const {
  adminCreateUser,
  registerUser,
} = require("../controllers/userAccountCreation");
const {
  createOrderTemplate,
  deleteOrderTemplate,
  getOrderTemplates,
  updateOrderTemplateDisplayName,
  updateOrderTemplateProducts,
} = require("../controllers/userOrderTemplates");
const {
  deleteManagedUser,
  getAllUsers,
  getCustomers,
  getPermissionCatalog,
  updateManagedUser,
  updateUserPermissions,
} = require("../controllers/userAdministration");

const router = express.Router();

// Rate limiting configuration
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const max = parseInt(process.env.RATE_LIMIT_MAX) || 100;

const authLimiter = rateLimit({
  windowMs,
  max,
  message: { message: "Quá nhiều yêu cầu, vui lòng thử lại sau." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});
// Đăng ký người dùng
const allowPublicSignupOrAuthenticateAdmin = (req, res, next) => {
  if (process.env.PUBLIC_SIGNUP_ENABLED === "true") {
    next();
  } else {
    authenticateAdmin(req, res, next);
  }
};

router.post("/register", authLimiter, allowPublicSignupOrAuthenticateAdmin, registerUser);

// Đăng nhập người dùng (sử dụng cookie) - hỗ trợ đăng nhập bằng email hoặc SĐT
router.post("/login", authLimiter, loginUser);

// Đăng nhập admin/staff (sử dụng cookie)
router.post("/admin/login", authLimiter, loginAdmin);

// Đăng xuất (xóa cookie)
router.post("/logout", logoutUser);

router.put("/change-password", authLimiter, authenticateUser, changePassword);

// Yêu cầu OTP khôi phục mật khẩu qua số điện thoại hoặc email
router.post("/forgot-password", authLimiter, forgotPassword);

// Đặt lại mật khẩu mới bằng OTP
router.post("/reset-password", authLimiter, resetPassword);

router.get("/permission-catalog", authenticateAdminOnly, getPermissionCatalog);

router.get("/all-users", authenticateAdminOnly, getAllUsers);

router.get("/profile", authenticateUser, getProfile);

// Cập nhật thông tin cá nhân của người dùng hiện tại
router.put("/profile", authenticateUser, updateProfile);

// Quản lý sổ địa chỉ
router.post("/profile/addresses", authenticateUser, addAddress);
router.put("/profile/addresses/:addressId", authenticateUser, updateAddress);
router.delete("/profile/addresses/:addressId", authenticateUser, deleteAddress);
router.put("/profile/addresses/:addressId/default", authenticateUser, setDefaultAddress);


router.put("/:id/permissions", authenticateAdmin, updateUserPermissions);

// 📌 Xoay token đăng nhập tự động (chỉ dành cho Admin)

// Thêm tài khoản mới thủ công từ admin
router.post("/admin-create", authenticateAdmin, adminCreateUser);

router.put("/order-template/:index/display-name", authenticateUser, updateOrderTemplateDisplayName);
router.put("/order-template/:index/products", authenticateUser, updateOrderTemplateProducts);
router.get("/order-templates", authenticateUser, getOrderTemplates);
router.post("/order-templates", authenticateUser, createOrderTemplate);
router.delete("/order-template/:index", authenticateUser, deleteOrderTemplate);

router.get("/customers", authenticateAdmin, checkPermission("customer.view"), getCustomers);

// Xóa người dùng theo ID
router.delete("/:id", authenticateAdmin, checkPermission("customer.delete"), deleteManagedUser);

// Cập nhật thông tin người dùng (tên, email, số điện thoại)
router.put("/:id", authenticateAdmin, checkPermission("customer.edit"), updateManagedUser);


module.exports = {
  User,
  router,
  authenticateAdmin,
  authenticateAdminOnly,
  authenticateUser,
  checkPermission,
  checkAnyPermission,
  hasPermission,
  getCookieOptions,
  canonicalizePhone,
  isValidVietnamPhone,
};
