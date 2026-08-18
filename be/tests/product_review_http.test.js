const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const PRODUCT_CODE_PREFIX = 'PRODUCT-REVIEW-HTTP-';
const OWNER_PHONE = '0987609101';
const OTHER_PHONE = '0987609102';
const MODERATOR_PHONE = '0987609103';
const OWNER_EMAIL = 'product-review-http-owner@ttsmart.test';
const OTHER_EMAIL = 'product-review-http-other@ttsmart.test';
const MODERATOR_EMAIL = 'product-review-http-moderator@ttsmart.test';
const TEST_USERS = [
  {
    phone: OWNER_PHONE,
    email: OWNER_EMAIL,
    name: 'Product Review HTTP Owner',
    role: 'customer',
  },
  {
    phone: OTHER_PHONE,
    email: OTHER_EMAIL,
    name: 'Product Review HTTP Other',
    role: 'customer',
  },
  {
    phone: MODERATOR_PHONE,
    email: MODERATOR_EMAIL,
    name: 'Product Review HTTP Moderator',
    role: 'staff',
  },
];

let ownerAgent;
let otherAgent;
let moderatorAgent;
let productSequence = 0;

const serialize = (value) => JSON.parse(JSON.stringify(value));

const cleanupFixtures = async ({ includeUsers = false } = {}) => {
  await Promise.all([
    Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } }),
    ...(includeUsers
      ? [User.deleteMany({ phone: { $in: TEST_USERS.map((user) => user.phone) } })]
      : []),
  ]);
};

const createAuthenticatedAgent = async ({ phone, role }) => {
  const agent = request.agent(app);
  const endpoint = role === 'customer' ? '/users/login' : '/users/admin/login';
  const response = await agent
    .post(endpoint)
    .send({ phone, password: 'password123' });

  expect(response.status).toBe(200);
  expect(response.headers['set-cookie']).toBeDefined();
  return agent;
};

const createProduct = async ({ reviews = [] } = {}) => {
  productSequence += 1;
  const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);

  return Product.create({
    type: 'PLC',
    name: 'Product Review HTTP Fixture ' + productSequence,
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    brand: 'Review Test Brand',
    section: 'Review Test Section',
    value: 'PLC',
    warranty: '12 months',
    variant: [{
      price: '100000',
      color: 'Gray',
      quantityForSale: 10,
      quantityInStorage: 10,
    }],
    reviews,
    reviewCount: reviews.length,
    totalRating,
    averageReviews: reviews.length > 0 ? totalRating / reviews.length : 0,
  });
};

const readReviewState = async (productId) => {
  const product = await Product.findById(productId)
    .select('reviews reviewCount totalRating averageReviews updatedAt')
    .lean();
  return serialize(product);
};

const expectBadRequest = (response) => {
  expect(response.status).toBe(400);
  expect(response.status).not.toBe(500);
  expect(response.body.message).toEqual(expect.any(String));
};

const expectValidationError = (response, fieldPath) => {
  expectBadRequest(response);
  expect(response.body.message).toContain(fieldPath);
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupFixtures({ includeUsers: true });

  await User.create(TEST_USERS.map((user) => ({
    ...user,
    password: 'password123',
  })));

  ownerAgent = await createAuthenticatedAgent({
    phone: OWNER_PHONE,
    role: 'customer',
  });
  otherAgent = await createAuthenticatedAgent({
    phone: OTHER_PHONE,
    role: 'customer',
  });
  moderatorAgent = await createAuthenticatedAgent({
    phone: MODERATOR_PHONE,
    role: 'staff',
  });
});

afterEach(async () => {
  await cleanupFixtures();
});

afterAll(async () => {
  await cleanupFixtures({ includeUsers: true });
  await mongoose.disconnect();
});

describe('product review GET endpoint', () => {
  it('returns the stored reviews without authentication', async () => {
    const product = await createProduct({
      reviews: [
        { email: OWNER_EMAIL, comment: 'Owner review', rating: 5 },
        { email: OTHER_EMAIL, comment: 'Other review', rating: 3 },
      ],
    });

    const response = await request(app).get('/products/' + product._id + '/review');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ email: OWNER_EMAIL, comment: 'Owner review', rating: 5 }),
      expect.objectContaining({ email: OTHER_EMAIL, comment: 'Other review', rating: 3 }),
    ]));
  });
});

