const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User } = require('../models/user');

const TEST_PHONES = ['0938100001', '0938100002'];

const createAgent = async (phone) => {
  await User.create({
    phone,
    password: 'password123',
    name: 'Profile HTTP User',
    email: 'profile-http@example.com',
    role: 'customer',
    resetOtp: '123456',
    resetOtpExpires: new Date(Date.now() + 60_000),
  });

  const agent = request.agent(app);
  const loginResponse = await agent
    .post('/users/login')
    .send({ phone, password: 'password123' });

  expect(loginResponse.status).toBe(200);
  return agent;
};

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
  await User.deleteMany({ phone: { $in: TEST_PHONES } });
});

afterEach(async () => {
  await User.deleteMany({ phone: { $in: TEST_PHONES } });
});

afterAll(async () => {
  await User.deleteMany({ phone: { $in: TEST_PHONES } });
  await mongoose.disconnect();
});

describe('User profile and address HTTP lifecycle', () => {
  it('updates the profile and persists the complete address lifecycle', async () => {
    const agent = await createAgent(TEST_PHONES[0]);

    const profileResponse = await agent.get('/users/profile');
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body).not.toHaveProperty('password');
    expect(profileResponse.body).not.toHaveProperty('resetOtp');
    expect(profileResponse.body).not.toHaveProperty('resetOtpExpires');

    const updateProfileResponse = await agent
      .put('/users/profile')
      .send({ name: 'Updated Profile User', email: 'updated-profile@example.com' });
    expect(updateProfileResponse.status).toBe(200);
    expect(updateProfileResponse.body.user).toEqual(expect.objectContaining({
      name: 'Updated Profile User',
      email: 'updated-profile@example.com',
    }));

    const firstAddressResponse = await agent
      .post('/users/profile/addresses')
      .send({
        label: '',
        receiverName: 'Receiver One',
        receiverPhone: '0900000001',
        provinceCode: '79',
        provinceName: 'Hồ Chí Minh',
        wardCode: '26734',
        wardName: 'Bến Thành',
        addressLine: '123 Nguyễn Huệ',
        addressDetail: '123 Nguyễn Huệ, Bến Thành, Hồ Chí Minh',
        isDefault: false,
      });
    expect(firstAddressResponse.status).toBe(201);
    expect(firstAddressResponse.body.addresses).toHaveLength(1);
    expect(firstAddressResponse.body.addresses[0]).toEqual(expect.objectContaining({
      label: 'Địa chỉ',
      provinceCode: '79',
      wardCode: '26734',
      isDefault: true,
    }));

    const secondAddressResponse = await agent
      .post('/users/profile/addresses')
      .send({
        label: 'Kho',
        receiverName: 'Receiver Two',
        receiverPhone: '0900000002',
        addressDetail: 'Address Two',
        isDefault: true,
      });
    expect(secondAddressResponse.status).toBe(201);
    expect(secondAddressResponse.body.addresses).toHaveLength(2);
    expect(secondAddressResponse.body.addresses[1].isDefault).toBe(false);

    const secondAddressId = secondAddressResponse.body.addresses[1]._id;
    const updateAddressResponse = await agent
      .put('/users/profile/addresses/' + secondAddressId)
      .send({ receiverName: 'Updated Receiver Two', isDefault: true });
    expect(updateAddressResponse.status).toBe(200);
    expect(updateAddressResponse.body.addresses[1]).toEqual(expect.objectContaining({
      receiverName: 'Updated Receiver Two',
      isDefault: false,
    }));

    const defaultResponse = await agent
      .put('/users/profile/addresses/' + secondAddressId + '/default');
    expect(defaultResponse.status).toBe(200);
    expect(defaultResponse.body.addresses.map((address) => address.isDefault)).toEqual([
      false,
      true,
    ]);

    const deleteResponse = await agent
      .delete('/users/profile/addresses/' + secondAddressId);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.addresses).toHaveLength(1);
    expect(deleteResponse.body.addresses[0].isDefault).toBe(true);

    const persistedUser = await User.findOne({ phone: TEST_PHONES[0] }).lean();
    expect(persistedUser).toEqual(expect.objectContaining({
      name: 'Updated Profile User',
      email: 'updated-profile@example.com',
    }));
    expect(persistedUser.addresses).toHaveLength(1);
    expect(persistedUser.addresses[0].label).toBe('Địa chỉ');
    expect(persistedUser.addresses[0].isDefault).toBe(true);
  });

  it('returns 404 for a missing address without persisting changes', async () => {
    const agent = await createAgent(TEST_PHONES[1]);
    const missingAddressId = new mongoose.Types.ObjectId().toString();

    const responses = await Promise.all([
      agent.put('/users/profile/addresses/' + missingAddressId).send({ label: 'Missing' }),
      agent.delete('/users/profile/addresses/' + missingAddressId),
      agent.put('/users/profile/addresses/' + missingAddressId + '/default'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    const persistedUser = await User.findOne({ phone: TEST_PHONES[1] }).lean();
    expect(persistedUser.addresses).toEqual([]);
  });
});
