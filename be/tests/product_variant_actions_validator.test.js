const variantActions = require('../validators/productVariantActions');

const {
  ProductVariantActionValidationError,
  validateEarnUpdatePayload,
  validateImportPriceUpdatePayload,
  validateStockAdjustmentPayload,
} = variantActions;

const clone = (value) => JSON.parse(JSON.stringify(value));

const expectValidationError = (validator, payload, expected) => {
  let error;

  try {
    validator(payload);
  } catch (caughtError) {
    error = caughtError;
  }

  expect(error).toBeInstanceOf(ProductVariantActionValidationError);
  expect(error).toMatchObject({
    name: 'ProductVariantActionValidationError',
    statusCode: 400,
  });
  if (expected.path) {
    expect(error.message).toContain('"' + expected.path + '"');
  }
  if (expected.message) {
    expect(error.message).toBe(expected.message);
  }
};

describe('product variant action validator contract', () => {
  it('exports only the four public contract members', () => {
    expect(Object.keys(variantActions).sort()).toEqual([
      'ProductVariantActionValidationError',
      'validateEarnUpdatePayload',
      'validateImportPriceUpdatePayload',
      'validateStockAdjustmentPayload',
    ].sort());
  });

  it('exposes a validation error with statusCode 400', () => {
    const error = new ProductVariantActionValidationError('invalid payload');

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'ProductVariantActionValidationError',
      message: 'invalid payload',
      statusCode: 400,
    });
  });

  describe.each([
    ['stock adjustment', validateStockAdjustmentPayload],
    ['earn update', validateEarnUpdatePayload],
    ['import-price update', validateImportPriceUpdatePayload],
  ])('%s body', (label, validator) => {
    it.each([
      ['missing', undefined],
      ['null', null],
      ['an array', []],
      ['a string', 'payload'],
      ['a number', 1],
    ])('rejects %s with the body field path', (caseLabel, payload) => {
      expectValidationError(validator, payload, { path: 'body' });
    });
  });

  describe('stock adjustment payload', () => {
    it.each([
      [4, 4],
      [-4, -4],
      [2.5, 2.5],
      [-2.5, -2.5],
      ['4', 4],
      ['-4', -4],
      [' 2.5 ', 2.5],
      [' -2.5 ', -2.5],
      ['1e3', 1000],
    ])('normalizes non-zero finite quantity %p to %p', (quantity, expected) => {
      expect(validateStockAdjustmentPayload({ quantity })).toEqual({
        quantity: expected,
        orderId: undefined,
        orderName: undefined,
        isAIScan: false,
      });
    });

    it.each([
      ['string metadata', 'ORDER-1'],
      ['number metadata', 101],
      ['boolean metadata', false],
      ['null metadata', null],
    ])('accepts %s', (caseLabel, metadata) => {
      expect(validateStockAdjustmentPayload({
        quantity: 1,
        orderId: metadata,
        orderName: metadata,
      })).toMatchObject({
        orderId: metadata,
        orderName: metadata,
      });
    });

    it.each([
      [true, true],
      [false, false],
      [1, true],
      [0, false],
      [null, false],
      [undefined, false],
    ])('normalizes isAIScan %p to %p', (isAIScan, expected) => {
      expect(validateStockAdjustmentPayload({
        quantity: 1,
        isAIScan,
      }).isAIScan).toBe(expected);
    });

    it('does not mutate the payload and ignores unknown fields', () => {
      const payload = {
        quantity: '-3.5',
        orderId: null,
        orderName: 'Manual adjustment',
        isAIScan: 1,
        unknownField: { nested: true },
      };
      const original = clone(payload);

      expect(validateStockAdjustmentPayload(payload)).toEqual({
        quantity: -3.5,
        orderId: null,
        orderName: 'Manual adjustment',
        isAIScan: true,
      });
      expect(payload).toEqual(original);
    });

    it.each([
      ['a missing quantity', {}, { message: 'Quantity must be a number' }],
      ['a null quantity', { quantity: null }, { message: 'Quantity must be a number' }],
      ['an empty quantity', { quantity: '' }, { message: 'Quantity must be a number' }],
      ['a whitespace quantity', { quantity: '   ' }, { message: 'Quantity must be a number' }],
      ['a true quantity', { quantity: true }, { message: 'Quantity must be a number' }],
      ['a false quantity', { quantity: false }, { message: 'Quantity must be a number' }],
      ['an object quantity', { quantity: {} }, { message: 'Quantity must be a number' }],
      ['an array quantity', { quantity: [] }, { message: 'Quantity must be a number' }],
      ['a nonnumeric quantity', { quantity: 'many' }, { message: 'Quantity must be a number' }],
      ['a partially numeric quantity', { quantity: '2items' }, { message: 'Quantity must be a number' }],
      ['NaN', { quantity: NaN }, { message: 'Quantity must be a number' }],
      ['positive infinity', { quantity: Infinity }, { message: 'Quantity must be a number' }],
      ['negative infinity', { quantity: -Infinity }, { message: 'Quantity must be a number' }],
      ['an infinity string', { quantity: 'Infinity' }, { message: 'Quantity must be a number' }],
      ['zero', { quantity: 0 }, { message: 'Số lượng thay đổi phải khác 0' }],
      ['negative zero', { quantity: -0 }, { message: 'Số lượng thay đổi phải khác 0' }],
      ['a zero string', { quantity: '0' }, { message: 'Số lượng thay đổi phải khác 0' }],
      ['a decimal zero string', { quantity: '0.0' }, { message: 'Số lượng thay đổi phải khác 0' }],
      ['an object orderId', { quantity: 1, orderId: {} }, { path: 'orderId' }],
      ['an array orderId', { quantity: 1, orderId: [] }, { path: 'orderId' }],
      ['an object orderName', { quantity: 1, orderName: {} }, { path: 'orderName' }],
      ['an array orderName', { quantity: 1, orderName: [] }, { path: 'orderName' }],
    ])('rejects %s with its contract error', (caseLabel, payload, expected) => {
      expectValidationError(validateStockAdjustmentPayload, payload, expected);
    });

    it.each([2, -1, 'true', 'false', '0', '1', {}, []])(
      'rejects invalid isAIScan %p with its field path',
      (isAIScan) => {
        expectValidationError(
          validateStockAdjustmentPayload,
          { quantity: 1, isAIScan },
          { path: 'isAIScan' }
        );
      }
    );
  });

  describe('earn update payload', () => {
    it.each([0, -0, 0.5, 25, Number.MAX_VALUE])(
      'accepts finite non-negative earn %p',
      (earn) => {
        expect(validateEarnUpdatePayload({ earn })).toEqual({ earn });
      }
    );

    it('does not mutate the payload and ignores unknown fields', () => {
      const payload = { earn: 25, unknownField: { nested: true } };
      const original = clone(payload);

      expect(validateEarnUpdatePayload(payload)).toEqual({ earn: 25 });
      expect(payload).toEqual(original);
    });

    it.each([
      ['a missing earn', {}],
      ['a null earn', { earn: null }],
      ['an empty-string earn', { earn: '' }],
      ['a numeric-string earn', { earn: '25' }],
      ['a negative earn', { earn: -0.01 }],
      ['a boolean earn', { earn: true }],
      ['an object earn', { earn: {} }],
      ['an array earn', { earn: [] }],
      ['NaN', { earn: NaN }],
      ['positive infinity', { earn: Infinity }],
      ['negative infinity', { earn: -Infinity }],
    ])('rejects %s with the legacy earn error', (caseLabel, payload) => {
      expectValidationError(validateEarnUpdatePayload, payload, {
        message: 'Earn phải là một số không âm',
      });
    });
  });

  describe('import-price update payload', () => {
    it.each([
      ['1.234.000', 1234000],
      ['0', 0],
      ['001.200', 1200],
      ['.', 0],
      ['...', 0],
    ])('keeps legacy format %p and normalizes it to %p', (importPrice, expected) => {
      expect(validateImportPriceUpdatePayload({ importPrice })).toEqual({
        importPrice,
        importPriceNumber: expected,
      });
    });

    it('does not mutate the payload and ignores unknown fields', () => {
      const payload = {
        importPrice: '1.234.000',
        unknownField: { nested: true },
      };
      const original = clone(payload);

      expect(validateImportPriceUpdatePayload(payload)).toEqual({
        importPrice: '1.234.000',
        importPriceNumber: 1234000,
      });
      expect(payload).toEqual(original);
    });

    it.each([
      ['a missing importPrice', {}, 'ImportPrice phải là một chuỗi số hợp lệ'],
      ['a number importPrice', { importPrice: 1234 }, 'ImportPrice phải là một chuỗi số hợp lệ'],
      ['a null importPrice', { importPrice: null }, 'ImportPrice phải là một chuỗi số hợp lệ'],
      ['an object importPrice', { importPrice: {} }, 'ImportPrice phải là một chuỗi số hợp lệ'],
      ['an array importPrice', { importPrice: [] }, 'ImportPrice phải là một chuỗi số hợp lệ'],
      ['an empty importPrice', { importPrice: '' }, 'ImportPrice phải là một chuỗi số hợp lệ'],
      ['a nonnumeric importPrice', { importPrice: 'not-a-price' }, 'ImportPrice phải là một chuỗi số hợp lệ'],
      ['a partially numeric importPrice', { importPrice: '123abc' }, 'ImportPrice phải là một chuỗi số hợp lệ'],
      ['a negative importPrice', { importPrice: '-1' }, 'ImportPrice không hợp lệ để tính toán price'],
      ['a dotted negative importPrice', { importPrice: '-1.000' }, 'ImportPrice không hợp lệ để tính toán price'],
    ])('rejects %s with its legacy error', (caseLabel, payload, message) => {
      expectValidationError(
        validateImportPriceUpdatePayload,
        payload,
        { message }
      );
    });
  });
});
