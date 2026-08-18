const fs = require('fs').promises;
const path = require('path');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { EpOrder } = require('../models/eporder');
const { IpOrder } = require('../models/iporder');
const { Order } = require('../models/order');
const { Product } = require('../models/product');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const EDITOR_PHONE = '0975000031';
const CREATOR_PHONE = '0975000032';
const BLOCKED_PHONE = '0975000033';
const EDITOR_NAME = 'Product Media Editor';
const CREATOR_NAME = 'Product Media Creator';
const BLOCKED_NAME = 'Product Media Blocked';
const PRODUCT_CODE_PREFIX = 'PRODUCT-MEDIA-';
const IMAGE_DIRECTORY = path.join(__dirname, '../upload/images');
const INVOICE_DIRECTORY = path.join(__dirname, '../upload/invoices');

let editorAgent;
let creatorAgent;
let blockedAgent;
let productSequence = 0;
let mediaFileSequence = 0;
const testFilePaths = new Set();
const testDocuments = [];

const createProductImageFilename = (extension = 'webp') => {
  mediaFileSequence += 1;
  return 'product_' + (Date.now() + mediaFileSequence) + '.' + extension;
};

const createInvoiceScanFilename = () => {
  mediaFileSequence += 1;
  return 'invoice-scan-' + Date.now() + '-' + mediaFileSequence + '.webp';
};

const createTestDocument = async (Model, payload) => {
  const document = await Model.create(payload);
  testDocuments.push({ Model, id: document._id });
  return document;
};

const createAuthenticatedAgent = async ({ phone, name, permissions }) => {
  await User.create({
    phone,
    password: 'password123',
    name,
    role: 'staff',
    functions: ['product_management'],
    permissions,
  });
  const agent = request.agent(app);
  const loginResponse = await agent
    .post('/users/admin/login')
    .send({ phone, password: 'password123' });
  expect(loginResponse.status).toBe(200);
  return agent;
};

const createProduct = async ({ variants } = {}) => {
  productSequence += 1;
  return Product.create({
    type: 'PLC',
    name: 'Product Media ' + productSequence,
    code: PRODUCT_CODE_PREFIX + Date.now() + '-' + productSequence,
    brand: 'Siemens',
    section: 'Automation',
    value: 'PLC',
    warranty: '12 months',
    variant: variants || [{
      price: '100000',
      quantityForSale: 10,
      quantityInStorage: 12,
    }],
  });
};

const createTestFile = async (directory, filename) => {
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, filename);
  await fs.writeFile(filePath, 'product media test');
  testFilePaths.add(filePath);
  return filePath;
};

