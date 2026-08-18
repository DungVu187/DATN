const productBatch = require('../validators/productBatchOperations');

const {
  ProductBatchValidationError,
  validateBulkDeletePayload,
  validateByCodesPayload,
  validateFetchByIdsPayload,
} = productBatch;

const clone = (value) => JSON.parse(JSON.stringify(value));

const expectValidationError = (validator, payload, expected = {}) => {
  let error;

  try {
    validator(payload);
  } catch (caughtError) {
    error = caughtError;
  }

  expect(error).toBeInstanceOf(ProductBatchValidationError);
  expect(error).toMatchObject({
    name: 'ProductBatchValidationError',
    statusCode: 400,
  });

  if (expected.path) {
    expect(error.message).toContain('"' + expected.path + '"');
  }
  if (expected.message) {
    expect(error.message).toBe(expected.message);
  }
};

describe('product batch validator contract', () => {
  it('exports only the four public contract members', () => {
    expect(Object.keys(productBatch).sort()).toEqual([
      'ProductBatchValidationError',
      'validateBulkDeletePayload',
      'validateByCodesPayload',
      'validateFetchByIdsPayload',
    ].sort());
  });

  it('exposes a validation error with statusCode 400', () => {
    const error = new ProductBatchValidationError('invalid payload');

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'ProductBatchValidationError',
      message: 'invalid payload',
      statusCode: 400,
    });
  });

  describe.each([
    ['fetch-by-ids', validateFetchByIdsPayload],
    ['by-codes', validateByCodesPayload],
    ['bulk-delete', validateBulkDeletePayload],
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

  describe('fetch-by-ids payload', () => {
    it.each([
      ['an empty array', []],
      ['valid-looking ids', [
        '507f1f77bcf86cd799439011',
        '507F1F77BCF86CD799439012',
      ]],
      ['mixed scalar and complex items', [
        'valid-looking-id',
        123,
        true,
        null,
        { nested: true },
        ['nested'],
      ]],
    ])('copies %s without filtering items', (caseLabel, ids) => {
      const payload = { ids, unknownField: { nested: true } };
      const original = clone(payload);
      const result = validateFetchByIdsPayload(payload);

      expect(result).toEqual({ ids });
      expect(result.ids).not.toBe(ids);
      expect(payload).toEqual(original);
    });

    it.each([
      ['missing ids', {}],
      ['null ids', { ids: null }],
      ['string ids', { ids: '507f1f77bcf86cd799439011' }],
      ['object ids', { ids: {} }],
      ['number ids', { ids: 1 }],
    ])('rejects %s with the legacy message', (caseLabel, payload) => {
      expectValidationError(validateFetchByIdsPayload, payload, {
        message: 'Vui l\u00f2ng cung c\u1ea5p m\u1ed9t m\u1ea3ng ids h\u1ee3p l\u1ec7',
      });
    });
  });

  describe('by-codes payload', () => {
    it.each([
      [['PRODUCT-1']],
      [[1, true, false, null, 'PRODUCT-2']],
    ])('copies a nonempty scalar/null array %p', (codes) => {
      const payload = { codes, unknownField: { nested: true } };
      const original = clone(payload);
      const result = validateByCodesPayload(payload);

      expect(result).toEqual({ codes });
      expect(result.codes).not.toBe(codes);
      expect(payload).toEqual(original);
    });

    it.each([
      ['missing codes', {}],
      ['empty codes', { codes: [] }],
      ['null codes', { codes: null }],
      ['string codes', { codes: 'PRODUCT-1' }],
      ['object codes', { codes: {} }],
    ])('rejects %s with the legacy message', (caseLabel, payload) => {
      expectValidationError(validateByCodesPayload, payload, {
        message: 'Vui l\u00f2ng cung c\u1ea5p m\u1ed9t m\u1ea3ng codes h\u1ee3p l\u1ec7',
      });
    });

    it.each([
      ['an object', {}],
      ['an array', []],
    ])('rejects %s item with its exact index path', (caseLabel, code) => {
      expectValidationError(
        validateByCodesPayload,
        { codes: ['PRODUCT-1', code] },
        { path: 'codes[1]' }
      );
    });
  });

  describe('bulk-delete payload', () => {
    it.each([
      [['507f1f77bcf86cd799439011']],
      [[
        '507f1f77bcf86cd799439011',
        '507F1F77BCF86CD799439012',
        'abcdefabcdefabcdefabcdef',
        'ABCDEFABCDEFABCDEFABCDEF',
      ]],
    ])('copies valid 24-hex ids %p', (ids) => {
      const payload = { ids, unknownField: { nested: true } };
      const original = clone(payload);
      const result = validateBulkDeletePayload(payload);

      expect(result).toEqual({ ids });
      expect(result.ids).not.toBe(ids);
      expect(payload).toEqual(original);
    });

    it.each([
      ['missing ids', {}],
      ['empty ids', { ids: [] }],
      ['null ids', { ids: null }],
      ['string ids', { ids: '507f1f77bcf86cd799439011' }],
      ['object ids', { ids: {} }],
    ])('rejects %s with the legacy top-level message', (caseLabel, payload) => {
      expectValidationError(validateBulkDeletePayload, payload, {
        message: 'Danh s\u00e1ch ID kh\u00f4ng h\u1ee3p l\u1ec7.',
      });
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['an empty string', ''],
      ['a number', 1],
      ['a boolean', true],
      ['a short string', '507f1f77bcf86cd79943901'],
      ['a long string', '507f1f77bcf86cd7994390110'],
      ['a non-hex string', '507f1f77bcf86cd79943901g'],
      ['an object', {}],
      ['an array', []],
    ])('rejects %s item with its exact index path', (caseLabel, id) => {
      expectValidationError(
        validateBulkDeletePayload,
        { ids: ['507f1f77bcf86cd799439011', id] },
        { path: 'ids[1]' }
      );
    });
  });
});
