const {
  isGrantablePermission,
  getDependency,
} = require("../config/permissions");

const VALID_ROLES = ["superadmin", "admin", "staff", "customer"];
const ROLE_LEVELS = {
  customer: 0,
  staff: 1,
  admin: 2,
  superadmin: 3,
};

function getVisibleRolesFor(viewerRole) {
  const viewerLevel = ROLE_LEVELS[viewerRole];
  if (viewerLevel === undefined) return [];
  return VALID_ROLES.filter((role) => ROLE_LEVELS[role] <= viewerLevel);
}

function validateGrantablePermissions(permissions) {
  if (!Array.isArray(permissions)) {
    return { valid: false, message: "Danh sách quyền phải là một mảng" };
  }

  const normalizedPermissions = [];
  const seen = new Set();

  for (const permission of permissions) {
    if (typeof permission !== "string" || permission.trim() === "") {
      return { valid: false, message: "Quyền không hợp lệ hoặc không được phép cấp: giá trị rỗng" };
    }

    const normalizedPermission = permission.trim();
    if (!isGrantablePermission(normalizedPermission)) {
      return {
        valid: false,
        message: `Quyền không hợp lệ hoặc không được phép cấp: ${normalizedPermission}`,
      };
    }

    if (!seen.has(normalizedPermission)) {
      seen.add(normalizedPermission);
      normalizedPermissions.push(normalizedPermission);
    }
  }

  for (const permission of normalizedPermissions) {
    const dependency = getDependency(permission);
    if (dependency && !seen.has(dependency)) {
      return {
        valid: false,
        message: `Quyền ${permission} yêu cầu quyền ${dependency}`,
      };
    }
  }

  return { valid: true, permissions: normalizedPermissions };
}

module.exports = {
  VALID_ROLES,
  ROLE_LEVELS,
  getVisibleRolesFor,
  validateGrantablePermissions,
};
