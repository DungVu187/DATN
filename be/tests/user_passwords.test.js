const fs = require('fs');
const path = require('path');

jest.mock('crypto', () => ({
  randomInt: jest.fn(),
}));

jest.mock('../models/user', () => ({
  User: {
    findById: jest.fn(),
    findOne: jest.fn(),
  },
  canonicalizePhone: jest.fn(),
}));

jest.mock('../mailer', () => ({
  sendResetOtpEmail: jest.fn(),
}));

jest.mock('../services/userPasswords', () => ({
  validatePasswordPolicy: jest.fn(),
  changeUserPassword: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetUserPassword: jest.fn(),
}));

const crypto = require('crypto');
const { User, canonicalizePhone } = require('../models/user');
const { sendResetOtpEmail } = require('../mailer');
const mockedPasswordService = require('../services/userPasswords');
const passwordService = jest.requireActual('../services/userPasswords');
const userPasswordsController = require('../controllers/userPasswords');

const {
  changePassword,
  forgotPassword,
  resetPassword,
} = userPasswordsController;

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

describe('user password and recovery extraction contract', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReset();
    User.findOne.mockReset();
    canonicalizePhone.mockReset();
    crypto.randomInt.mockReset().mockReturnValue(654321);
    sendResetOtpEmail.mockReset().mockResolvedValue(undefined);
    for (const serviceMock of Object.values(mockedPasswordService)) {
      serviceMock.mockReset();
    }
    mockedPasswordService.validatePasswordPolicy.mockReturnValue({ valid: true });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('exposes the three controller handlers and required service operations', () => {
    expect(userPasswordsController).toEqual(expect.objectContaining({
      changePassword: expect.any(Function),
      forgotPassword: expect.any(Function),
      resetPassword: expect.any(Function),
    }));
    expect(passwordService).toEqual(expect.objectContaining({
      validatePasswordPolicy: expect.any(Function),
      changeUserPassword: expect.any(Function),
      requestPasswordReset: expect.any(Function),
      resetUserPassword: expect.any(Function),
    }));
  });

  it('keeps password routes rate-limited, authenticated where required, and external', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'user.js'),
      'utf8'
    );
    expect(
      source.includes('require("../controllers/userPasswords")')
      || source.includes("require('../controllers/userPasswords')")
    ).toBe(true);

    const routes = [
      ['put', '/change-password', 'changePassword', true],
      ['post', '/forgot-password', 'forgotPassword', false],
      ['post', '/reset-password', 'resetPassword', false],
    ];

    for (const [method, routePath, handlerName, requiresUser] of routes) {
      const registration = getRouteRegistration(source, method, routePath);
      expect(registration).not.toBe('');
      expect(registration).toContain('authLimiter');
      expect(registration.includes('authenticateUser')).toBe(requiresUser);
      expect(registration.lastIndexOf(handlerName)).toBeGreaterThan(
        registration.lastIndexOf(requiresUser ? 'authenticateUser' : 'authLimiter')
      );
      expect(registration.trim().endsWith(handlerName + ');')).toBe(true);
      expect(registration).not.toContain('async');
      expect(registration).not.toContain('=>');
      expect(registration).not.toContain('function');
    }
  });

  it('enforces the legacy minimum password policy without extra rules', () => {
    for (const invalidPassword of [undefined, null, 123456, '12345']) {
      expect(passwordService.validatePasswordPolicy(invalidPassword)).toEqual({
        valid: false,
        message: expect.any(String),
      });
    }

    expect(passwordService.validatePasswordPolicy('123456')).toEqual({ valid: true });
    expect(passwordService.validatePasswordPolicy('      ')).toEqual({ valid: true });
  });

  it('rejects weak change and reset passwords before calling mutation services', async () => {
    mockedPasswordService.validatePasswordPolicy.mockReturnValue({
      valid: false,
      message: 'weak password',
    });
    const changeResponse = createResponse();

    await changePassword(createRequest({
      body: { currentPassword: 'old-password', newPassword: 'short' },
    }), changeResponse);

    expect(changeResponse.status).toHaveBeenCalledWith(400);
    expect(changeResponse.json).toHaveBeenCalledWith({ message: 'weak password' });
    expect(mockedPasswordService.changeUserPassword).not.toHaveBeenCalled();

    const resetResponse = createResponse();
    await resetPassword(createRequest({
      body: {
        identifier: 'customer@example.com',
        otp: '123456',
        newPassword: 'short',
      },
    }), resetResponse);

    expect(resetResponse.status).toHaveBeenCalledWith(400);
    expect(resetResponse.json).toHaveBeenCalledWith({ message: 'weak password' });
    expect(mockedPasswordService.resetUserPassword).not.toHaveBeenCalled();
  });

  it('rejects a mismatched current password without changing or saving', async () => {
    const user = {
      password: 'old-password',
      comparePassword: jest.fn().mockResolvedValue(false),
      save: jest.fn(),
    };
    User.findById.mockResolvedValue(user);

    const result = await passwordService.changeUserPassword(
      'user-1',
      'wrong-password',
      'new-password'
    );

    expect(result).toEqual({ status: 'current_password_invalid' });
    expect(user.comparePassword).toHaveBeenCalledWith('wrong-password');
    expect(user.password).toBe('old-password');
    expect(user.save).not.toHaveBeenCalled();
  });

  it('changes the password and records passwordChangedAt', async () => {
    const now = new Date('2030-01-02T03:04:05.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const user = {
      password: 'old-password',
      comparePassword: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findById.mockResolvedValue(user);

    const result = await passwordService.changeUserPassword(
      'user-1',
      'old-password',
      'new-password'
    );

    expect(result).toEqual({ status: 'ok' });
    expect(user.password).toBe('new-password');
    expect(user.passwordChangedAt).toEqual(now);
    expect(user.save).toHaveBeenCalledWith();
  });

  it('canonicalizes phone recovery, creates an expiring OTP, mails it, and masks email', async () => {
    const now = new Date('2030-01-02T03:04:05.000Z');
    jest.useFakeTimers().setSystemTime(now);
    canonicalizePhone.mockReturnValue('0987654321');
    const user = {
      phone: '0987654321',
      email: 'customer@example.com',
      name: 'Customer',
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findOne.mockResolvedValue(user);

    const result = await passwordService.requestPasswordReset('0987 654 321');

    expect(canonicalizePhone).toHaveBeenCalledWith('0987 654 321');
    expect(User.findOne).toHaveBeenCalledWith({ phone: '0987654321' });
    expect(crypto.randomInt).toHaveBeenCalledWith(100000, 1000000);
    expect(user.resetOtp).toBe('654321');
    expect(user.resetOtpExpires).toBe(now.getTime() + 5 * 60 * 1000);
    expect(user.save).toHaveBeenCalledWith();
    expect(sendResetOtpEmail).toHaveBeenCalledWith(
      'customer@example.com',
      '654321',
      'Customer'
    );
    expect(result).toEqual({
      status: 'ok',
      user,
      maskedEmail: 'cu***@example.com',
    });
  });

  it('returns email_missing without generating or mailing an OTP', async () => {
    canonicalizePhone.mockReturnValue('0987654321');
    const user = {
      phone: '0987654321',
      email: '',
      save: jest.fn(),
    };
    User.findOne.mockResolvedValue(user);

    const result = await passwordService.requestPasswordReset('0987654321');

    expect(result).toEqual({ status: 'email_missing' });
    expect(crypto.randomInt).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
    expect(sendResetOtpEmail).not.toHaveBeenCalled();
  });

  it('rejects an invalid OTP without changing password state', async () => {
    const user = {
      password: 'old-password',
      resetOtp: '123456',
      resetOtpExpires: Date.now() + 60_000,
      save: jest.fn(),
    };
    User.findOne.mockResolvedValue(user);

    const result = await passwordService.resetUserPassword(
      'customer@example.com',
      '999999',
      'new-password'
    );

    expect(result).toEqual({ status: 'otp_invalid' });
    expect(user.password).toBe('old-password');
    expect(user.save).not.toHaveBeenCalled();
  });

  it('rejects an expired OTP even when its value matches', async () => {
    const now = new Date('2030-01-02T03:04:05.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const user = {
      password: 'old-password',
      resetOtp: '123456',
      resetOtpExpires: now.getTime() - 1,
      save: jest.fn(),
    };
    User.findOne.mockResolvedValue(user);

    const result = await passwordService.resetUserPassword(
      'customer@example.com',
      '123456',
      'new-password'
    );

    expect(result).toEqual({ status: 'otp_invalid' });
    expect(user.password).toBe('old-password');
    expect(user.save).not.toHaveBeenCalled();
  });

  it('resets the password, records the change, and clears OTP fields', async () => {
    const now = new Date('2030-01-02T03:04:05.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const user = {
      password: 'old-password',
      resetOtp: '123456',
      resetOtpExpires: now.getTime() + 60_000,
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findOne.mockResolvedValue(user);

    const result = await passwordService.resetUserPassword(
      'CUSTOMER@EXAMPLE.COM',
      '123456',
      'new-password'
    );

    expect(User.findOne).toHaveBeenCalledWith({ email: 'customer@example.com' });
    expect(result).toEqual({ status: 'ok' });
    expect(user.password).toBe('new-password');
    expect(user.passwordChangedAt).toEqual(now);
    expect(user.resetOtp).toBeUndefined();
    expect(user.resetOtpExpires).toBeUndefined();
    expect(user.save).toHaveBeenCalledWith();
  });

  it('maps expected service outcomes to controller status codes and messages', async () => {
    mockedPasswordService.changeUserPassword.mockResolvedValue({ status: 'user_not_found' });
    const changeResponse = createResponse();
    await changePassword(createRequest({
      body: { currentPassword: 'old-password', newPassword: 'new-password' },
    }), changeResponse);
    expect(changeResponse.status).toHaveBeenCalledWith(404);
    expect(changeResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.any(String),
    }));

    mockedPasswordService.requestPasswordReset.mockResolvedValue({ status: 'email_missing' });
    const forgotResponse = createResponse();
    await forgotPassword(createRequest({
      body: { identifier: '0987654321' },
    }), forgotResponse);
    expect(forgotResponse.status).toHaveBeenCalledWith(400);
    expect(forgotResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.any(String),
    }));

    mockedPasswordService.resetUserPassword.mockResolvedValue({ status: 'otp_invalid' });
    const resetResponse = createResponse();
    await resetPassword(createRequest({
      body: {
        identifier: '0987654321',
        otp: '123456',
        newPassword: 'new-password',
      },
    }), resetResponse);
    expect(resetResponse.status).toHaveBeenCalledWith(400);
    expect(resetResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.any(String),
    }));
  });

  it('returns stable success messages and the masked recovery destination', async () => {
    mockedPasswordService.changeUserPassword.mockResolvedValue({ status: 'ok' });
    const changeResponse = createResponse();
    await changePassword(createRequest({
      body: { currentPassword: 'old-password', newPassword: 'new-password' },
    }), changeResponse);
    expect(changeResponse.status).not.toHaveBeenCalled();
    expect(changeResponse.json).toHaveBeenCalledWith({ message: expect.any(String) });

    mockedPasswordService.requestPasswordReset.mockResolvedValue({
      status: 'ok',
      user: { phone: '0987654321' },
      maskedEmail: 'cu***@example.com',
    });
    const forgotResponse = createResponse();
    await forgotPassword(createRequest({
      body: { identifier: 'customer@example.com' },
    }), forgotResponse);
    expect(forgotResponse.status).not.toHaveBeenCalled();
    expect(forgotResponse.json).toHaveBeenCalledWith({
      message: expect.stringContaining('cu***@example.com'),
      phone: '0987654321',
    });

    mockedPasswordService.resetUserPassword.mockResolvedValue({ status: 'ok' });
    const resetResponse = createResponse();
    await resetPassword(createRequest({
      body: {
        identifier: 'customer@example.com',
        otp: '123456',
        newPassword: 'new-password',
      },
    }), resetResponse);
    expect(resetResponse.status).not.toHaveBeenCalled();
    expect(resetResponse.json).toHaveBeenCalledWith({ message: expect.any(String) });
  });

  it('maps unexpected service failures from all three handlers to status 500', async () => {
    const cases = [
      [
        changePassword,
        'changeUserPassword',
        { currentPassword: 'old-password', newPassword: 'new-password' },
      ],
      [forgotPassword, 'requestPasswordReset', { identifier: 'customer@example.com' }],
      [
        resetPassword,
        'resetUserPassword',
        {
          identifier: 'customer@example.com',
          otp: '123456',
          newPassword: 'new-password',
        },
      ],
    ];

    for (const [handler, serviceMethod, body] of cases) {
      mockedPasswordService[serviceMethod].mockRejectedValueOnce(new Error('forced failure'));
      const response = createResponse();

      await handler(createRequest({ body }), response);

      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.any(String),
      }));
    }
  });
});