const cleanupTestData = async ({ includeUsers = false } = {}) => {
  await Product.deleteMany({ code: { $regex: '^' + PRODUCT_CODE_PREFIX } });
  await Promise.all(testDocuments.splice(0).map(({ Model, id }) => (
    Model.deleteOne({ _id: id })
  )));
  if (includeUsers) {
    await User.deleteMany({
      phone: { $in: [EDITOR_PHONE, CREATOR_PHONE, BLOCKED_PHONE] },
    });
  }
  await Promise.all(Array.from(testFilePaths, async (filePath) => {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
  testFilePaths.clear();
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await cleanupTestData({ includeUsers: true });
  editorAgent = await createAuthenticatedAgent({
    phone: EDITOR_PHONE,
    name: EDITOR_NAME,
    permissions: ['product.edit'],
  });
  creatorAgent = await createAuthenticatedAgent({
    phone: CREATOR_PHONE,
    name: CREATOR_NAME,
    permissions: ['product.create'],
  });
  blockedAgent = await createAuthenticatedAgent({
    phone: BLOCKED_PHONE,
    name: BLOCKED_NAME,
    permissions: ['product.delete'],
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData({ includeUsers: true });
  await mongoose.disconnect();
});

describe('Product media HTTP characterization', () => {
  it('runs upload authentication and permission before the missing-file responder', async () => {
    const unauthenticated = await request(app).post('/products/upload/image');
    const forbidden = await blockedAgent.post('/products/upload/document');
    const missingImage = await creatorAgent.post('/products/upload/image');
    const missingDocument = await editorAgent.post('/products/upload/document');

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toEqual({ message: 'Access denied, no token provided' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({
      message: 'Access denied, missing one of permissions: product.create, product.edit',
    });
    expect(missingImage.status).toBe(400);
    expect(missingImage.body).toEqual({ success: 0, message: 'Không có file được upload' });
    expect(missingDocument.status).toBe(400);
    expect(missingDocument.body).toEqual({ success: 0, message: 'Không có file được upload' });
  });

  it('runs image deletion authentication and product.edit before database access', async () => {
    const product = await createProduct();
    const findByIdSpy = jest.spyOn(Product, 'findById');

    const unauthenticated = await request(app)
      .delete('/products/' + product._id + '/0/image');
    const forbidden = await creatorAgent
      .delete('/products/' + product._id + '/0/image');

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({
      message: 'Access denied, missing permission: product.edit',
    });
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('keeps malformed, missing product, and invalid variant mappings', async () => {
    const product = await createProduct();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const malformed = await editorAgent.delete('/products/not-an-object-id/0/image');
    const missing = await editorAgent.delete(
      '/products/' + new mongoose.Types.ObjectId() + '/not-an-index/image',
    );
    const invalidIndex = await editorAgent.delete(
      '/products/' + product._id + '/not-an-index/image',
    );

    expect(malformed.status).toBe(500);
    expect(malformed.body).toEqual({ message: 'Server error' });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: 'Product not found' });
    expect(invalidIndex.status).toBe(404);
    expect(invalidIndex.body).toEqual({ message: 'Variant not found' });
  });

  it('returns the exact response when the target variant has no image', async () => {
    const product = await createProduct();

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'No image to delete' });
  });

  it('deletes the requested suffix-index image file and clears only that variant', async () => {
    const filename = createProductImageFilename();
    const filePath = await createTestFile(IMAGE_DIRECTORY, filename);
    const product = await createProduct({
      variants: [
        { price: '100000', imgUrl: '/images/keep.webp' },
        { price: '200000', imgUrl: '/images/' + filename },
      ],
    });

    const response = await editorAgent.delete(
      '/products/' + product._id + '/1suffix/image',
    );

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Image deleted successfully');
    expect(response.body.product.variant[0].imgUrl).toBe('/images/keep.webp');
    expect(response.body.product.variant[1].imgUrl).toBe('');
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('/images/keep.webp');
    expect(persisted.variant[1].imgUrl).toBe('');
  });

  it('does not unlink a product image still referenced by another product', async () => {
    const filename = createProductImageFilename();
    const filePath = await createTestFile(IMAGE_DIRECTORY, filename);
    const firstProduct = await createProduct({
      variants: [{ price: '100000', imgUrl: '/images/' + filename }],
    });
    const secondProduct = await createProduct({
      variants: [{ price: '200000', imgUrl: '/images/' + filename }],
    });

    const response = await editorAgent.delete(
      '/products/' + firstProduct._id + '/0/image',
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      message: 'Image is referenced by another product variant',
    });
    await expect(fs.access(filePath)).resolves.toBeUndefined();
    const persistedProducts = await Product.find({
      _id: { $in: [firstProduct._id, secondProduct._id] },
    }).lean();
    expect(persistedProducts).toHaveLength(2);
    persistedProducts.forEach((product) => {
      expect(product.variant[0].imgUrl).toBe('/images/' + filename);
    });
  });

  it('clears the database image even when the file is already missing', async () => {
    const filename = createProductImageFilename();
    const product = await createProduct({
      variants: [{ price: '100000', imgUrl: '/images/' + filename }],
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Image deleted successfully');
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('');
  });

  it('keeps the image file and database URL when unlink fails with a real I/O error', async () => {
    const filename = createProductImageFilename();
    const filePath = await createTestFile(IMAGE_DIRECTORY, filename);
    const product = await createProduct({
      variants: [{ price: '100000', imgUrl: '/images/' + filename }],
    });
    const unlinkError = Object.assign(new Error('forced unlink failure'), { code: 'EACCES' });
    jest.spyOn(fs, 'unlink').mockRejectedValueOnce(unlinkError);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Server error' });
    await expect(fs.access(filePath)).resolves.toBeUndefined();
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('/images/' + filename);
  });

  it('keeps the database URL when inspecting the image fails with a real I/O error', async () => {
    const filename = createProductImageFilename();
    const product = await createProduct({
      variants: [{ price: '100000', imgUrl: '/images/' + filename }],
    });
    const lstatError = Object.assign(new Error('forced lstat failure'), { code: 'EIO' });
    jest.spyOn(fs, 'lstat').mockRejectedValueOnce(lstatError);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Server error' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('/images/' + filename);
  });

  it('keeps idempotent success when the image disappears between lstat and unlink', async () => {
    const filename = createProductImageFilename();
    const filePath = await createTestFile(IMAGE_DIRECTORY, filename);
    const product = await createProduct({
      variants: [{ price: '100000', imgUrl: '/images/' + filename }],
    });
    const unlinkError = Object.assign(new Error('file disappeared'), { code: 'ENOENT' });
    jest.spyOn(fs, 'unlink').mockRejectedValueOnce(unlinkError);

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(200);
    await expect(fs.access(filePath)).resolves.toBeUndefined();
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('');
  });

  it('keeps the deleted file and original database URL split when Product save fails', async () => {
    const filename = createProductImageFilename();
    const filePath = await createTestFile(IMAGE_DIRECTORY, filename);
    const product = await createProduct({
      variants: [{ price: '100000', imgUrl: '/images/' + filename }],
    });
    jest.spyOn(Product.prototype, 'save').mockRejectedValueOnce(new Error('forced save failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Server error' });
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('/images/' + filename);
  });

  it.each([
    ['forward-slash traversal', '../../'],
    ['backslash traversal', '..\\..\\'],
    ['encoded traversal', '%2e%2e%2f%2e%2e%2f'],
  ])('blocks %s without deleting files outside the image root', async (label, traversal) => {
    const filename = 'product-media-security-' + label.replace(/[^a-z]/g, '-') + '.txt';
    const filePath = await createTestFile(path.join(__dirname, '..'), filename);
    const product = await createProduct({
      variants: [{ price: '100000', imgUrl: '/images/' + traversal + filename }],
    });

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid image path' });
    await expect(fs.access(filePath)).resolves.toBeUndefined();
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('/images/' + traversal + filename);
  });

  it.each([
    ['file URL scheme', (filename) => 'file:///C:/images/' + filename],
    ['wrong nested namespace', (filename) => '/wrong/images/' + filename],
    ['double-encoded traversal', (filename) => '/images/%252e%252e%252f' + filename],
    ['Windows alternate data stream', (filename) => '/images/' + filename + '::$DATA'],
    ['encoded NUL', (filename) => '/images/' + filename + '%00'],
  ])('rejects %s before touching a valid local product file', async (_label, buildImageUrl) => {
    const filename = createProductImageFilename();
    const filePath = await createTestFile(IMAGE_DIRECTORY, filename);
    const imageUrl = buildImageUrl(filename);
    const product = await createProduct({
      variants: [{ price: '100000', imgUrl: imageUrl }],
    });

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid image path' });
    await expect(fs.access(filePath)).resolves.toBeUndefined();
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe(imageUrl);
  });

  it('rejects non-file entries before unlinking or clearing the database URL', async () => {
    const filename = createProductImageFilename();
    const product = await createProduct({
      variants: [{ price: '100000', imgUrl: '/images/' + filename }],
    });
    jest.spyOn(fs, 'lstat').mockResolvedValueOnce({ isFile: () => false });
    const unlinkSpy = jest.spyOn(fs, 'unlink');

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid image path' });
    expect(unlinkSpy).not.toHaveBeenCalled();
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('/images/' + filename);
  });

  it('rejects image URLs outside /images and keeps the database unchanged', async () => {
    const product = await createProduct({
      variants: [{ price: '100000', imgUrl: '/other/not-a-product-image.webp' }],
    });

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid image path' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('/other/not-a-product-image.webp');
  });

  it('deletes a valid absolute legacy image URL with query and hash suffixes', async () => {
    const filename = createProductImageFilename();
    const filePath = await createTestFile(IMAGE_DIRECTORY, filename);
    const product = await createProduct({
      variants: [{
        price: '100000',
        imgUrl: 'https://legacy.example/api/images/' + filename + '?v=1#preview',
      }],
    });

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(200);
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('');
  });

  it('keeps deletion compatibility for legacy product JFIF files', async () => {
    const filename = createProductImageFilename('jfif');
    const filePath = await createTestFile(IMAGE_DIRECTORY, filename);
    const product = await createProduct({
      variants: [{ price: '100000', imgUrl: '/images/' + filename }],
    });

    const response = await editorAgent.delete('/products/' + product._id + '/0/image');

    expect(response.status).toBe(200);
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    const persisted = await Product.findById(product._id).lean();
    expect(persisted.variant[0].imgUrl).toBe('');
  });

  it('requires imageUrl before attempting temporary invoice cleanup', async () => {
    const response = await editorAgent.delete('/products/clean-temp-image');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: 0,
      message: 'Thiếu thông tin imageUrl.',
    });
  });

  it('deletes an absolute temporary invoice URL with query and hash suffixes', async () => {
    const filename = createInvoiceScanFilename();
    const filePath = await createTestFile(INVOICE_DIRECTORY, filename);
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const response = await editorAgent
      .delete('/products/clean-temp-image')
      .query({
        imageUrl: 'https://legacy.example/invoice-images/' + filename + '?cache=1#preview',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: 1,
      message: 'Đã xóa ảnh tạm thành công.',
    });
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('treats a missing temporary invoice file as successful idempotent cleanup', async () => {
    const missingFilename = createInvoiceScanFilename();
    const response = await editorAgent
      .delete('/products/clean-temp-image')
      .query({ imageUrl: '/invoice-images/' + missingFilename });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: 1,
      message: 'File không tồn tại hoặc đã được xóa.',
    });
  });

  it('returns 500 when temporary invoice unlink fails with a real I/O error', async () => {
    const filename = createInvoiceScanFilename();
    const filePath = await createTestFile(INVOICE_DIRECTORY, filename);
    const unlinkError = Object.assign(new Error('forced unlink failure'), { code: 'EIO' });
    jest.spyOn(fs, 'unlink').mockRejectedValueOnce(unlinkError);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await editorAgent
      .delete('/products/clean-temp-image')
      .query({ imageUrl: '/invoice-images/' + filename });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: 0,
      message: 'Lỗi server khi xóa ảnh tạm.',
    });
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it.each([
    ['wrong namespace', (filename) => '/nested/path/' + filename],
    ['file URL scheme', (filename) => 'file:///C:/invoice-images/' + filename],
    ['double-encoded traversal', (filename) => '/invoice-images/%252e%252e%252f' + filename],
    ['encoded NUL', (filename) => '/invoice-images/' + filename + '%00'],
  ])('rejects temporary cleanup with %s', async (_label, buildImageUrl) => {
    const filename = createInvoiceScanFilename();
    const filePath = await createTestFile(INVOICE_DIRECTORY, filename);

    const response = await editorAgent
      .delete('/products/clean-temp-image')
      .query({ imageUrl: buildImageUrl(filename) });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: 0,
      message: 'Đường dẫn ảnh tạm không hợp lệ.',
    });
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it('rejects repeated imageUrl query values', async () => {
    const firstFilename = createInvoiceScanFilename();
    const secondFilename = createInvoiceScanFilename();

    const response = await editorAgent
      .delete('/products/clean-temp-image')
      .query({
        imageUrl: [
          '/invoice-images/' + firstFilename,
          '/invoice-images/' + secondFilename,
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: 0,
      message: 'Đường dẫn ảnh tạm không hợp lệ.',
    });
  });

  it.each([
    ['sales order', Order, (filename) => ({
      orderCode: 'PRODUCT-MEDIA-ORDER-' + Date.now(),
      total: 0,
      images: ['/invoice-images/' + filename],
    })],
    ['import order', IpOrder, (filename) => ({
      userName: 'Product Media Import',
      images: ['https://legacy.example/api/invoice-images/' + filename + '?cache=1'],
    })],
    ['export order', EpOrder, (filename) => ({
      userName: 'Product Media Export',
      images: ['/api/invoice-images/' + filename + '#preview'],
    })],
  ])('does not delete a scan image referenced by a %s', async (_label, Model, payload) => {
    const filename = createInvoiceScanFilename();
    const filePath = await createTestFile(INVOICE_DIRECTORY, filename);
    await createTestDocument(Model, payload(filename));

    const response = await editorAgent
      .delete('/products/clean-temp-image')
      .query({ imageUrl: '/invoice-images/' + filename });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: 0,
      message: 'Ảnh tạm đã được sử dụng và không thể xóa.',
    });
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it.each([
    'invoice-sale-1700000000000-1001.webp',
    'invoice-manual-1700000000000-1002.webp',
    'unrelated-invoice.webp',
  ])('blocks cleanup outside the scan-temp namespace: %s', async (filename) => {
    const filePath = await createTestFile(INVOICE_DIRECTORY, filename);

    const response = await editorAgent
      .delete('/products/clean-temp-image')
      .query({ imageUrl: '/invoice-images/' + filename });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: 0,
      message: 'Đường dẫn ảnh tạm không hợp lệ.',
    });
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });
});
