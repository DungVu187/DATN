const mongoose = require('mongoose');
const {
  buildAdminOrderListOptions,
  buildUserOrderFilter,
  escapeRegex,
} = require('../services/orderReadFilters');

describe('Order read filters', () => {
  it('uses ObjectId directly and escapes literal text filters', () => {
    const objectId = new mongoose.Types.ObjectId().toString();
    expect(buildAdminOrderListOptions({ id: objectId }).filter).toEqual({ _id: objectId });

    const { filter } = buildAdminOrderListOptions({
      id: 'READ.1',
      phone: '0932.0',
      name: 'A+B',
      status: 'Delivering',
      payment: 'true',
      state: 'Processing',
    });

    expect(filter).toMatchObject({
      status: 'Delivering',
      payment: true,
      state: 'Processing',
    });
    expect(filter.orderCode.test('NOVA-READ.1')).toBe(true);
    expect(filter.orderCode.test('NOVA-READX1')).toBe(false);
    expect(filter.userPhone.test('0932.000001')).toBe(true);
    expect(filter.userPhone.test('0932X000001')).toBe(false);
    expect(filter.userName.test('Khách A+B')).toBe(true);
    expect(filter.userName.test('Khách AB')).toBe(false);
    expect(escapeRegex('[READ]+')).toBe('\\[READ\\]\\+');
  });

  it('preserves completed-date precedence, UTC+7 boundaries and fallback', () => {
    const options = buildAdminOrderListOptions({
      page: '3',
      limit: '25',
      status: 'Delivering',
      payment: 'false',
      byCompletedDate: 'true',
      startDate: '2026-07-22',
      endDate: '2026-07-22',
    });

    expect(options.page).toBe('3');
    expect(options.limit).toBe('25');
    expect(options.sortField).toBe('completedAt');
    expect(options.filter.status).toBe('Completed');
    expect(options.filter.payment).toBe(false);
    expect(options.filter.$or).toEqual([
      {
        completedAt: {
          $gte: new Date('2026-07-21T17:00:00.000Z'),
          $lte: new Date('2026-07-22T16:59:59.999Z'),
        },
      },
      {
        completedAt: { $exists: false },
        createdAt: {
          $gte: new Date('2026-07-21T17:00:00.000Z'),
          $lte: new Date('2026-07-22T16:59:59.999Z'),
        },
      },
      {
        completedAt: null,
        createdAt: {
          $gte: new Date('2026-07-21T17:00:00.000Z'),
          $lte: new Date('2026-07-22T16:59:59.999Z'),
        },
      },
    ]);
  });

  it('preserves customer state mapping', () => {
    expect(buildUserOrderFilter('0932000001')).toEqual({ userPhone: '0932000001' });
    expect(buildUserOrderFilter('0932000001', 'Cancelled')).toEqual({
      userPhone: '0932000001',
      state: 'Cancelled',
    });
    expect(buildUserOrderFilter('0932000001', 'Delivering')).toEqual({
      userPhone: '0932000001',
      state: 'Processing',
      status: 'Delivering',
    });
  });
});
