const {
  User,
  canonicalizePhone,
  isValidVietnamPhone,
} = require("../models/user");
const { ActivityLog } = require("../models/activitylog");
const {
  getAdminFixedPermissions,
  getCatalogForClient,
} = require("../config/permissions");
const { sanitizeUserForResponse } = require("../services/userProfile");
const { validatePasswordPolicy } = require("../services/userPasswords");
const {
  VALID_ROLES,
  getVisibleRolesFor,
  validateGrantablePermissions,
} = require("../services/userRolePolicy");

const hasNonStringField = (source, fields) => {
  return fields.some((field) => (
    source[field] !== undefined &&
    source[field] !== null &&
    typeof source[field] !== "string"
  ));
};

const rejectInvalidStringFields = (res, source, fields) => {
  if (hasNonStringField(source, fields)) {
    res.status(400).json({ message: "Thông tin tìm kiếm không hợp lệ" });
    return true;
  }
  return false;
};

const INVALID_PHONE_MESSAGE = "Số điện thoại không hợp lệ. Vui lòng nhập số điện thoại Việt Nam gồm 10-11 chữ số, bắt đầu bằng 0.";

function getPermissionCatalog(req, res) {
  try {
    res.json({
      success: true,
      catalog: getCatalogForClient(),
      adminFixed: getAdminFixedPermissions(),
    });
  } catch (error) {
    console.error("Error in get permission-catalog:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

async function getAllUsers(req, res) {
  try {
    const visibleRoles = getVisibleRolesFor(req.user?.role);
    const users = await User.find({ role: { $in: visibleRoles } }).select("-password -resetOtp -resetOtpExpires");
    res.json(users.map(sanitizeUserForResponse));
  } catch (error) {
    console.error("Error in get users:", error.message);
    res.status(500).json({ message: "Lỗi server" });
  }
}

async function updateUserPermissions(req, res) {
  try {
    const { id } = req.params;
    const { role, permissions, name, email, phone, password } = req.body;

    if (req.user.role !== "superadmin" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Bạn không có quyền thực hiện chức năng này" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    if (req.user.role === "admin") {
      if (user.role === "superadmin" || user.role === "admin") {
        return res.status(403).json({ message: "Admin không có quyền chỉnh sửa tài khoản Admin hoặc Super Admin khác" });
      }
      if (role && (role === "superadmin" || role === "admin")) {
        return res.status(403).json({ message: "Admin không có quyền chỉ định vai trò Admin hoặc Super Admin" });
      }
    }

    if (role === "superadmin") {
      const existingSuperadmin = await User.findOne({ role: "superadmin" });
      if (existingSuperadmin && existingSuperadmin._id.toString() !== id) {
        return res.status(400).json({ message: "Hệ thống chỉ được phép có duy nhất 1 tài khoản Super Admin" });
      }
    }

    // Validate quyền TRƯỚC khi thay đổi document; role mới quyết định nhóm quyền hợp lệ.
    const finalRole = role || user.role;
    if (!VALID_ROLES.includes(finalRole)) {
      return res.status(400).json({ message: "Vai trò không hợp lệ" });
    }
    let validatedPermissions = null; // null = không đụng permissions hiện tại
    if (finalRole === "admin" || finalRole === "staff") {
      if (permissions !== undefined) {
        const result = validateGrantablePermissions(permissions);
        if (!result.valid) {
          return res.status(400).json({ message: result.message });
        }
        validatedPermissions = result.permissions;
      } else if (role) {
        // Đổi sang admin/staff mà không gửi permissions -> đặt rỗng.
        validatedPermissions = [];
      }
    } else {
      // customer/superadmin: luôn xóa sạch quyền.
      validatedPermissions = [];
    }

    // Lưu thông tin cũ để so sánh
    const oldUserData = {
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      functions: [...(user.functions || [])],
      permissions: [...(user.permissions || [])]
    };

    let canonicalPhone;
    if (phone !== undefined) {
      canonicalPhone = canonicalizePhone(phone);
      if (!isValidVietnamPhone(phone)) {
        return res.status(400).json({ message: INVALID_PHONE_MESSAGE });
      }
    }

    // Kiểm tra trùng lặp Số điện thoại (nếu thay đổi)
    if (canonicalPhone && canonicalPhone !== user.phone) {
      const phoneExists = await User.findOne({ phone: canonicalPhone });
      if (phoneExists) {
        return res.status(400).json({ message: "Số điện thoại đã tồn tại ở tài khoản khác" });
      }
      user.phone = canonicalPhone;
    }

    // Kiểm tra trùng lặp Email (nếu thay đổi và không rỗng)
    if (email && email.trim() !== "") {
      const emailLower = email.toLowerCase();
      if (!user.email || emailLower !== user.email.toLowerCase()) {
        const emailExists = await User.findOne({ email: emailLower });
        if (emailExists) {
          return res.status(400).json({ message: "Email đã tồn tại ở tài khoản khác" });
        }
      }
      user.email = emailLower;
    } else if (email === "") {
      user.email = undefined;
    }

    if (name !== undefined) {
      user.name = name;
    }

    if (password) {
      const passwordValidation = validatePasswordPolicy(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.message });
      }
      user.password = password; // Sẽ được mã hóa tự động bằng pre-save hook của userSchema
      user.passwordChangedAt = new Date();
    }

    if (role) {
      user.role = finalRole;
    }
    if (validatedPermissions !== null) {
      user.permissions = validatedPermissions;
    }
    if (role || permissions !== undefined) {
      user.functions = [];
    }

    await user.save();

    // Ghi log hoạt động
    try {
      const details = [];
      if (oldUserData.name !== user.name) {
        details.push({ field: "name", oldValue: oldUserData.name || "", newValue: user.name || "" });
      }
      if (oldUserData.email !== user.email) {
        details.push({ field: "email", oldValue: oldUserData.email || "", newValue: user.email || "" });
      }
      if (oldUserData.phone !== user.phone) {
        details.push({ field: "phone", oldValue: oldUserData.phone || "", newValue: user.phone || "" });
      }
      if (oldUserData.role !== user.role) {
        details.push({ field: "role", oldValue: oldUserData.role || "", newValue: user.role || "" });
      }
      if (JSON.stringify(oldUserData.functions) !== JSON.stringify(user.functions)) {
        details.push({ field: "functions", oldValue: oldUserData.functions.join(", "), newValue: user.functions.join(", ") });
      }
      if (JSON.stringify(oldUserData.permissions) !== JSON.stringify(user.permissions)) {
        details.push({ field: "permissions", oldValue: oldUserData.permissions.join(", "), newValue: user.permissions.join(", ") });
      }

      if (details.length > 0) {
        await new ActivityLog({
          userName: req.user.name,
          action: "update_user_permissions",
          productName: user.name || user.phone,
          details
        }).save();
      }
    } catch (logErr) { console.error("ActivityLog error in permissions:", logErr.message); }

    res.json({ message: "Cập nhật tài khoản thành công", user: sanitizeUserForResponse(user) });
  } catch (error) {
    res.status(500).json({ error: "Lỗi server" });
  }
}

async function getCustomers(req, res) {
  try {
    const customers = await User.find({ role: "customer" }).select("-password -resetOtp -resetOtpExpires");
    res.json(customers.map(sanitizeUserForResponse));
  } catch (error) {
    res.status(500).json({ message: "Không thể lấy danh sách khách hàng" });
  }
}

async function deleteManagedUser(req, res) {
  try {
    const { id } = req.params;

    if (req.user.role !== "superadmin" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Bạn không có quyền thực hiện chức năng này" });
    }

    const userToDelete = await User.findById(id);
    if (!userToDelete) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    if (["superadmin", "admin", "staff"].includes(userToDelete.role) && req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Chi Super Admin duoc xoa tai khoan Admin hoac Nhan vien" });
    }

    if (req.user.role === "admin") {
      if (userToDelete.role === "superadmin" || userToDelete.role === "admin") {
        return res.status(403).json({ message: "Admin không có quyền xóa tài khoản Admin hoặc Super Admin" });
      }
    }

    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    // Ghi log hoạt động
    try {
      await new ActivityLog({
        userName: req.user.name,
        action: "delete_user",
        productName: deletedUser.name || deletedUser.phone,
        details: [{ field: "Xóa tài khoản", oldValue: `${deletedUser.name || ""}, SĐT: ${deletedUser.phone}, Vai trò: ${deletedUser.role}`, newValue: "" }]
      }).save();
    } catch (logErr) { console.error("ActivityLog error in delete_user:", logErr.message); }

    res.json({ message: "Xóa người dùng thành công" });
  } catch (error) {
    console.error("Lỗi khi xóa người dùng:", error.message);
    res.status(500).json({ message: "Lỗi server" });
  }
}

async function updateManagedUser(req, res) {
  try {
    const { id } = req.params;
    const { name, email, phone } = req.body;

    if (req.user.role !== "superadmin" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Bạn không có quyền thực hiện chức năng này" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng" });

    if (req.user.role === "admin") {
      if (user.role === "superadmin" || user.role === "admin") {
        return res.status(403).json({ message: "Admin không có quyền cập nhật tài khoản Admin hoặc Super Admin khác" });
      }
    }

    const oldUserData = { name: user.name, email: user.email, phone: user.phone };

    let canonicalPhone;
    if (phone !== undefined) {
      canonicalPhone = canonicalizePhone(phone);
      if (!isValidVietnamPhone(phone)) {
        return res.status(400).json({ message: INVALID_PHONE_MESSAGE });
      }

      if (canonicalPhone !== user.phone) {
        const phoneExists = await User.findOne({ phone: canonicalPhone });
        if (phoneExists) {
          return res.status(400).json({ message: "Số điện thoại đã tồn tại ở tài khoản khác" });
        }
      }
    }

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (canonicalPhone !== undefined) user.phone = canonicalPhone;

    await user.save();

    // Ghi log hoạt động
    try {
      const details = [];
      if (oldUserData.name !== user.name) details.push({ field: "name", oldValue: oldUserData.name || "", newValue: user.name || "" });
      if (oldUserData.email !== user.email) details.push({ field: "email", oldValue: oldUserData.email || "", newValue: user.email || "" });
      if (oldUserData.phone !== user.phone) details.push({ field: "phone", oldValue: oldUserData.phone || "", newValue: user.phone || "" });
      if (details.length > 0) {
        await new ActivityLog({
          userName: req.user.name,
          action: "update_user",
          productName: user.name || user.phone,
          details
        }).save();
      }
    } catch (logErr) { console.error("ActivityLog error in update_user:", logErr.message); }

    res.json({ message: "Cập nhật thông tin người dùng thành công", user: sanitizeUserForResponse(user) });
  } catch (error) {
    console.error("Lỗi khi cập nhật thông tin người dùng:", error.message);
    res.status(500).json({ message: "Lỗi server" });
  }
}


module.exports = {
  getPermissionCatalog,
  getAllUsers,
  updateUserPermissions,
  getCustomers,
  deleteManagedUser,
  updateManagedUser,
};
