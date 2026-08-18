const mongoose = require('mongoose');
const orderReorder = require('../services/orderReorder');

const {
  buildOrderLineKey,
  countOrderLines,
  hasSameOrderLines,
  prepareOrderReorderItems,
} = orderReorder;

const INVALID_LIST_MESSAGE = 'Danh sách sản phẩm không hợp lệ';
const REORDER_ONLY_MESSAGE =
  'API sắp xếp chỉ được thay đổi thứ tự, không được đổi sản phẩm hoặc số lượng.';
const PRODUCT_ID_A = '507f1f77bcf86cd799439011';
const PRODUCT_ID_B = '507f1f77bcf86cd799439012';

const line = (productId, variantIndex, quantity, extra = {}) => ({
  productId,
  variantIndex,
  quantity,
  ...extra,
});

describe('order reorder service contract', () => {
  it('exports the pure reorder helpers', () => {
    expect(typeof buildOrderLineKey).toBe('function');
    expect(typeof countOrderLines).toBe('function');
    expect(typeof hasSameOrderLines).toBe('function');
    expect(typeof prepareOrderReorderItems).toBe('function');
  });

  it('builds a normalized key from product, variant, and quantity', () => {
    const productId = new mongoose.Types.ObjectId(PRODUCT_ID_A);

    expect(buildOrderLineKey(line(productId, '2', '3')))
      .toBe(PRODUCT_ID_A + ':2:3');
  });

  it('counts duplicate lines without collapsing their occurrences', () => {
    const counts = countOrderLines([
      line(PRODUCT_ID_A, 0, 1),
      line(PRODUCT_ID_B, 1, 2),
      line(PRODUCT_ID_A, 0, 1),
    ]);

    expect(counts).toEqual(new Map([
      [PRODUCT_ID_A + ':0:1', 2],
      [PRODUCT_ID_B + ':1:2', 1],
    ]));
  });

  it('compares exact line multisets independently of ordering', () => {
    const currentItems = [
      line(PRODUCT_ID_A, 0, 1),
      line(PRODUCT_ID_A, 0, 1),
      line(PRODUCT_ID_B, 1, 2),
    ];

    expect(hasSameOrderLines(currentItems, [
      line(PRODUCT_ID_B, 1, 2),
      line(PRODUCT_ID_A, 0, 1),
      line(PRODUCT_ID_A, 0, 1),
    ])).toBe(true);
    expect(hasSameOrderLines(currentItems, [
      line(PRODUCT_ID_B, 1, 2),
      line(PRODUCT_ID_A, 0, 1),
    ])).toBe(false);
  });

  it.each([undefined, null, {}, 'items', 1])(
    'rejects non-array cartItems payload %p',
    (cartItems) => {
      expect(prepareOrderReorderItems([], cartItems)).toEqual({
        error: { status: 400, message: INVALID_LIST_MESSAGE },
      });
    }
  );

  it.each([
    [
      'an invalid product id',
      line('invalid-id', 0, 1),
      'Sản phẩm không hợp lệ',
    ],
    [
      'a negative variant index',
      line(PRODUCT_ID_A, -1, 1),
      'Phiên bản sản phẩm không hợp lệ',
    ],
    [
      'a fractional variant index',
      line(PRODUCT_ID_A, 1.5, 1),
      'Phiên bản sản phẩm không hợp lệ',
    ],
    [
      'a zero quantity',
      line(PRODUCT_ID_A, 0, 0),
      'Số lượng không hợp lệ',
    ],
    [
      'a fractional quantity',
      line(PRODUCT_ID_A, 0, 1.5),
      'Số lượng không hợp lệ',
    ],
  ])('preserves legacy validation for %s', (_caseName, item, message) => {
    expect(prepareOrderReorderItems(
      [line(PRODUCT_ID_A, 0, 1)],
      [item]
    )).toEqual({
      error: { status: 400, message },
    });
  });

  it('accepts empty current and payload item lists', () => {
    expect(prepareOrderReorderItems([], [])).toEqual({ cartItems: [] });
  });

  it('returns normalized fields only and preserves the requested order', () => {
    const currentItems = [
      line(new mongoose.Types.ObjectId(PRODUCT_ID_A), 2, 3, {
        _id: new mongoose.Types.ObjectId(),
        productName: 'Old A',
      }),
      line(PRODUCT_ID_B, 0, 1, {
        _id: new mongoose.Types.ObjectId(),
      }),
    ];
    const cartItems = [
      line(PRODUCT_ID_B, '0', '1', {
        _id: 'client-controlled-id',
        productName: 'Injected B',
      }),
      line(PRODUCT_ID_A, '2', '3', {
        _id: 'another-client-id',
        unknown: true,
      }),
    ];
    const originalPayload = JSON.parse(JSON.stringify(cartItems));

    expect(prepareOrderReorderItems(currentItems, cartItems)).toEqual({
      cartItems: [
        line(PRODUCT_ID_B, 0, 1),
        line(PRODUCT_ID_A, 2, 3),
      ],
    });
    expect(cartItems).toEqual(originalPayload);
  });

  it('allows duplicate lines when every occurrence is preserved', () => {
    const currentItems = [
      line(PRODUCT_ID_A, 0, 1),
      line(PRODUCT_ID_B, 0, 2),
      line(PRODUCT_ID_A, 0, 1),
    ];
    const cartItems = [
      line(PRODUCT_ID_A, 0, 1),
      line(PRODUCT_ID_A, 0, 1),
      line(PRODUCT_ID_B, 0, 2),
    ];

    expect(prepareOrderReorderItems(currentItems, cartItems)).toEqual({
      cartItems,
    });
  });

  it.each([
    [
      'adds a line',
      [line(PRODUCT_ID_A, 0, 1)],
      [line(PRODUCT_ID_A, 0, 1), line(PRODUCT_ID_B, 0, 1)],
    ],
    [
      'removes a line',
      [line(PRODUCT_ID_A, 0, 1), line(PRODUCT_ID_B, 0, 1)],
      [line(PRODUCT_ID_A, 0, 1)],
    ],
    [
      'changes quantity',
      [line(PRODUCT_ID_A, 0, 1)],
      [line(PRODUCT_ID_A, 0, 2)],
    ],
    [
      'drops one duplicate occurrence',
      [line(PRODUCT_ID_A, 0, 1), line(PRODUCT_ID_A, 0, 1)],
      [line(PRODUCT_ID_A, 0, 1)],
    ],
  ])('rejects a reorder that %s', (_caseName, currentItems, cartItems) => {
    expect(prepareOrderReorderItems(currentItems, cartItems)).toEqual({
      error: { status: 400, message: REORDER_ONLY_MESSAGE },
    });
  });
});
