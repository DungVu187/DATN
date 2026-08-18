const { canAccessOrder } = require('../services/orderAccess');

const privilegedOrderRoles = ['admin', 'superadmin', 'staff'];

describe('Order access policy', () => {
  it('allows the exact phone owner', () => {
    expect(canAccessOrder({ userPhone: '0942000001' }, {
      phone: '0942000001',
      role: 'customer',
    })).toBe(true);
    expect(canAccessOrder({ userPhone: '0942000001' }, {
      phone: '094200000',
      role: 'customer',
    })).toBe(false);
  });

  it('preserves privileged role access without permissions', () => {
    privilegedOrderRoles.forEach((role) => {
      expect(canAccessOrder({ userPhone: '0942000001' }, {
        phone: '0942000002',
        role,
      })).toBe(true);
    });
  });

  it('rejects missing and unrelated users', () => {
    expect(canAccessOrder({ userPhone: '0942000001' })).toBe(false);
    expect(canAccessOrder({ userPhone: '0942000001' }, {
      phone: '0942000002',
      role: 'customer',
    })).toBe(false);
  });
});
