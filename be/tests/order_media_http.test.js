const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = require('../index');
const { User } = require('../models/user');

const DATABASE_URL = 'mongodb://localhost:27017/EcomTest';
const EDITOR_PHONE = '0985100001';
const VIEWER_PHONE = '0985100002';
const USER_PHONES = [EDITOR_PHONE, VIEWER_PHONE];
const PASSWORD = 'password123';
const INVOICE_DIRECTORY = path.join(__dirname, '../upload/invoices');

let editorAgent;
let viewerAgent;
const createdFiles = new Set();

const cleanupFiles = async () => {
  await Promise.all(Array.from(createdFiles).map(async (filePath) => {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
  createdFiles.clear();
};

const createStaffAgent = async (phone, permissions) => {
  await User.create({
    phone,
    password: PASSWORD,
    name: 'Order Media Staff ' + phone,
    role: 'staff',
    functions: ['order_management'],
    permissions,
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/users/admin/login')
    .send({ phone, password: PASSWORD });
  expect(login.status).toBe(200);
  return agent;
};

beforeAll(async () => {
  await mongoose.connect(DATABASE_URL);
  await fs.promises.mkdir(INVOICE_DIRECTORY, { recursive: true });
  await User.deleteMany({ phone: { $in: USER_PHONES } });
  editorAgent = await createStaffAgent(EDITOR_PHONE, ['order.edit']);
  viewerAgent = await createStaffAgent(VIEWER_PHONE, ['order.view']);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupFiles();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await cleanupFiles();
  await User.deleteMany({ phone: { $in: USER_PHONES } });
  await mongoose.disconnect();
});

describe('Order image upload/delete HTTP characterization', () => {
  it('requires order.edit before upload and delete handlers', async () => {
    const upload = await viewerAgent.post('/orders/upload-image');
    const remove = await viewerAgent
      .delete('/orders/delete-image')
      .query({ imageUrl: '/invoice-images/sample.webp' });

    for (const response of [upload, remove]) {
      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied, missing permission: order.edit');
    }
  });

  it('returns the legacy 400 response when no invoice file is attached', async () => {
    const response = await editorAgent.post('/orders/upload-image');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: 0, message: 'Không có file được tải lên' });
  });

  it('rejects a non-image MIME type in upload middleware', async () => {
    const response = await editorAgent
      .post('/orders/upload-image')
      .attach('invoice', Buffer.from('not-an-image'), {
        filename: 'order-media.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: 0, message: 'Chỉ chấp nhận file ảnh (jpg, png, webp).' });
  });

  it('rejects files larger than the legacy 5MB limit', async () => {
    const response = await editorAgent
      .post('/orders/upload-image')
      .attach('invoice', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'order-media-large.webp',
        contentType: 'image/webp',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: 0, message: 'File too large' });
  });

  it('stores a valid image with the legacy invoice-sale filename', async () => {
    const response = await editorAgent
      .post('/orders/upload-image')
      .attach('invoice', Buffer.from('order-media-image'), {
        filename: 'receipt.webp',
        contentType: 'image/webp',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(1);
    expect(response.body.imageUrl).toMatch(/^\/invoice-images\/invoice-sale-\d+-\d+\.webp$/);
    const filePath = path.join(INVOICE_DIRECTORY, path.basename(response.body.imageUrl));
    createdFiles.add(filePath);
    await expect(fs.promises.access(filePath)).resolves.toBeUndefined();
  });

  it('deletes an existing image and remains idempotent when it is already missing', async () => {
    const filename = 'invoice-sale-' + Date.now() + '-delete.webp';
    const filePath = path.join(INVOICE_DIRECTORY, filename);
    createdFiles.add(filePath);
    await fs.promises.writeFile(filePath, 'order-media-delete');

    const first = await editorAgent
      .delete('/orders/delete-image')
      .query({ imageUrl: '/invoice-images/' + filename });
    const second = await editorAgent
      .delete('/orders/delete-image')
      .query({ imageUrl: '/invoice-images/' + filename });

    for (const response of [first, second]) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: 1, message: 'Đã xóa ảnh nếu file tồn tại.' });
    }
    await expect(fs.promises.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('maps missing imageUrl and unlink failures to legacy responses', async () => {
    const missingUrl = await editorAgent.delete('/orders/delete-image');
    expect(missingUrl.status).toBe(400);
    expect(missingUrl.body).toEqual({ success: 0, message: 'Thiếu thông tin imageUrl.' });

    jest.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(new Error('forced unlink failure'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const failedDelete = await editorAgent
      .delete('/orders/delete-image')
      .query({ imageUrl: '/invoice-images/failure.webp' });
    expect(failedDelete.status).toBe(500);
    expect(failedDelete.body).toEqual({ success: 0, message: 'Lỗi khi xóa ảnh' });
  });
});
