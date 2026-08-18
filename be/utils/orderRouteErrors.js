const { isVersionConflict } = require('../services/inventory');

function getRouteErrorStatus(error) {
  if (error?.statusCode) return error.statusCode;
  if (isVersionConflict(error)) return 409;
  return 500;
}

function getRouteErrorMessage(error, fallback) {
  if (error?.statusCode) return error.message;
  if (isVersionConflict(error)) {
    return 'Đơn hàng vừa được thay đổi bởi thao tác khác, vui lòng tải lại.';
  }
  return fallback;
}

module.exports = {
  getRouteErrorMessage,
  getRouteErrorStatus,
};