describe('product review authentication', () => {
  it('requires authentication to create a review', async () => {
    const product = await createProduct();
    const before = await readReviewState(product._id);

    const response = await request(app)
      .post('/products/' + product._id + '/review/create')
      .send({ comment: 'Anonymous review', rating: 4 });

    expect(response.status).toBe(401);
    expect(await readReviewState(product._id)).toEqual(before);
  });

  it('requires authentication to update a review', async () => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Before', rating: 4 }],
    });
    const before = await readReviewState(product._id);

    const response = await request(app)
      .put('/products/' + product._id + '/review/' + product.reviews[0]._id)
      .send({ comment: 'Anonymous edit', rating: 1 });

    expect(response.status).toBe(401);
    expect(await readReviewState(product._id)).toEqual(before);
  });

  it('requires authentication to delete a review', async () => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Before', rating: 4 }],
    });
    const before = await readReviewState(product._id);

    const response = await request(app)
      .delete('/products/' + product._id + '/review/' + product.reviews[0]._id);

    expect(response.status).toBe(401);
    expect(await readReviewState(product._id)).toEqual(before);
  });
});

describe('product review creation', () => {
  it('creates a review and updates all aggregate fields', async () => {
    const product = await createProduct({
      reviews: [{ email: OTHER_EMAIL, comment: 'Existing', rating: 2 }],
    });

    const response = await ownerAgent
      .post('/products/' + product._id + '/review/create')
      .send({ comment: 'New owner review', rating: 4 });

    expect(response.status).toBe(201);
    expect(response.body.review).toEqual(expect.objectContaining({
      email: OWNER_EMAIL,
      comment: 'New owner review',
      rating: 4,
    }));

    const updated = await Product.findById(product._id).lean();
    expect(updated.reviews).toHaveLength(2);
    expect(updated.reviewCount).toBe(2);
    expect(updated.totalRating).toBe(6);
    expect(updated.averageReviews).toBe(3);
  });

  it('ignores client-owned review fields and unknown fields', async () => {
    const product = await createProduct();
    const suppliedReviewId = new mongoose.Types.ObjectId();

    const response = await ownerAgent
      .post('/products/' + product._id + '/review/create')
      .send({
        comment: 'Safe review',
        rating: 5,
        _id: suppliedReviewId,
        email: OTHER_EMAIL,
        createdAt: '2000-01-01T00:00:00.000Z',
        isModerator: true,
        unknownField: 'ignored',
      });

    expect(response.status).toBe(201);
    expect(String(response.body.review._id)).not.toBe(String(suppliedReviewId));
    expect(response.body.review.email).toBe(OWNER_EMAIL);
    expect(response.body.review.unknownField).toBeUndefined();
    expect(response.body.review.isModerator).toBeUndefined();

    const updated = await Product.findById(product._id).lean();
    expect(updated.reviews).toHaveLength(1);
    expect(String(updated.reviews[0]._id)).not.toBe(String(suppliedReviewId));
    expect(updated.reviews[0].email).toBe(OWNER_EMAIL);
    expect(updated.reviews[0].unknownField).toBeUndefined();
    expect(updated.reviews[0].isModerator).toBeUndefined();
  });

  it.each([
    ['array body', [{ comment: 'Array body', rating: 4 }], 'body'],
    ['object comment', { comment: { text: 'Object comment' }, rating: 4 }, 'comment'],
    ['array comment', { comment: ['Array comment'], rating: 4 }, 'comment'],
    ['missing rating', { comment: 'Missing rating' }, 'rating'],
    ['numeric string rating', { comment: 'String rating', rating: '4' }, 'rating'],
    ['zero rating', { comment: 'Zero rating', rating: 0 }, 'rating'],
    ['rating above five', { comment: 'High rating', rating: 6 }, 'rating'],
    ['object rating', { comment: 'Object rating', rating: { value: 4 } }, 'rating'],
  ])('rejects malformed create payload: %s without changing the product', async (_caseName, body, fieldPath) => {
    const product = await createProduct({
      reviews: [{ email: OTHER_EMAIL, comment: 'Sentinel', rating: 3 }],
    });
    const before = await readReviewState(product._id);

    const response = await ownerAgent
      .post('/products/' + product._id + '/review/create')
      .send(body);

    expectValidationError(response, fieldPath);
    expect(await readReviewState(product._id)).toEqual(before);
  });

  it('validates create payload before looking up a missing product', async () => {
    const missingProductId = new mongoose.Types.ObjectId();
    const sentinel = await createProduct({
      reviews: [{ email: OTHER_EMAIL, comment: 'Sentinel', rating: 3 }],
    });
    const before = await readReviewState(sentinel._id);

    const response = await ownerAgent
      .post('/products/' + missingProductId + '/review/create')
      .send({ comment: 'Invalid rating', rating: '4' });

    expectValidationError(response, 'rating');
    expect(await readReviewState(sentinel._id)).toEqual(before);
  });
});

