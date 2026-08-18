const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../index');
const { User } = require('../components/user');

const invoiceDirectory = path.join(__dirname, '../upload/invoices');
const createdImageUrls = [];

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await User.deleteMany({});
  await Promise.all(createdImageUrls.splice(0).map(async (imageUrl) => {
    try {
      await fs.unlink(path.join(invoiceDirectory, path.basename(imageUrl)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
});

const createAdminAgent = async () => {
  const user = await User.create({
    phone: '0955000001',
    password: 'password123',
    name: 'Inventory Media Admin',
    role: 'admin',
  });
  const agent = request.agent(app);
  const loginRes = await agent
    .post('/users/admin/login')
    .send({ phone: user.phone, password: 'password123' });
  expect(loginRes.status).toBe(200);
  return agent;
};

describe('Inventory order media routes', () => {
  it('keeps upload and delete contracts shared by IPOrder and EPOrder', async () => {
    const agent = await createAdminAgent();
    const uploadRes = await agent
      .post('/iporders/upload-image')
      .attach('invoice', Buffer.from('not-a-real-image'), {
        filename: 'invoice.png',
        contentType: 'image/png',
      });

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.success).toBe(1);
    expect(uploadRes.body.imageUrl).toMatch(/^\/invoice-images\/invoice-manual-.*\.png$/);
    createdImageUrls.push(uploadRes.body.imageUrl);

    const deleteRes = await agent
      .delete('/eporders/delete-image')
      .query({ imageUrl: uploadRes.body.imageUrl });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({
      success: 1,
      message: 'Đã xóa ảnh vật lý thành công.',
    });
  });

  it('keeps missing media input and absent-file responses unchanged', async () => {
    const agent = await createAdminAgent();
    const noFileRes = await agent.post('/eporders/upload-image');
    expect(noFileRes.status).toBe(400);
    expect(noFileRes.body).toEqual({
      success: 0,
      message: 'Không có file được tải lên',
    });

    const missingUrlRes = await agent.delete('/iporders/delete-image');
    expect(missingUrlRes.status).toBe(400);
    expect(missingUrlRes.body).toEqual({
      success: 0,
      message: 'Thiếu thông tin imageUrl.',
    });

    const absentFileRes = await agent
      .delete('/eporders/delete-image')
      .query({ imageUrl: '/invoice-images/nonexistent-inventory-order-file.webp' });
    expect(absentFileRes.status).toBe(200);
    expect(absentFileRes.body).toEqual({
      success: 1,
      message: 'File không tồn tại trên ổ cứng hoặc đã được xóa.',
    });
  });
});
