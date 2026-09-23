const { getGrantablePermissions } = require('../../config/permissions');

/**
 * Trước B6, admin đi tắt qua ADMIN_FULL_ACCESS nên fixture nào cũng tạo admin với
 * `permissions` rỗng mà vẫn gọi được mọi route. Bỏ đường tắt xong, admin rỗng quyền
 * bị 403 ngay ở middleware — trước cả validator, nên những test vốn chờ 400 cũng đổi
 * sang 403 và che mất lỗi thật đang cần kiểm.
 *
 * Đây là bộ quyền mặc định cho admin trong test: trọn vẹn nhóm grantable, đúng như
 * một admin đã được superadmin cấp quyền qua màn hình Phân quyền. Suite nào muốn
 * kiểm chính hành vi thiếu quyền thì cứ truyền `permissions` riêng — tham số của
 * lời gọi luôn thắng giá trị mặc định này.
 *
 * Không thêm `account.manage`: nó thuộc scope adminFixed, `hasPermission` đã tự cho
 * admin qua, và `validateGrantablePermissions` sẽ từ chối nếu nó nằm trong mảng.
 */
const ADMIN_TEST_PERMISSIONS = Object.freeze(getGrantablePermissions());

/** Quyền mặc định theo vai trò: chỉ admin được cấp sẵn, staff vẫn phải khai báo tay. */
const defaultPermissionsFor = (role) => (role === 'admin' ? [...ADMIN_TEST_PERMISSIONS] : []);

module.exports = {
    ADMIN_TEST_PERMISSIONS,
    defaultPermissionsFor,
};
