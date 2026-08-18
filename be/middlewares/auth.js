const jwt = require("jsonwebtoken");
const { User } = require("../models/user");
const { getAdminFixedPermissions } = require("../config/permissions");

const ADMIN_FULL_ACCESS = true; // B6 sẽ lật thành false khi hoàn tất đổi tên quyền + backfill quyền admin.

const getCookieOptions = (req, maxAge = 43200000) => {
  // req.secure đúng nhờ trust proxy=1 + Nginx X-Forwarded-Proto khi chạy HTTPS;
  // LAN/HTTP thì false. FE/BE cùng miền nên sameSite 'lax' là đủ và an toàn.
  const host = req.hostname || req.get("host")?.split(":")[0] || "";
  const isLocalHttp =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("192.168.");
  const secureCookie = req.secure && !isLocalHttp;
  return {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    ...(maxAge ? { maxAge } : {}),
  };
};

function hasPermission(user, requiredPermission) {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  if (user.role === "admin") {
    if (ADMIN_FULL_ACCESS) return true;
    if (getAdminFixedPermissions().includes(requiredPermission)) return true;
    return Array.isArray(user.permissions) && user.permissions.includes(requiredPermission);
  }
  return Array.isArray(user.permissions) && user.permissions.includes(requiredPermission);
}

const isTokenIssuedBeforePasswordChange = (decoded, user) => {
  if (!decoded?.iat || !user?.passwordChangedAt) return false;
  return decoded.iat * 1000 < user.passwordChangedAt.getTime();
};

const rejectExpiredPasswordSession = (res, decoded, user) => {
  if (isTokenIssuedBeforePasswordChange(decoded, user)) {
    res.status(401).json({ message: "Phiên đã hết hạn, vui lòng đăng nhập lại" });
    return true;
  }
  return false;
};

// Middleware xác thực admin (đọc token từ cookie)
const authenticateAdmin = async (req, res, next) => {
  const token = req.cookies.authToken;
  if (!token) {
    return res.status(401).json({ message: "Access denied, no token provided" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.role === "customer") {
      return res.status(403).json({ message: "Access denied, not an admin or staff" });
    }
    if (rejectExpiredPasswordSession(res, decoded, user)) return;
    req.user = user;
    next();
  } catch (error) {
    console.error("Error in authenticateAdmin:", error.message);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

const authenticateAdminOnly = async (req, res, next) => {
  const token = req.cookies.authToken;
  if (!token) {
    return res.status(401).json({ message: "Access denied, no token provided" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return res.status(403).json({ message: "Access denied, admin only" });
    }
    if (rejectExpiredPasswordSession(res, decoded, user)) return;
    req.user = user;
    next();
  } catch (error) {
    console.error("Error in authenticateAdminOnly:", error.message);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Middleware xác thực user (đọc token từ cookie, tra DB để xác thực còn tồn tại + lấy role tươi)
const authenticateUser = async (req, res, next) => {
  const token = req.cookies.authToken;
  if (!token) {
    return res.status(401).json({ message: "Access denied, no token provided" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "Tài khoản không tồn tại hoặc đã bị xóa" });
    }
    if (rejectExpiredPasswordSession(res, decoded, user)) return;
    // Giữ nguyên shape payload JWT (userId, ...) nhưng lấy giá trị tươi từ DB
    req.user = {
      userId: user._id.toString(),
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      functions: user.functions || [],
      permissions: user.permissions || [],
    };
    next();
  } catch (error) {
    console.error("Error in authenticateUser:", error.message);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Middleware kiểm tra quyền (đọc token từ cookie)
const checkPermission = (requiredPermission) => async (req, res, next) => {
  const token = req.cookies.authToken;
  if (!token) {
    return res.status(401).json({ message: "Access denied, no token provided" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(403).json({ message: "User not found" });
    }
    if (rejectExpiredPasswordSession(res, decoded, user)) return;
    if (!hasPermission(user, requiredPermission)) {
      return res.status(403).json({ message: "Access denied, missing permission: " + requiredPermission });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error("Error in checkPermission:", error.message);
    if (error.name === "JsonWebTokenError" && error.message === "jwt malformed") {
      return res.status(400).json({ message: "Token JWT không hợp lệ hoặc sai định dạng" });
    }
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

const checkAnyPermission = (requiredPermissions = []) => async (req, res, next) => {
  const token = req.cookies.authToken;
  if (!token) {
    return res.status(401).json({ message: "Access denied, no token provided" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(403).json({ message: "User not found" });
    }
    if (rejectExpiredPasswordSession(res, decoded, user)) return;

    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    const allowed = permissions.some((permission) => hasPermission(user, permission));

    if (!allowed) {
      return res.status(403).json({
        message: "Access denied, missing one of permissions: " + permissions.join(", "),
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Error in checkAnyPermission:", error.message);
    if (error.name === "JsonWebTokenError" && error.message === "jwt malformed") {
      return res.status(400).json({ message: "Token JWT không hợp lệ hoặc sai định dạng" });
    }
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = {
  authenticateAdmin,
  authenticateAdminOnly,
  authenticateUser,
  checkPermission,
  checkAnyPermission,
  hasPermission,
  getCookieOptions,
};
