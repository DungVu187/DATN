const { isLockedOrder } = require('../services/orderPolicy');
const {
  getRouteErrorMessage,
  getRouteErrorStatus,
} = require('../utils/orderRouteErrors');

describe('Order shared policy and route errors', () => {
  it.each([
    [{ status: 'Completed', state: 'Processing' }, true],
    [{ status: 'Processing', state: 'Cancelled' }, true],
    [{ status: 'Completed', state: 'Cancelled' }, true],
    [{ status: 'Processing', state: 'Processing' }, false],
    [{ status: 'Delivering', state: 'Processing' }, false],
  ])('preserves the locked-order policy for %p', (order, expected) => {
    expect(isLockedOrder(order)).toBe(expected);
  });

  it('uses explicit route errors before generic conflict mapping', () => {
    const error = new Error('Không thể cập nhật');
    error.statusCode = 422;

    expect(getRouteErrorStatus(error)).toBe(422);
    expect(getRouteErrorMessage(error, 'fallback')).toBe('Không thể cập nhật');
  });

  it('maps mongoose version conflicts to the legacy 409 response', () => {
    const error = { name: 'VersionError' };

    expect(getRouteErrorStatus(error)).toBe(409);
    expect(getRouteErrorMessage(error, 'fallback')).toBe(
      'Đơn hàng vừa được thay đổi bởi thao tác khác, vui lòng tải lại.'
    );
  });

  it('keeps unknown failures on the supplied route fallback', () => {
    const error = new Error('database failed');

    expect(getRouteErrorStatus(error)).toBe(500);
    expect(getRouteErrorMessage(error, 'Lỗi route')).toBe('Lỗi route');
  });
});
