const adminActions = require('../validators/productAdminActions');

const {
  ProductAdminActionValidationError,
  validatePurchaseAdjustment,
} = adminActions;

const VALID_PRODUCT_ID = '507f1f77bcf86cd799439011';
const clone = (value) => JSON.parse(JSON.stringify(value));

const expectValidationError = (
  productId,
  payload,
  expectedMessage = 'Dữ liệu không hợp lệ'
) => {
  let error;

  try {
    validatePurchaseAdjustment(productId, payload);
  } catch (caughtError) {
    error = caughtError;
  }

  expect(error).toBeInstanceOf(ProductAdminActionValidationError);
  expect(error).toMatchObject({
    name: 'ProductAdminActionValidationError',
    message: expectedMessage,
  });
};

describe('product admin actions validator contract', () => {
  it('exports the purchase validator and its public validation error', () => {
    expect(Object.keys(adminActions).sort()).toEqual([
      'ProductAdminActionValidationError',
      'validatePurchaseAdjustment',
    ].sort());
    expect(typeof validatePurchaseAdjustment).toBe('function');
  });

  it('exposes the public validation error type', () => {
    const error = new ProductAdminActionValidationError('invalid payload');

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'ProductAdminActionValidationError',
      message: 'invalid payload',
    });
  });

  it.each([
    ['a missing id', undefined],
    ['a null id', null],
    ['an empty id', ''],
    ['a whitespace id', '   '],
    ['a short id', '507f1f77bcf86cd79943901'],
    ['a long id', '507f1f77bcf86cd7994390110'],
    ['a non-hex id', '507f1f77bcf86cd79943901g'],
  ])('rejects %s before validating the payload', (_caseName, productId) => {
    expectValidationError(
      productId,
      { action: 'increase', amount: 1 },
      'Mã sản phẩm không hợp lệ'
    );
  });

  it.each([
    ['increase', 1, 1],
    ['decrease', 4, 4],
    ['increase', 2.9, 2],
    ['decrease', '03', 3],
    ['increase', ' 4.8 ', 4],
    ['decrease', '5items', 5],
  ])('normalizes %s amount %p with legacy parseInt behavior', (action, amount, expectedAmount) => {
    expect(validatePurchaseAdjustment(VALID_PRODUCT_ID, { action, amount })).toEqual({
      action,
      amount: expectedAmount,
      productId: VALID_PRODUCT_ID,
    });
  });

  it('accepts an ObjectId-compatible value and preserves the original id value', () => {
    const productId = { toString: () => VALID_PRODUCT_ID };

    expect(validatePurchaseAdjustment(productId, {
      action: 'increase',
      amount: 1,
    })).toEqual({
      action: 'increase',
      amount: 1,
      productId,
    });
  });

  it('does not mutate the payload and ignores unknown fields', () => {
    const payload = {
      action: 'increase',
      amount: '7.9',
      unknownField: { nested: true },
    };
    const original = clone(payload);

    expect(validatePurchaseAdjustment(VALID_PRODUCT_ID, payload)).toEqual({
      action: 'increase',
      amount: 7,
      productId: VALID_PRODUCT_ID,
    });
    expect(payload).toEqual(original);
  });

  it.each([undefined, null])(
    'preserves the legacy destructuring failure for payload %p',
    (payload) => {
      expect(() => validatePurchaseAdjustment(VALID_PRODUCT_ID, payload)).toThrow(TypeError);
    }
  );

  it.each([
    ['an array body', []],
    ['a string body', 'payload'],
    ['a number body', 1],
  ])('rejects %s', (_caseName, payload) => {
    expectValidationError(VALID_PRODUCT_ID, payload);
  });

  it.each([
    ['a missing action', { amount: 1 }],
    ['a null action', { action: null, amount: 1 }],
    ['an empty action', { action: '', amount: 1 }],
    ['a whitespace action', { action: '   ', amount: 1 }],
    ['an uppercase action', { action: 'INCREASE', amount: 1 }],
    ['an unknown action', { action: 'reset', amount: 1 }],
    ['an object action', { action: {}, amount: 1 }],
    ['an array action', { action: [], amount: 1 }],
  ])('rejects %s with the legacy message', (_caseName, payload) => {
    expectValidationError(VALID_PRODUCT_ID, payload);
  });

  it.each([
    ['a missing amount', { action: 'increase' }],
    ['a null amount', { action: 'increase', amount: null }],
    ['an empty amount', { action: 'increase', amount: '' }],
    ['a whitespace amount', { action: 'increase', amount: '   ' }],
    ['a zero amount', { action: 'increase', amount: 0 }],
    ['a zero string', { action: 'increase', amount: '0' }],
    ['a negative amount', { action: 'increase', amount: -1 }],
    ['a negative string', { action: 'increase', amount: '-2' }],
    ['a boolean amount', { action: 'increase', amount: true }],
    ['a nonnumeric amount', { action: 'increase', amount: 'many' }],
    ['an object amount', { action: 'increase', amount: {} }],
    ['NaN', { action: 'increase', amount: NaN }],
    ['positive infinity', { action: 'increase', amount: Infinity }],
  ])('rejects %s with the legacy message', (_caseName, payload) => {
    expectValidationError(VALID_PRODUCT_ID, payload);
  });

  it('keeps legacy parseInt coercion for a single-item amount array', () => {
    expect(validatePurchaseAdjustment(VALID_PRODUCT_ID, {
      action: 'increase',
      amount: [2],
    })).toEqual({
      action: 'increase',
      amount: 2,
      productId: VALID_PRODUCT_ID,
    });
  });
});
