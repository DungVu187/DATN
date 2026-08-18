const fs = require('fs');
const path = require('path');

jest.mock('../models/user', () => ({
  User: {
    findById: jest.fn(),
  },
}));

jest.mock('../services/userProfile', () => ({
  sanitizeUserForResponse: jest.fn(),
  getUserProfile: jest.fn(),
  updateUserProfile: jest.fn(),
  addUserAddress: jest.fn(),
  updateUserAddress: jest.fn(),
  deleteUserAddress: jest.fn(),
  setDefaultUserAddress: jest.fn(),
}));

const { User } = require('../models/user');
const mockedProfileService = require('../services/userProfile');
const profileService = jest.requireActual('../services/userProfile');
const userProfileController = require('../controllers/userProfile');

const {
  getProfile,
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = userProfileController;

function createResponse() {
  const response = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response;
}

function createRequest(overrides = {}) {
  return {
    user: { userId: 'user-1' },
    body: {},
    params: { addressId: 'address-1' },
    ...overrides,
  };
}

function getRouteRegistration(source, method, routePath) {
  const prefixes = [
    'router.' + method + '("' + routePath + '"',
    "router." + method + "('" + routePath + "'",
  ];
  const start = prefixes
    .map((prefix) => source.indexOf(prefix))
    .find((index) => index !== -1);
  if (start === undefined) return '';

  const end = source.indexOf(';', start);
  return end === -1 ? '' : source.slice(start, end + 1);
}

function createAddress(id, isDefault, overrides = {}) {
  return {
    _id: { toString: () => id },
    label: 'Nhà riêng',
    receiverName: 'Nguyễn Văn A',
    receiverPhone: '0900000000',
    addressDetail: 'Số 1',
    isDefault,
    ...overrides,
  };
}

describe('user profile and addresses extraction contract', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReset();
    for (const serviceMock of Object.values(mockedProfileService)) {
      serviceMock.mockReset();
    }
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('exposes the six controller handlers and the service operations they use', () => {
    expect(userProfileController).toEqual(expect.objectContaining({
      getProfile: expect.any(Function),
      updateProfile: expect.any(Function),
      addAddress: expect.any(Function),
      updateAddress: expect.any(Function),
      deleteAddress: expect.any(Function),
      setDefaultAddress: expect.any(Function),
    }));
    expect(profileService).toEqual(expect.objectContaining({
      sanitizeUserForResponse: expect.any(Function),
      getUserProfile: expect.any(Function),
      updateUserProfile: expect.any(Function),
      addUserAddress: expect.any(Function),
      updateUserAddress: expect.any(Function),
      deleteUserAddress: expect.any(Function),
      setDefaultUserAddress: expect.any(Function),
    }));
  });

  it('keeps all six facade routes authenticated and delegated to external handlers', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'user.js'),
      'utf8'
    );
    expect(
      source.includes('require("../controllers/userProfile")')
      || source.includes("require('../controllers/userProfile')")
    ).toBe(true);

    const routes = [
      ['get', '/profile', 'getProfile'],
      ['put', '/profile', 'updateProfile'],
      ['post', '/profile/addresses', 'addAddress'],
      ['put', '/profile/addresses/:addressId', 'updateAddress'],
      ['delete', '/profile/addresses/:addressId', 'deleteAddress'],
      ['put', '/profile/addresses/:addressId/default', 'setDefaultAddress'],
    ];

    for (const [method, routePath, handlerName] of routes) {
      const registration = getRouteRegistration(source, method, routePath);
      expect(registration).not.toBe('');
      expect(registration).toContain('authenticateUser');
      expect(registration.lastIndexOf(handlerName)).toBeGreaterThan(
        registration.lastIndexOf('authenticateUser')
      );
      expect(registration.trim().endsWith(handlerName + ');')).toBe(true);
      expect(registration).not.toContain('async');
      expect(registration).not.toContain('=>');
      expect(registration).not.toContain('function');
    }
  });

  it('sanitizes sensitive fields without mutating the source document', () => {
    const source = {
      _id: 'user-1',
      name: 'Customer',
      password: 'hashed-password',
      resetOtp: '123456',
      resetOtpExpires: new Date('2030-01-01T00:00:00.000Z'),
    };
    const document = { toObject: jest.fn(() => ({ ...source })) };

    const sanitized = profileService.sanitizeUserForResponse(document);

    expect(document.toObject).toHaveBeenCalledWith();
    expect(sanitized).toEqual({ _id: 'user-1', name: 'Customer' });
    expect(source).toHaveProperty('password', 'hashed-password');
  });

  it('returns the sanitized profile from the controller', async () => {
    const user = { _id: 'user-1', password: 'secret' };
    const publicUser = { _id: 'user-1' };
    mockedProfileService.getUserProfile.mockResolvedValue(user);
    mockedProfileService.sanitizeUserForResponse.mockReturnValue(publicUser);
    const response = createResponse();

    await getProfile(createRequest(), response);

    expect(mockedProfileService.getUserProfile).toHaveBeenCalledWith('user-1');
    expect(mockedProfileService.sanitizeUserForResponse).toHaveBeenCalledWith(user);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(publicUser);
  });

  it('maps missing users and addresses to 404 responses', async () => {
    mockedProfileService.updateUserProfile.mockResolvedValue({ status: 'user_not_found' });
    const missingUserResponse = createResponse();

    await updateProfile(createRequest({ body: { name: 'Updated' } }), missingUserResponse);

    expect(missingUserResponse.status).toHaveBeenCalledWith(404);
    expect(missingUserResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.any(String),
    }));

    mockedProfileService.updateUserAddress.mockResolvedValue({ status: 'address_not_found' });
    const missingAddressResponse = createResponse();

    await updateAddress(createRequest(), missingAddressResponse);

    expect(missingAddressResponse.status).toHaveBeenCalledWith(404);
    expect(missingAddressResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('returns 404 when the requested profile is null', async () => {
    mockedProfileService.getUserProfile.mockResolvedValue(null);
    const response = createResponse();

    await getProfile(createRequest(), response);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('treats an empty profile update as a no-op save', async () => {
    const user = {
      name: 'Original name',
      email: 'original@example.com',
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findById.mockResolvedValue(user);

    const result = await profileService.updateUserProfile('user-1', {});

    expect(result).toEqual({ status: 'ok', user });
    expect(user.name).toBe('Original name');
    expect(user.email).toBe('original@example.com');
    expect(user.save).toHaveBeenCalledWith();
  });

  it('applies null and empty-string profile values when explicitly provided', async () => {
    const user = {
      name: 'Original name',
      email: 'original@example.com',
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findById.mockResolvedValue(user);

    const result = await profileService.updateUserProfile('user-1', {
      name: null,
      email: '',
    });

    expect(result).toEqual({ status: 'ok', user });
    expect(user.name).toBeNull();
    expect(user.email).toBe('');
    expect(user.save).toHaveBeenCalledWith();
  });

  it('makes the first address default and applies the legacy label fallback', async () => {
    const user = {
      addresses: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findById.mockResolvedValue(user);

    const result = await profileService.addUserAddress('user-1', {
      label: '',
      receiverName: 'Nguyễn Văn A',
      receiverPhone: '0900000000',
      provinceCode: undefined,
      provinceName: undefined,
      wardCode: undefined,
      wardName: undefined,
      addressLine: undefined,
      addressDetail: 'Số 1',
      isDefault: false,
    });

    expect(result).toEqual({ status: 'ok', user });
    expect(user.addresses).toEqual([
      {
        label: 'Địa chỉ',
        receiverName: 'Nguyễn Văn A',
        receiverPhone: '0900000000',
        addressDetail: 'Số 1',
        isDefault: true,
      },
    ]);
    expect(user.save).toHaveBeenCalledWith();
  });

  it('returns 201 with the persisted addresses after adding an address', async () => {
    const addresses = [createAddress('address-1', true)];
    mockedProfileService.addUserAddress.mockResolvedValue({
      status: 'ok',
      user: { addresses },
    });
    const response = createResponse();
    const body = { receiverName: 'Nguyễn Văn A' };

    await addAddress(createRequest({ body }), response);

    expect(mockedProfileService.addUserAddress).toHaveBeenCalledWith('user-1', body);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ addresses }));
  });

  it('updates only provided address fields without changing its default state', async () => {
    const address = createAddress('address-1', true);
    const addresses = [address];
    addresses.id = jest.fn().mockReturnValue(address);
    const user = {
      addresses,
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findById.mockResolvedValue(user);

    const result = await profileService.updateUserAddress('user-1', 'address-1', {
      receiverName: 'Tên mới',
      isDefault: false,
    });

    expect(result).toEqual({ status: 'ok', user });
    expect(address).toEqual(expect.objectContaining({
      label: 'Nhà riêng',
      receiverName: 'Tên mới',
      receiverPhone: '0900000000',
      addressDetail: 'Số 1',
      isDefault: true,
    }));
    expect(user.save).toHaveBeenCalledWith();
  });

  it('promotes the first remaining address after deleting the default address', async () => {
    const defaultAddress = createAddress('address-1', true);
    const fallbackAddress = createAddress('address-2', false);
    const user = {
      addresses: [defaultAddress, fallbackAddress],
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findById.mockResolvedValue(user);

    const result = await profileService.deleteUserAddress('user-1', 'address-1');

    expect(result).toEqual({ status: 'ok', user });
    expect(user.addresses).toEqual([fallbackAddress]);
    expect(fallbackAddress.isDefault).toBe(true);
    expect(user.save).toHaveBeenCalledWith();
  });

  it('sets exactly the requested address as default', async () => {
    const firstAddress = createAddress('address-1', true);
    const secondAddress = createAddress('address-2', false);
    const user = {
      addresses: [firstAddress, secondAddress],
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findById.mockResolvedValue(user);

    const result = await profileService.setDefaultUserAddress('user-1', 'address-2');

    expect(result).toEqual({ status: 'ok', user });
    expect(firstAddress.isDefault).toBe(false);
    expect(secondAddress.isDefault).toBe(true);
    expect(user.save).toHaveBeenCalledWith();
  });

  it('maps unexpected service failures from all six handlers to status 500', async () => {
    const cases = [
      [getProfile, 'getUserProfile'],
      [updateProfile, 'updateUserProfile'],
      [addAddress, 'addUserAddress'],
      [updateAddress, 'updateUserAddress'],
      [deleteAddress, 'deleteUserAddress'],
      [setDefaultAddress, 'setDefaultUserAddress'],
    ];

    for (const [handler, serviceMethod] of cases) {
      mockedProfileService[serviceMethod].mockRejectedValueOnce(new Error('forced failure'));
      const response = createResponse();

      await handler(createRequest(), response);

      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.any(String),
      }));
    }
  });
});
