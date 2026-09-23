// Quy tắc quyền trên trang chi tiết đơn — phải khớp với backend (be/middlewares/ownDraft.js):
// - Quyền "Sửa": sửa mọi đơn.
// - Quyền "Thêm": chỉ soạn tiếp đơn nháp do chính mình tạo; không đổi trạng thái đơn.
// - Nút tạo đơn liên quan phải kiểm tra quyền "Thêm" của đúng module đơn đích.

// Đơn bán còn nháp khi đang xử lý và chưa huỷ
export const isSalesOrderDraft = (order) =>
  Boolean(order) && order.status === "Processing" && order.state !== "Cancelled";

// Đơn nhập/xuất còn nháp khi chưa hoàn tất
export const isInventoryOrderDraft = (order) => Boolean(order) && order.status !== true;

const getId = (value) => (value && typeof value === "object" ? value._id : value);

export const isOwnDraft = (order, profile, isDraft) => {
  const createdBy = getId(order?.createdBy);
  const profileId = getId(profile);
  return Boolean(createdBy) && Boolean(profileId) &&
    String(createdBy) === String(profileId) && isDraft(order);
};

const ORDER_MODULES = {
  order: { isDraft: isSalesOrderDraft, relatedModule: null },
  iporder: { isDraft: isInventoryOrderDraft, relatedModule: "eporder" },
  eporder: { isDraft: isInventoryOrderDraft, relatedModule: "iporder" },
};

export const getOrderDetailAbilities = ({ module, can, profile, order }) => {
  const config = ORDER_MODULES[module];
  if (!config) throw new Error(`Module đơn không hợp lệ: ${module}`);

  const canCreate = can(`${module}.create`);
  const canEdit = can(`${module}.edit`);
  const canEditContent = canEdit || (canCreate && isOwnDraft(order, profile, config.isDraft));

  return {
    canCreate,
    // Quyền Sửa đầy đủ: đổi trạng thái, Excel, quét AI…
    canEdit,
    // Sửa nội dung đơn (dòng hàng, tên, ghi chú, khách hàng, ảnh)
    canEditContent,
    canAddImage: canEditContent,
    canDelete: can(`${module}.delete`),
    canExcel: canEdit && can(`${module}.excel`),
    canScanAi: canEdit && can(`${module}.scan_ai`),
    // Sao chép đơn = tạo đơn mới cùng module
    canCopy: canCreate,
    // "Xuất đơn" từ đơn nhập / "Nhập đơn" từ đơn xuất = tạo đơn ở module kia
    canCreateRelatedOrder: config.relatedModule ? can(`${config.relatedModule}.create`) : false,
    // Đơn mẫu lưu theo tài khoản cá nhân (API chỉ cần đăng nhập) — giữ như cũ
    canCreateTemplate: canCreate || canEdit,
  };
};