describe('product review updates', () => {
  it('allows the owner to update comment and rating while recalculating aggregates', async () => {
    const product = await createProduct({
      reviews: [
        { email: OWNER_EMAIL, comment: 'Owner before', rating: 2 },
        { email: OTHER_EMAIL, comment: 'Other review', rating: 5 },
      ],
    });
    const reviewId = product.reviews[0]._id;

    const response = await ownerAgent
      .put('/products/' + product._id + '/review/' + reviewId)
      .send({ comment: 'Owner after', rating: 4 });

    expect(response.status).toBe(200);
    expect(response.body.review).toEqual(expect.objectContaining({
      email: OWNER_EMAIL,
      comment: 'Owner after',
      rating: 4,
    }));

    const updated = await Product.findById(product._id).lean();
    expect(updated.reviews[0]).toEqual(expect.objectContaining({
      email: OWNER_EMAIL,
      comment: 'Owner after',
      rating: 4,
    }));
    expect(updated.reviewCount).toBe(2);
    expect(updated.totalRating).toBe(9);
    expect(updated.averageReviews).toBeCloseTo(4.5);
  });

  it('keeps an empty update body as a no-op', async () => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Keep me', rating: 4 }],
    });
    const reviewId = product.reviews[0]._id;
    const before = await readReviewState(product._id);

    const response = await ownerAgent
      .put('/products/' + product._id + '/review/' + reviewId)
      .send({});

    expect(response.status).toBe(200);
    const after = await readReviewState(product._id);
    expect(after.reviews).toEqual(before.reviews);
    expect(after.reviewCount).toBe(before.reviewCount);
    expect(after.totalRating).toBe(before.totalRating);
    expect(after.averageReviews).toBe(before.averageReviews);
  });

  it('keeps the legacy behavior where an empty comment does not overwrite the stored comment', async () => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Keep this comment', rating: 4 }],
    });
    const reviewId = product.reviews[0]._id;

    const response = await ownerAgent
      .put('/products/' + product._id + '/review/' + reviewId)
      .send({ comment: '' });

    expect(response.status).toBe(200);
    expect(response.body.review.comment).toBe('Keep this comment');
    const updated = await Product.findById(product._id).lean();
    expect(updated.reviews[0].comment).toBe('Keep this comment');
    expect(updated.totalRating).toBe(4);
    expect(updated.averageReviews).toBe(4);
  });

  it('allows a moderator to update another user review', async () => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Needs moderation', rating: 2 }],
    });
    const reviewId = product.reviews[0]._id;

    const response = await moderatorAgent
      .put('/products/' + product._id + '/review/' + reviewId)
      .send({ comment: 'Moderated', rating: 5 });

    expect(response.status).toBe(200);
    const updated = await Product.findById(product._id).lean();
    expect(updated.reviews[0]).toEqual(expect.objectContaining({
      email: OWNER_EMAIL,
      comment: 'Moderated',
      rating: 5,
    }));
    expect(updated.reviewCount).toBe(1);
    expect(updated.totalRating).toBe(5);
    expect(updated.averageReviews).toBe(5);
  });

  it('returns 403 when another customer tries to update a review', async () => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Owner review', rating: 4 }],
    });
    const before = await readReviewState(product._id);

    const response = await otherAgent
      .put('/products/' + product._id + '/review/' + product.reviews[0]._id)
      .send({ comment: 'Unauthorized update', rating: 1 });

    expect(response.status).toBe(403);
    expect(await readReviewState(product._id)).toEqual(before);
  });

  it.each([
    ['array body', [{ comment: 'Array body' }], 'body'],
    ['numeric comment', { comment: 123 }, 'comment'],
    ['object comment', { comment: { text: 'Object comment' } }, 'comment'],
    ['numeric string rating', { rating: '5' }, 'rating'],
    ['zero rating', { rating: 0 }, 'rating'],
    ['rating above five', { rating: 6 }, 'rating'],
    ['array rating', { rating: [5] }, 'rating'],
  ])('rejects malformed update payload: %s without changing the product', async (_caseName, body, fieldPath) => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Before invalid update', rating: 4 }],
    });
    const before = await readReviewState(product._id);

    const response = await ownerAgent
      .put('/products/' + product._id + '/review/' + product.reviews[0]._id)
      .send(body);

    expectValidationError(response, fieldPath);
    expect(await readReviewState(product._id)).toEqual(before);
  });

  it('validates update payload before looking up a missing product', async () => {
    const missingProductId = new mongoose.Types.ObjectId();
    const missingReviewId = new mongoose.Types.ObjectId();
    const sentinel = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Sentinel', rating: 4 }],
    });
    const before = await readReviewState(sentinel._id);

    const response = await ownerAgent
      .put('/products/' + missingProductId + '/review/' + missingReviewId)
      .send({ rating: '5' });

    expectValidationError(response, 'rating');
    expect(await readReviewState(sentinel._id)).toEqual(before);
  });

  it('ignores unknown and client-owned fields during update', async () => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Before', rating: 3 }],
    });
    const originalReview = serialize(product.reviews[0]);
    const suppliedReviewId = new mongoose.Types.ObjectId();

    const response = await ownerAgent
      .put('/products/' + product._id + '/review/' + product.reviews[0]._id)
      .send({
        comment: 'After',
        rating: 5,
        _id: suppliedReviewId,
        email: OTHER_EMAIL,
        createdAt: '2000-01-01T00:00:00.000Z',
        unknownField: 'ignored',
      });

    expect(response.status).toBe(200);
    const updated = await Product.findById(product._id).lean();
    expect(String(updated.reviews[0]._id)).toBe(String(originalReview._id));
    expect(updated.reviews[0].email).toBe(OWNER_EMAIL);
    expect(serialize(updated.reviews[0].createdAt)).toBe(originalReview.createdAt);
    expect(updated.reviews[0].comment).toBe('After');
    expect(updated.reviews[0].rating).toBe(5);
    expect(updated.reviews[0].unknownField).toBeUndefined();
  });
});

