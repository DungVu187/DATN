const { User } = require("../models/user");

const PRIVILEGED_PRODUCT_ROLES = new Set(["superadmin", "admin", "staff"]);

class ProductAccessError extends Error {
  constructor(message, statusCode = 403) {
    super(message);
    this.name = "ProductAccessError";
    this.statusCode = statusCode;
  }
}

const loadProductViewer = async (userId) => {
  if (!userId) return null;

  const user = await User.findById(userId).select("role").lean();
  if (!user) {
    throw new ProductAccessError("Phiên đăng nhập không còn hợp lệ.", 401);
  }
  return user;
};

const buildProductVisibilityFilter = async (user) => {
  const filter = {};
  const isPrivileged = PRIVILEGED_PRODUCT_ROLES.has(user?.role);

  if (!isPrivileged) {
    filter.display = true;
  }

  return { filter };
};

const combineProductFilters = (...filters) => {
  const activeFilters = filters.filter(
    (filter) => filter && typeof filter === "object" && Object.keys(filter).length > 0
  );

  if (activeFilters.length === 0) return {};
  if (activeFilters.length === 1) return activeFilters[0];
  return { $and: activeFilters };
};

module.exports = {
  ProductAccessError,
  buildProductVisibilityFilter,
  combineProductFilters,
  loadProductViewer,
};
