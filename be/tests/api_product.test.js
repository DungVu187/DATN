const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
process.env.ADDRESS = 'http://localhost:5000';
const app = require('../index');
const { Product } = require('../components/product');
const { User } = require('../components/user');
const { StorageHistory } = require('../components/storagehistory');
const { ADMIN_TEST_PERMISSIONS } = require('./fixtures/adminPermissions');
const uploadedDocumentPaths = [];
const uploadedImagePaths = [];

beforeAll(async () => {
  const url = 'mongodb://localhost:27017/EcomTest';
  await mongoose.connect(url);
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await Product.deleteMany({});
  await User.deleteMany({});
  await StorageHistory.deleteMany({});
  const uploadedFilePaths = [
    ...uploadedDocumentPaths.splice(0),
    ...uploadedImagePaths.splice(0)
  ];
  await Promise.all(uploadedFilePaths.map(async (filePath) => {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
});

const createProductPayload = (overrides = {}) => ({
  type: 'PLC',
  name: `Permission Product ${Date.now()} ${Math.random()}`,
  brand: 'Siemens',
  section: 'Automation',
  value: 'PLC',
  code: `PERM-${Date.now()}-${Math.random()}`,
  warranty: '12 months',
  variant: [{
    price: '100000',
    color: 'Gray',
    quantityForSale: 10,
    quantityInStorage: 10
  }],
  ...overrides
});

const createProductDoc = async (overrides = {}) => Product.create(createProductPayload(overrides));

const createStaffAgent = async ({ phone, permissions = [], functions = ['product_management'] }) => {
  await new User({
    phone,
    password: 'password123',
    name: `Staff ${phone}`,
    role: 'staff',
    functions,
    permissions
  }).save();

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/users/admin/login')
    .send({ phone, password: 'password123' });

  expect(loginRes.status).toBe(200);
  expect(loginRes.headers['set-cookie']).toBeDefined();
  return agent;
};

describe('Products API Tests (Phase 4)', () => {
  it('returns import prices only from the permission-protected inventory batch endpoint', async () => {
    const product = await createProductDoc({
      code: 'INVENTORY-PRICE-DETAIL',
      variant: [{
        price: '125000',
        importPrice: '100000',
        earn: 25,
        color: 'Gray',
        quantityForSale: 10,
        quantityInStorage: 10
      }]
    });
    const allowedAgent = await createStaffAgent({
      phone: '0987654301',
      permissions: ['iporder.view']
    });
    const blockedAgent = await createStaffAgent({
      phone: '0987654302',
      permissions: ['product.view']
    });

    const allowed = await allowedAgent
      .post('/products/fetch-inventory-by-ids')
      .send({ ids: [product._id.toString()] });

    expect(allowed.status).toBe(200);
    expect(allowed.body.products).toHaveLength(1);
    expect(allowed.body.products[0].variant[0]).toMatchObject({
      importPrice: '100000',
      price: '125000',
      earn: 25
    });

    const blocked = await blockedAgent
      .post('/products/fetch-inventory-by-ids')
      .send({ ids: [product._id.toString()] });

    expect(blocked.status).toBe(403);
  });

  it('Test Case 7: GET /products phân trang và bộ lọc hoạt động chính xác', async () => {
    // 1. Thêm một vài sản phẩm mẫu trực tiếp vào DB test
    const productsToInsert = [];
    for (let i = 1; i <= 15; i++) {
      productsToInsert.push({
        type: 'PLC',
        name: `Sản phẩm PLC thứ ${i}`,
        brand: i % 2 === 0 ? 'Siemens' : 'Mitsubishi',
        section: 'Thiết bị tự động hóa',
        value: 'PLC',
        warranty: '12 tháng',
        variant: [{
          price: '5000000',
          color: 'Xám',
          quantityForSale: 10,
          quantityInStorage: 10
        }]
      });
    }
    await Product.insertMany(productsToInsert);

    const adminUser = new User({
      phone: '0987654323',
      password: 'password123',
      role: 'admin',
      permissions: [...ADMIN_TEST_PERMISSIONS]
    });
    await adminUser.save();

    const adminToken = jwt.sign(
      { userId: adminUser._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    // 2. Gửi request GET phân trang (limit = 10, page = 1)
    const resPage1 = await request(app)
      .get('/products')
      .set('Cookie', [`authToken=${adminToken}`])
      .query({ page: 1, limit: 10 });

    expect(resPage1.status).toBe(200);
    expect(resPage1.body.total).toBe(15);
    expect(resPage1.body.page).toBe(1);
    expect(resPage1.body.limit).toBe(10);
    expect(resPage1.body.products).toHaveLength(10);

    // 3. Gửi request GET phân trang (limit = 10, page = 2)
    const resPage2 = await request(app)
      .get('/products')
      .set('Cookie', [`authToken=${adminToken}`])
      .query({ page: 2, limit: 10 });

    expect(resPage2.status).toBe(200);
    expect(resPage2.body.total).toBe(15);
    expect(resPage2.body.page).toBe(2);
    expect(resPage2.body.limit).toBe(10);
    expect(resPage2.body.products).toHaveLength(5);

    // 4. Gửi request lọc theo brand 'Siemens'
    const resBrand = await request(app)
      .get('/products')
      .set('Cookie', [`authToken=${adminToken}`])
      .query({ brand: 'Siemens' });

    expect(resBrand.status).toBe(200);
    // Có 15 sản phẩm, số chẵn từ 1 đến 15 là 2, 4, 6, 8, 10, 12, 14 (7 sản phẩm)
    expect(resBrand.body.total).toBe(7);
  });

  it('Test Case 8: POST /products/create yêu cầu quyền admin', async () => {
    const newProductData = {
      type: 'HMI',
      name: 'Màn hình Siemens HMI KTP700',
      brand: 'Siemens',
      section: 'Thiết bị hiển thị',
      value: 'HMI',
      vat: '10%',
      warranty: '12 tháng',
      variant: [{
        price: '8000000',
        color: 'Xám',
        quantityForSale: 5,
        quantityInStorage: 5
      }]
    };

    // 1. Thử tạo khi chưa đăng nhập (không gửi cookie)
    const resUnauthenticated = await request(app)
      .post('/products/create')
      .send(newProductData);
    expect(resUnauthenticated.status).toBe(401);

    // 2. Thử tạo với tài khoản customer thường
    const customerUser = new User({
      phone: '0987654324',
      password: 'password123',
      role: 'customer'
    });
    await customerUser.save();

    const customerToken = jwt.sign(
      { userId: customerUser._id, role: 'customer' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    const resForbidden = await request(app)
      .post('/products/create')
      .set('Cookie', [`authToken=${customerToken}`])
      .send(newProductData);
    expect(resForbidden.status).toBe(403);

    // 3. Thử tạo với tài khoản admin
    const adminUser = new User({
      phone: '0987654325',
      password: 'password123',
      role: 'admin',
      permissions: [...ADMIN_TEST_PERMISSIONS]
    });
    await adminUser.save();

    const adminToken = jwt.sign(
      { userId: adminUser._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    const resSuccess = await request(app)
      .post('/products/create')
      .set('Cookie', [`authToken=${adminToken}`])
      .send(newProductData);

    expect(resSuccess.status).toBe(201);
    expect(resSuccess.body.message).toBe('Product created successfully');
    expect(resSuccess.body.product.name).toBe('Màn hình Siemens HMI KTP700');
    expect(resSuccess.body.product.vat).toBe('10%');
    expect(resSuccess.body.product.variant[0].earn).toBe(25);

    // Kiểm tra xem sản phẩm đã lưu vào cơ sở dữ liệu chưa
    const productInDb = await Product.findOne({ name: 'Màn hình Siemens HMI KTP700' });
    expect(productInDb).toBeDefined();
    expect(productInDb.brand).toBe('Siemens');
    expect(productInDb.vat).toBe('10%');
    expect(productInDb.variant[0].earn).toBe(25);
  });

  it('Test Case 9: POST /products/create ngăn chặn tạo trùng mã sản phẩm và trả về 409', async () => {
    const adminUser = new User({
      phone: '0987654326',
      password: 'password123',
      role: 'admin',
      permissions: [...ADMIN_TEST_PERMISSIONS]
    });
    await adminUser.save();

    const adminToken = jwt.sign(
      { userId: adminUser._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    const product1 = {
      type: 'PLC',
      name: 'Siemens PLC S7-1200',
      brand: 'Siemens',
      section: 'Thiết bị tự động hóa',
      value: 'PLC',
      code: 'S71200-DUP',
      warranty: '12 tháng',
      variant: [{ price: '6000000', color: 'Xám', quantityForSale: 10, quantityInStorage: 10 }]
    };

    // 1. Tạo sản phẩm đầu tiên thành công (201)
    const res1 = await request(app)
      .post('/products/create')
      .set('Cookie', [`authToken=${adminToken}`])
      .send(product1);
    expect(res1.status).toBe(201);

    // 2. Thử tạo sản phẩm thứ hai trùng mã (code: 'S71200-DUP') -> Phải trả về 409
    const product2 = {
      ...product1,
      name: 'Siemens PLC S7-1200 V2'
    };

    const res2 = await request(app)
      .post('/products/create')
      .set('Cookie', [`authToken=${adminToken}`])
      .send(product2);

    expect(res2.status).toBe(409);
    expect(res2.body.message).toContain('đã tồn tại');
  });

  it('staff with product.create can create products and staff without it gets 403', async () => {
    const allowedAgent = await createStaffAgent({
      phone: '0987654331',
      permissions: ['product.create']
    });
    const blockedAgent = await createStaffAgent({
      phone: '0987654332',
      permissions: []
    });

    const allowed = await allowedAgent
      .post('/products/create')
      .send(createProductPayload({ name: 'Staff Product Create OK', code: 'STAFF-CREATE-OK' }));

    expect(allowed.status).toBe(201);
    expect(allowed.body.product.name).toBe('Staff Product Create OK');

    const blocked = await blockedAgent
      .post('/products/create')
      .send(createProductPayload({ name: 'Staff Product Create Blocked', code: 'STAFF-CREATE-BLOCKED' }));

    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Access denied, missing permission: product.create');
  });

  it('staff with product.edit can edit products and create-only staff cannot edit', async () => {
    const product = await createProductDoc({ name: 'Editable Product', code: 'EDITABLE-PRODUCT' });
    const allowedAgent = await createStaffAgent({
      phone: '0987654333',
      permissions: ['product.edit']
    });
    const createOnlyAgent = await createStaffAgent({
      phone: '0987654334',
      permissions: ['product.create']
    });

    const allowed = await allowedAgent
      .put(`/products/${product._id}`)
      .send({ name: 'Edited Product' });

    expect(allowed.status).toBe(200);
    expect(allowed.body.name).toBe('Edited Product');

    const blocked = await createOnlyAgent
      .put(`/products/${product._id}`)
      .send({ name: 'Blocked Edit Product' });

    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Access denied, missing permission: product.edit');
  });

  it('creates and updates the documents field without removing legacy infoDoc data', async () => {
    const createAgent = await createStaffAgent({
      phone: '0987654343',
      permissions: ['product.create', 'product.edit']
    });
    const initialDocuments = [
      { label: 'Hướng dẫn', url: 'https://example.com/manual', sourceType: 'link' },
      { label: 'Thông số.pdf', url: 'https://example.com/spec.pdf', sourceType: 'file' }
    ];

    const created = await createAgent
      .post('/products/create')
      .send(createProductPayload({
        name: 'Product With Documents',
        code: 'PRODUCT-WITH-DOCUMENTS',
        documents: initialDocuments,
        infoDoc: { manual: 'https://legacy.example.com/manual' }
      }));

    expect(created.status).toBe(201);
    expect(created.body.product.documents).toEqual(expect.arrayContaining([
      expect.objectContaining(initialDocuments[0]),
      expect.objectContaining(initialDocuments[1])
    ]));

    const updatedDocuments = [
      { label: 'Catalog mới', url: 'https://example.com/catalog', sourceType: 'link' }
    ];
    const updated = await createAgent
      .put(`/products/${created.body.product._id}`)
      .send({ documents: updatedDocuments });

    expect(updated.status).toBe(200);
    expect(updated.body.documents).toEqual([
      expect.objectContaining(updatedDocuments[0])
    ]);
    expect(updated.body.infoDoc.manual).toBe('https://legacy.example.com/manual');
  });

  it('uploads PNG images and rejects invalid MIME, extension, or files larger than 4MB', async () => {
    const agent = await createStaffAgent({
      phone: '0987654345',
      permissions: ['product.create']
    });

    const invalidMime = await agent
      .post('/products/upload/image')
      .attach('product', Buffer.from('not an image'), {
        filename: 'product.png',
        contentType: 'text/plain'
      });

    expect(invalidMime.status).toBe(400);
    expect(invalidMime.body).toEqual({
      success: 0,
      message: 'Chỉ cho phép upload ảnh: .jpg, .jpeg, .png, .webp, .gif, .avif'
    });

    const invalidExtension = await agent
      .post('/products/upload/image')
      .attach('product', Buffer.from('not an image'), {
        filename: 'product.txt',
        contentType: 'image/png'
      });

    expect(invalidExtension.status).toBe(400);
    expect(invalidExtension.body).toEqual({
      success: 0,
      message: 'Chỉ cho phép upload ảnh: .jpg, .jpeg, .png, .webp, .gif, .avif'
    });

    const oversized = await agent
      .post('/products/upload/image')
      .attach('product', Buffer.alloc((4 * 1024 * 1024) + 1, 1), {
        filename: 'oversized.png',
        contentType: 'image/png'
      });

    expect(oversized.status).toBe(400);
    expect(oversized.body).toEqual({ success: 0, message: 'Dung lượng ảnh tối đa 4MB' });

    const uploaded = await agent
      .post('/products/upload/image')
      .attach('product', Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
      ]), {
        filename: 'product.png',
        contentType: 'image/png'
      });

    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toEqual({
      success: 1,
      imgUrl: expect.stringMatching(/^http:\/\/localhost:5000\/images\/product_\d+\.png$/)
    });

    const filename = path.basename(new URL(uploaded.body.imgUrl).pathname);
    const uploadedPath = path.join(__dirname, '../upload/images', filename);
    uploadedImagePaths.push(uploadedPath);
    await expect(fs.access(uploadedPath)).resolves.toBeUndefined();

    const publicImage = await request(app).get(`/images/${filename}`);
    expect(publicImage.status).toBe(200);
    expect(publicImage.headers['content-type']).toContain('image/png');
  });

  it('uploads PDF documents and rejects invalid type or files larger than 20MB', async () => {
    const agent = await createStaffAgent({
      phone: '0987654344',
      permissions: ['product.create']
    });

    const invalidType = await agent
      .post('/products/upload/document')
      .attach('document', Buffer.from('not a pdf'), {
        filename: 'document.txt',
        contentType: 'text/plain'
      });

    expect(invalidType.status).toBe(400);
    expect(invalidType.body).toEqual({ success: 0, message: 'Chỉ cho phép upload file PDF' });

    const oversized = await agent
      .post('/products/upload/document')
      .attach('document', Buffer.alloc((20 * 1024 * 1024) + 1, 1), {
        filename: 'oversized.pdf',
        contentType: 'application/pdf'
      });

    expect(oversized.status).toBe(400);
    expect(oversized.body).toEqual({ success: 0, message: 'Dung lượng file tối đa 20MB' });

    const uploaded = await agent
      .post('/products/upload/document')
      .attach('document', Buffer.from('%PDF-1.4\nTSmart document test'), {
        filename: 'technical-document.pdf',
        contentType: 'application/pdf'
      });

    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toMatchObject({
      success: 1,
      fileName: 'technical-document.pdf'
    });
    expect(uploaded.body.url).toMatch(/^http:\/\/localhost:5000\/documents\/document_\d+\.pdf$/);

    const filename = path.basename(new URL(uploaded.body.url).pathname);
    const uploadedPath = path.join(__dirname, '../upload/documents', filename);
    uploadedDocumentPaths.push(uploadedPath);
    await expect(fs.access(uploadedPath)).resolves.toBeUndefined();

    const publicDocument = await request(app).get(`/documents/${filename}`);
    expect(publicDocument.status).toBe(200);
    expect(publicDocument.headers['content-type']).toContain('application/pdf');
  });

  it('staff with product.delete can delete products and staff without it gets 403', async () => {
    const deletable = await createProductDoc({ name: 'Deletable Product', code: 'DELETABLE-PRODUCT' });
    const protectedProduct = await createProductDoc({ name: 'Protected Product', code: 'PROTECTED-PRODUCT' });
    const allowedAgent = await createStaffAgent({
      phone: '0987654335',
      permissions: ['product.delete']
    });
    const blockedAgent = await createStaffAgent({
      phone: '0987654336',
      permissions: ['product.edit']
    });

    const allowed = await allowedAgent.delete(`/products/${deletable._id}`);
    expect(allowed.status).toBe(200);
    expect(await Product.findById(deletable._id)).toBeNull();

    const blocked = await blockedAgent.delete(`/products/${protectedProduct._id}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Access denied, missing permission: product.delete');
    expect(await Product.findById(protectedProduct._id)).toBeDefined();
  });

  it('scan invoice accepts iporder/eporder scan permission and blocks the rest (sales order has no AI scan)', async () => {
    // Quyền cũ order.scan_ai còn sót trong DB cũng không được quét nữa
    const orderScanAgent = await createStaffAgent({
      phone: '0987654337',
      permissions: ['order.edit', 'order.scan_ai']
    });
    const iporderScanAgent = await createStaffAgent({
      phone: '0987654338',
      permissions: ['iporder.scan_ai']
    });
    const eporderScanAgent = await createStaffAgent({
      phone: '0987654339',
      permissions: ['eporder.scan_ai']
    });
    const blockedAgent = await createStaffAgent({
      phone: '0987654340',
      permissions: []
    });

    const orderScan = await orderScanAgent.post('/products/scan-invoice');
    expect(orderScan.status).toBe(403);

    const iporderScan = await iporderScanAgent.post('/products/scan-invoice');
    expect(iporderScan.status).not.toBe(403);

    const eporderScan = await eporderScanAgent.post('/products/scan-invoice');
    expect(eporderScan.status).not.toBe(403);

    const blocked = await blockedAgent.post('/products/scan-invoice');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe(
      'Access denied, missing one of permissions: iporder.scan_ai, eporder.scan_ai'
    );
  });

  it('DELETE /products/clean-temp-image requires product.edit', async () => {
    const agent = await createStaffAgent({
      phone: '0987654341',
      permissions: ['product.create']
    });

    const res = await agent
      .delete('/products/clean-temp-image')
      .query({ imageUrl: '/invoice-images/temp.webp' });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied, missing permission: product.edit');
  });

  it('POST /products/:id/:variantIndex rejects a zero inventory change without writing history', async () => {
    const product = await createProductDoc({ name: 'Zero Change Product', code: 'ZERO-CHANGE-PRODUCT' });
    const agent = await createStaffAgent({
      phone: '0987654342',
      permissions: ['product.edit']
    });

    const res = await agent
      .post(`/products/${product._id}/0`)
      .send({ quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Số lượng thay đổi phải khác 0' });

    const unchangedProduct = await Product.findById(product._id);
    expect(unchangedProduct.variant[0].quantityForSale).toBe(10);
    expect(unchangedProduct.variant[0].quantityInStorage).toBe(10);
    expect(await StorageHistory.countDocuments({ productId: product._id })).toBe(0);
  });
});
describe('Product code normalized duplicate validation', () => {
  it('rejects equivalent codes ignoring spaces and symbols on create and update', async () => {
    const adminUser = new User({
      phone: '0987654328',
      password: 'password123',
      role: 'admin',
      permissions: [...ADMIN_TEST_PERMISSIONS]
    });
    await adminUser.save();

    const adminToken = jwt.sign(
      { userId: adminUser._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    const baseProduct = {
      type: 'PLC',
      name: 'Normalized Code Product A',
      brand: 'Siemens',
      section: 'Automation',
      value: 'PLC',
      code: 'S7 1200 NORM',
      warranty: '12 months',
      variant: [{ price: '6000000', color: 'Gray', quantityForSale: 10, quantityInStorage: 10 }]
    };

    const res1 = await request(app)
      .post('/products/create')
      .set('Cookie', [`authToken=${adminToken}`])
      .send(baseProduct);
    expect(res1.status).toBe(201);

    const resDuplicateCreate = await request(app)
      .post('/products/create')
      .set('Cookie', [`authToken=${adminToken}`])
      .send({
        ...baseProduct,
        name: 'Normalized Code Product B',
        code: 's7-1200norm'
      });
    expect(resDuplicateCreate.status).toBe(409);
    expect(resDuplicateCreate.body.message).toBeTruthy();

    const resOther = await request(app)
      .post('/products/create')
      .set('Cookie', [`authToken=${adminToken}`])
      .send({
        ...baseProduct,
        name: 'Normalized Code Product C',
        code: 'OTHER-NORM-CODE'
      });
    expect(resOther.status).toBe(201);

    const resDuplicateUpdate = await request(app)
      .put(`/products/${resOther.body.product._id}`)
      .set('Cookie', [`authToken=${adminToken}`])
      .send({ code: 'S71200NORM' });
    expect(resDuplicateUpdate.status).toBe(409);
    expect(resDuplicateUpdate.body.message).toBeTruthy();
  });
});