describe('product review deletion', () => {
  it('lets the owner delete a review and recalculates aggregates', async () => {
    const product = await createProduct({
      reviews: [
        { email: OWNER_EMAIL, comment: 'Delete me', rating: 5 },
        { email: OTHER_EMAIL, comment: 'Keep me', rating: 3 },
      ],
    });
    const reviewId = product.reviews[0]._id;

    const response = await ownerAgent
      .delete('/products/' + product._id + '/review/' + reviewId);

    expect(response.status).toBe(200);
    const updated = await Product.findById(product._id).lean();
    expect(updated.reviews).toHaveLength(1);
    expect(updated.reviews[0]).toEqual(expect.objectContaining({
      email: OTHER_EMAIL,
      comment: 'Keep me',
      rating: 3,
    }));
    expect(updated.reviewCount).toBe(1);
    expect(updated.totalRating).toBe(3);
    expect(updated.averageReviews).toBe(3);
  });

  it('returns 403 when another customer tries to delete a review', async () => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Owner review', rating: 4 }],
    });
    const before = await readReviewState(product._id);

    const response = await otherAgent
      .delete('/products/' + product._id + '/review/' + product.reviews[0]._id);

    expect(response.status).toBe(403);
    expect(await readReviewState(product._id)).toEqual(before);
  });
});

describe('product review ObjectId validation', () => {
  it('returns 400 for an invalid product ObjectId on GET', async () => {
    const response = await request(app).get('/products/not-an-object-id/review');

    expectBadRequest(response);
  });

  it('returns 400 for an invalid product ObjectId on create', async () => {
    const response = await ownerAgent
      .post('/products/not-an-object-id/review/create')
      .send({ comment: 'Valid payload', rating: 4 });

    expectBadRequest(response);
  });

  it('returns 400 for an invalid product ObjectId on update', async () => {
    const response = await ownerAgent
      .put('/products/not-an-object-id/review/' + new mongoose.Types.ObjectId())
      .send({ comment: 'Valid payload', rating: 4 });

    expectBadRequest(response);
  });

  it('returns 400 for an invalid product ObjectId on delete', async () => {
    const response = await ownerAgent
      .delete('/products/not-an-object-id/review/' + new mongoose.Types.ObjectId());

    expectBadRequest(response);
  });

  it('returns 400 for an invalid review ObjectId on update without changing the product', async () => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Before', rating: 4 }],
    });
    const before = await readReviewState(product._id);

    const response = await ownerAgent
      .put('/products/' + product._id + '/review/not-an-object-id')
      .send({ comment: 'Valid payload', rating: 5 });

    expectBadRequest(response);
    expect(await readReviewState(product._id)).toEqual(before);
  });

  it('returns 400 for an invalid review ObjectId on delete without changing the product', async () => {
    const product = await createProduct({
      reviews: [{ email: OWNER_EMAIL, comment: 'Before', rating: 4 }],
    });
    const before = await readReviewState(product._id);

    const response = await ownerAgent
      .delete('/products/' + product._id + '/review/not-an-object-id');

    expectBadRequest(response);
    expect(await readReviewState(product._id)).toEqual(before);
  });
});
