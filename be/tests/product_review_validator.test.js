const productReviews = require('../validators/productReviews');

const {
  ProductReviewValidationError,
  validateCreateReviewPayload,
  validateUpdateReviewPayload,
} = productReviews;

const clone = (value) => JSON.parse(JSON.stringify(value));

const expectValidationError = (validator, payload, fieldPath) => {
  let error;

  try {
    validator(payload);
  } catch (caughtError) {
    error = caughtError;
  }

  expect(error).toBeInstanceOf(ProductReviewValidationError);
  expect(error).toMatchObject({
    name: 'ProductReviewValidationError',
    statusCode: 400,
  });
  expect(error.message).toContain('"' + fieldPath + '"');
};

describe('product review validator contract', () => {
  it('exports only the three public contract members', () => {
    expect(Object.keys(productReviews).sort()).toEqual([
      'ProductReviewValidationError',
      'validateCreateReviewPayload',
      'validateUpdateReviewPayload',
    ].sort());
  });

  it('exposes a validation error with statusCode 400', () => {
    const error = new ProductReviewValidationError('invalid payload');

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'ProductReviewValidationError',
      message: 'invalid payload',
      statusCode: 400,
    });
  });

  describe.each([
    ['create review', validateCreateReviewPayload],
    ['update review', validateUpdateReviewPayload],
  ])('%s body', (label, validator) => {
    it.each([
      ['missing', undefined],
      ['null', null],
      ['an array', []],
      ['a string', 'payload'],
      ['a number', 1],
      ['a boolean', true],
    ])('rejects %s with the body field path', (caseLabel, payload) => {
      expectValidationError(validator, payload, 'body');
    });
  });

  describe('create review payload', () => {
    it.each([
      ['a string comment', { comment: 'Useful product', rating: 5 }, { comment: 'Useful product', rating: 5 }],
      ['a null comment', { comment: null, rating: 4 }, { comment: null, rating: 4 }],
      ['an omitted comment', { rating: 3.5 }, { comment: undefined, rating: 3.5 }],
    ])('accepts %s and returns the normalized shape', (caseLabel, payload, expected) => {
      expect(validateCreateReviewPayload(payload)).toEqual(expected);
    });

    it('does not mutate the payload and ignores unknown fields', () => {
      const payload = {
        comment: 'Stable payload',
        rating: 4,
        unknownField: { nested: true },
      };
      const original = clone(payload);

      expect(validateCreateReviewPayload(payload)).toEqual({
        comment: 'Stable payload',
        rating: 4,
      });
      expect(payload).toEqual(original);
    });

    it.each([
      ['a number', 12],
      ['a boolean', false],
      ['an object', { nested: true }],
      ['an array', ['comment']],
    ])('rejects %s comment with its field path', (caseLabel, comment) => {
      expectValidationError(
        validateCreateReviewPayload,
        { comment, rating: 4 },
        'comment'
      );
    });

    it.each([
      ['a missing rating', {}],
      ['a null rating', { rating: null }],
      ['a numeric string', { rating: '5' }],
      ['a boolean', { rating: true }],
      ['an object', { rating: {} }],
      ['an array', { rating: [] }],
      ['NaN', { rating: NaN }],
      ['positive infinity', { rating: Infinity }],
      ['negative infinity', { rating: -Infinity }],
      ['below the minimum', { rating: 0.99 }],
      ['above the maximum', { rating: 5.01 }],
    ])('rejects %s rating with its field path', (caseLabel, payload) => {
      expectValidationError(validateCreateReviewPayload, payload, 'rating');
    });

    it.each([1, 1.5, 3, 4.75, 5])(
      'accepts finite numeric rating %p within the inclusive range',
      (rating) => {
        expect(validateCreateReviewPayload({ rating })).toEqual({
          comment: undefined,
          rating,
        });
      }
    );
  });

  describe('update review payload', () => {
    it.each([
      ['an empty update', {}, {}],
      ['a comment-only update', { comment: 'Updated comment' }, { comment: 'Updated comment' }],
      ['a null comment update', { comment: null }, { comment: null }],
      ['a rating-only update', { rating: 2.5 }, { rating: 2.5 }],
      [
        'a complete update',
        { comment: 'Updated review', rating: 5 },
        { comment: 'Updated review', rating: 5 },
      ],
    ])('accepts %s and returns only normalized review fields', (caseLabel, payload, expected) => {
      expect(validateUpdateReviewPayload(payload)).toEqual(expected);
    });

    it('does not mutate the payload and ignores unknown fields', () => {
      const payload = {
        rating: 4,
        unknownField: { nested: true },
      };
      const original = clone(payload);

      expect(validateUpdateReviewPayload(payload)).toEqual({ rating: 4 });
      expect(payload).toEqual(original);
    });

    it.each([
      ['a number', 12],
      ['a boolean', true],
      ['an object', { nested: true }],
      ['an array', ['comment']],
    ])('rejects %s comment when present', (caseLabel, comment) => {
      expectValidationError(validateUpdateReviewPayload, { comment }, 'comment');
    });

    it.each([
      ['null', null],
      ['a numeric string', '4'],
      ['a boolean', false],
      ['an object', {}],
      ['an array', []],
      ['NaN', NaN],
      ['positive infinity', Infinity],
      ['negative infinity', -Infinity],
      ['below the minimum', 0.99],
      ['above the maximum', 5.01],
    ])('rejects %s rating when present', (caseLabel, rating) => {
      expectValidationError(validateUpdateReviewPayload, { rating }, 'rating');
    });

    it.each([1, 1.5, 3, 4.75, 5])(
      'accepts finite numeric rating %p when present',
      (rating) => {
        expect(validateUpdateReviewPayload({ rating })).toEqual({ rating });
      }
    );
  });
});
