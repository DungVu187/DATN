class ProductReviewValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProductReviewValidationError';
        this.statusCode = 400;
    }
}

function fail(message) {
    throw new ProductReviewValidationError(message);
}

function isNonArrayObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertBodyObject(body) {
    if (!isNonArrayObject(body)) {
        fail('Field "body" must be a non-null, non-array object.');
    }
}

function assertComment(comment) {
    if (comment !== undefined && comment !== null && typeof comment !== 'string') {
        fail('Field "comment" must be a string or null.');
    }
}

function assertRating(rating, { required }) {
    if (rating === undefined && !required) return;

    if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 1 || rating > 5) {
        fail('Field "rating" must be a finite JavaScript number from 1 to 5.');
    }
}

function createValidatedPayload(body) {
    return {
        comment: body.comment,
        rating: body.rating,
    };
}

function validateCreateReviewPayload(body) {
    assertBodyObject(body);
    assertComment(body.comment);
    assertRating(body.rating, { required: true });
    return createValidatedPayload(body);
}

function validateUpdateReviewPayload(body) {
    assertBodyObject(body);
    assertComment(body.comment);
    assertRating(body.rating, { required: false });
    return createValidatedPayload(body);
}

module.exports = {
    ProductReviewValidationError,
    validateCreateReviewPayload,
    validateUpdateReviewPayload,
};
