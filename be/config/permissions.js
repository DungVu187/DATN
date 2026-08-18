const PERMISSION_CATALOG = [
  {
    key: "product",
    label: "Sản phẩm",
    group: "products",
    scope: "grantable",
    actions: [
      { key: "product.view", label: "Xem" },
      { key: "product.create", label: "Thêm" },
      { key: "product.edit", label: "Sửa" },
      { key: "product.delete", label: "Xóa" },
    ],
  },
  {
    key: "order",
    label: "Đơn bán hàng",
    group: "orders",
    scope: "grantable",
    actions: [
      { key: "order.view", label: "Xem" },
      { key: "order.create", label: "Thêm" },
      { key: "order.edit", label: "Sửa" },
      { key: "order.delete", label: "Xóa" },
      { key: "order.excel", label: "Excel (mẫu/nhập/xuất)", dependsOn: "order.edit" },
      { key: "order.scan_ai", label: "Quét hóa đơn AI", dependsOn: "order.edit" },
    ],
  },
  {
    key: "iporder",
    label: "Đơn nhập hàng",
    group: "orders",
    scope: "grantable",
    actions: [
      { key: "iporder.view", label: "Xem" },
      { key: "iporder.create", label: "Thêm" },
      { key: "iporder.edit", label: "Sửa" },
      { key: "iporder.delete", label: "Xóa" },
      { key: "iporder.excel", label: "Excel (nhập/xuất)", dependsOn: "iporder.edit" },
      { key: "iporder.scan_ai", label: "Quét hóa đơn AI", dependsOn: "iporder.edit" },
    ],
  },
  {
    key: "eporder",
    label: "Đơn xuất hàng",
    group: "orders",
    scope: "grantable",
    actions: [
      { key: "eporder.view", label: "Xem" },
      { key: "eporder.create", label: "Thêm" },
      { key: "eporder.edit", label: "Sửa" },
      { key: "eporder.delete", label: "Xóa" },
      { key: "eporder.excel", label: "Excel (nhập/xuất)", dependsOn: "eporder.edit" },
      { key: "eporder.scan_ai", label: "Quét hóa đơn AI", dependsOn: "eporder.edit" },
    ],
  },
  {
    key: "customer",
    label: "Khách hàng",
    group: "customers",
    scope: "grantable",
    actions: [
      { key: "customer.view", label: "Xem" },
      { key: "customer.create", label: "Thêm" },
      { key: "customer.edit", label: "Sửa" },
      { key: "customer.delete", label: "Xóa" },
    ],
  },
  {
    key: "storefront",
    label: "Giao diện ngoài (banner + hiển thị sản phẩm)",
    group: "storefront",
    scope: "grantable",
    actions: [
      { key: "storefront.manage", label: "Quản lý" },
    ],
  },
  {
    key: "account",
    label: "Phân quyền",
    group: "admin",
    scope: "adminFixed",
    actions: [
      { key: "account.manage", label: "Quản lý" },
    ],
  },
  {
    key: "history_import",
    label: "Lịch sử nhập kho",
    group: "system",
    scope: "grantable",
    actions: [
      { key: "history_import.view", label: "Xem" },
    ],
  },
  {
    key: "history_export",
    label: "Lịch sử xuất kho",
    group: "system",
    scope: "grantable",
    actions: [
      { key: "history_export.view", label: "Xem" },
    ],
  },
  {
    key: "activitylog",
    label: "Lịch sử hoạt động",
    group: "admin",
    scope: "grantable",
    actions: [
      { key: "activitylog.view", label: "Xem" },
    ],
  },
];

const getActivePermissionCatalog = () => PERMISSION_CATALOG;

const getPermissionsByScope = (scope) =>
  getActivePermissionCatalog()
    .filter((moduleItem) => moduleItem.scope === scope)
    .flatMap((moduleItem) => moduleItem.actions.map((action) => action.key));

const findPermission = (perm) => {
  for (const moduleItem of getActivePermissionCatalog()) {
    const action = moduleItem.actions.find((item) => item.key === perm);

    if (action) {
      return { moduleItem, action };
    }
  }

  return null;
};

const getAllPermissions = () =>
  getActivePermissionCatalog().flatMap((moduleItem) => moduleItem.actions.map((action) => action.key));

const getGrantablePermissions = () => getPermissionsByScope("grantable");

const getAdminFixedPermissions = () => getPermissionsByScope("adminFixed");

const isValidPermission = (perm) => Boolean(findPermission(perm));

const isGrantablePermission = (perm) =>
  getActivePermissionCatalog().some(
    (moduleItem) =>
      moduleItem.scope === "grantable" &&
      moduleItem.actions.some((action) => action.key === perm)
  );

const getPermissionLabel = (perm) => {
  const found = findPermission(perm);

  if (!found) {
    return perm;
  }

  return `${found.moduleItem.label} - ${found.action.label}`;
};

const getDependency = (perm) => {
  const found = findPermission(perm);

  return found && found.action.dependsOn ? found.action.dependsOn : null;
};

const getCatalogForClient = () =>
  getActivePermissionCatalog().map((moduleItem) => ({
    key: moduleItem.key,
    label: moduleItem.label,
    group: moduleItem.group,
    scope: moduleItem.scope,
    actions: moduleItem.actions.map((action) => ({
      key: action.key,
      label: action.label,
      ...(action.dependsOn ? { dependsOn: action.dependsOn } : {}),
    })),
  }));

module.exports = {
  PERMISSION_CATALOG,
  getAllPermissions,
  getGrantablePermissions,
  getAdminFixedPermissions,
  isValidPermission,
  isGrantablePermission,
  getPermissionLabel,
  getDependency,
  getCatalogForClient,
};
