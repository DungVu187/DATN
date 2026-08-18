const fs = require('fs');
const path = require('path');

jest.mock('../models/user', () => {
  const userInstances = [];
  const User = jest.fn().mockImplementation((payload) => {
    const user = {
      ...payload,
      save: jest.fn().mockResolvedValue(undefined),
      toObject: jest.fn(() => ({ ...payload })),
    };
    userInstances.push(user);
    return user;
  });
  User.findOne = jest.fn();

  return {
    User,
    canonicalizePhone: jest.fn((phone) => String(phone || '').trim()),
    isValidVietnamPhone: jest.fn(() => true),
    __userInstances: userInstances,
  };
});

jest.mock('../models/activitylog', () => {
  const activityLogSave = jest.fn();
  const ActivityLog = jest.fn().mockImplementation((payload) => ({
    ...payload,
    save: activityLogSave,
  }));

  return {
    ActivityLog,
    __activityLogSave: activityLogSave,
  };
});

jest.mock('../middlewares/auth', () => ({
  hasPermission: jest.fn(),
}));

jest.mock('../services/userProfile', () => ({
  sanitizeUserForResponse: jest.fn(),
}));

jest.mock('../services/userPasswords', () => ({
  validatePasswordPolicy: jest.fn(),
}));

jest.mock('../config/permissions', () => ({
  isGrantablePermission: jest.fn(),
  getDependency: jest.fn(),
}));

const {
  User,
  canonicalizePhone,
  isValidVietnamPhone,
  __userInstances,
} = require('../models/user');
const {
  ActivityLog,
  __activityLogSave,
} = require('../models/activitylog');
const { hasPermission } = require('../middlewares/auth');
const { sanitizeUserForResponse } = require('../services/userProfile');
const { validatePasswordPolicy } = require('../services/userPasswords');
const {
  isGrantablePermission,
  getDependency,
} = require('../config/permissions');
const userRolePolicy = require('../services/userRolePolicy');
const userAccountCreation = require('../controllers/userAccountCreation');

const {
  adminCreateUser,
  registerUser,
} = userAccountCreation;

const originalPublicSignupEnabled = process.env.PUBLIC_SIGNUP_ENABLED;

function createResponse() {
  const response = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response;
}

function createRequest(overrides = {}) {
  return {
    body: {
      phone: '0900000001',
      password: 'password123',
      name: 'Created User',
    },
    user: {
      role: 'superadmin',
      name: 'Root Admin',
      permissions: [],
    },
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

  const openingParenthesis = source.indexOf('(', start);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openingParenthesis; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        const semicolon = source.indexOf(';', index);
        return source.slice(start, semicolon === -1 ? index + 1 : semicolon + 1);
      }
    }
  }

  return '';
}

function getCreatedUserPayload() {
  return User.mock.calls[User.mock.calls.length - 1][0];
}

describe('user account creation extraction contract', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    __userInstances.length = 0;
    process.env.PUBLIC_SIGNUP_ENABLED = 'false';

    canonicalizePhone.mockImplementation((phone) => String(phone || '').trim());
    isValidVietnamPhone.mockReturnValue(true);
    validatePasswordPolicy.mockReturnValue({ valid: true });
    sanitizeUserForResponse.mockImplementation((user) => ({
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: user.role,
      functions: user.functions,
      permissions: user.permissions,
    }));
    hasPermission.mockImplementation((user, permission) => (
      Array.isArray(user.permissions) && user.permissions.includes(permission)
    ));
    isGrantablePermission.mockImplementation((permission) => new Set([
      'activitylog.view',
      'customer.create',
      'order.edit',
      'order.excel',
      'order.view',
      'product.view',
    ]).has(permission));
    getDependency.mockImplementation((permission) => (
      permission === 'order.excel' ? 'order.edit' : null
    ));
    User.findOne.mockResolvedValue(null);
    __activityLogSave.mockResolvedValue(undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    if (originalPublicSignupEnabled === undefined) {
      delete process.env.PUBLIC_SIGNUP_ENABLED;
    } else {
      process.env.PUBLIC_SIGNUP_ENABLED = originalPublicSignupEnabled;
    }
  });

  it('exports the two controllers and the role-policy constants and helpers', () => {
    expect(userAccountCreation).toEqual(expect.objectContaining({
      registerUser: expect.any(Function),
      adminCreateUser: expect.any(Function),
    }));
    expect(userRolePolicy).toEqual(expect.objectContaining({
      VALID_ROLES: expect.arrayContaining(['superadmin', 'admin', 'staff', 'customer']),
      ROLE_LEVELS: expect.objectContaining({
        customer: expect.any(Number),
        staff: expect.any(Number),
        admin: expect.any(Number),
        superadmin: expect.any(Number),
      }),
      getVisibleRolesFor: expect.any(Function),
      validateGrantablePermissions: expect.any(Function),
    }));
    expect(userRolePolicy.getVisibleRolesFor('admin')).toEqual(
      expect.arrayContaining(['admin', 'staff', 'customer'])
    );
    expect(userRolePolicy.getVisibleRolesFor('admin')).not.toContain('superadmin');
  });

  it('keeps register access control and rate limiting in the facade before registerUser', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'user.js'),
      'utf8'
    );
    const registration = getRouteRegistration(source, 'post', '/register');

    expect(source).toMatch(/require\(["']\.\.\/controllers\/userAccountCreation["']\)/);
    expect(source).toContain('process.env.PUBLIC_SIGNUP_ENABLED');
    expect(source).toContain('authenticateAdmin');
    expect(registration).not.toBe('');
    expect(registration).toContain('authLimiter');
    const accessMiddlewareCommas = (
      registration.slice(
        registration.indexOf('authLimiter') + 'authLimiter'.length,
        registration.lastIndexOf('registerUser')
      ).match(/,/g) || []
    ).length;
    expect(accessMiddlewareCommas).toBeGreaterThanOrEqual(2);
    expect(registration).toMatch(/\bregisterUser\s*\)\s*;$/);
  });

  it('keeps admin-create authentication in the facade and delegates to adminCreateUser', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'user.js'),
      'utf8'
    );
    const registration = getRouteRegistration(source, 'post', '/admin-create');

    expect(registration).not.toBe('');
    expect(registration).toContain('authenticateAdmin');
    expect(registration.lastIndexOf('adminCreateUser')).toBeGreaterThan(
      registration.lastIndexOf('authenticateAdmin')
    );
    expect(registration).toMatch(/\badminCreateUser\s*\)\s*;$/);
    expect(registration).not.toMatch(/\basync\b|=>|\bfunction\b/);
  });

  it('normalizes, trims, and de-duplicates grantable permissions', () => {
    const result = userRolePolicy.validateGrantablePermissions([
      ' order.edit ',
      'order.excel',
      'order.edit',
      'activitylog.view',
    ]);

    expect(result).toEqual({
      valid: true,
      permissions: ['order.edit', 'order.excel', 'activitylog.view'],
    });
  });

  it('rejects invalid permission collections and missing dependencies', () => {
    expect(userRolePolicy.validateGrantablePermissions('order.view')).toEqual(
      expect.objectContaining({ valid: false, message: expect.any(String) })
    );
    expect(userRolePolicy.validateGrantablePermissions(['order.excel'])).toEqual(
      expect.objectContaining({
        valid: false,
        message: expect.stringContaining('order.edit'),
      })
    );
  });

  it('forces public registration to customer and strips role and permissions', async () => {
    process.env.PUBLIC_SIGNUP_ENABLED = 'true';
    const response = createResponse();

    await registerUser(createRequest({
      user: undefined,
      body: {
        phone: ' 0900000002 ',
        password: 'password123',
        name: 'Public User',
        role: 'admin',
        permissions: ['order.view'],
      },
    }), response);

    expect(getCreatedUserPayload()).toEqual(expect.objectContaining({
      phone: '0900000002',
      role: 'customer',
      functions: [],
      permissions: [],
    }));
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'User created successfully',
      user: expect.objectContaining({ role: 'customer', permissions: [] }),
    }));
  });

  it('allows an admin to create staff with normalized grantable permissions', async () => {
    const response = createResponse();

    await adminCreateUser(createRequest({
      user: { role: 'admin', name: 'Admin User', permissions: [] },
      body: {
        phone: '0900000003',
        email: 'STAFF@EXAMPLE.COM',
        password: 'password123',
        name: 'Staff User',
        role: 'staff',
        permissions: [' order.edit ', 'order.excel', 'order.edit'],
      },
    }), response);

    expect(getCreatedUserPayload()).toEqual(expect.objectContaining({
      email: 'staff@example.com',
      role: 'staff',
      functions: [],
      permissions: ['order.edit', 'order.excel'],
    }));
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ role: 'staff' }),
    }));
  });

  it('blocks an admin from creating admin or superadmin accounts', async () => {
    for (const role of ['admin', 'superadmin']) {
      const response = createResponse();

      await adminCreateUser(createRequest({
        user: { role: 'admin', name: 'Admin User', permissions: [] },
        body: {
          phone: '0900000004',
          password: 'password123',
          role,
        },
      }), response);

      expect(response.status).toHaveBeenCalledWith(403);
    }

    expect(User).not.toHaveBeenCalled();
  });

  it('requires customer.create for staff and still limits staff to customer creation', async () => {
    const staff = { role: 'staff', name: 'Staff User', permissions: [] };
    const missingPermissionResponse = createResponse();

    await adminCreateUser(createRequest({
      user: staff,
      body: {
        phone: '0900000005',
        password: 'password123',
        role: 'customer',
      },
    }), missingPermissionResponse);

    expect(missingPermissionResponse.status).toHaveBeenCalledWith(403);
    expect(hasPermission).toHaveBeenCalledWith(staff, 'customer.create');

    staff.permissions = ['customer.create'];
    const hierarchyResponse = createResponse();
    await adminCreateUser(createRequest({
      user: staff,
      body: {
        phone: '0900000006',
        password: 'password123',
        role: 'staff',
      },
    }), hierarchyResponse);
    expect(hierarchyResponse.status).toHaveBeenCalledWith(403);

    const successResponse = createResponse();
    await adminCreateUser(createRequest({
      user: staff,
      body: {
        phone: '0900000007',
        password: 'password123',
        role: 'customer',
        permissions: ['product.view'],
      },
    }), successResponse);

    expect(getCreatedUserPayload()).toEqual(expect.objectContaining({
      role: 'customer',
      functions: [],
      permissions: [],
    }));
    expect(successResponse.status).toHaveBeenCalledWith(201);
  });

  it('rejects duplicate identities and a second superadmin before creating a user', async () => {
    User.findOne.mockResolvedValueOnce({ _id: 'duplicate-user' });
    const duplicateResponse = createResponse();

    await adminCreateUser(createRequest(), duplicateResponse);

    expect(duplicateResponse.status).toHaveBeenCalledWith(400);
    expect(User).not.toHaveBeenCalled();

    User.findOne.mockReset();
    User.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'existing-superadmin' });
    const superadminResponse = createResponse();

    await registerUser(createRequest({
      body: {
        phone: '0900000008',
        password: 'password123',
        role: 'superadmin',
      },
    }), superadminResponse);

    expect(superadminResponse.status).toHaveBeenCalledWith(400);
    expect(User).not.toHaveBeenCalled();
  });

  it('keeps admin-create successful when ActivityLog persistence fails', async () => {
    __activityLogSave.mockRejectedValue(new Error('activity log unavailable'));
    const response = createResponse();

    await adminCreateUser(createRequest({
      user: { role: 'admin', name: 'Admin User', permissions: [] },
      body: {
        phone: '0900000012',
        password: 'password123',
        name: 'Customer User',
        role: 'customer',
      },
    }), response);

    expect(ActivityLog).toHaveBeenCalledWith(expect.objectContaining({
      userName: 'Admin User',
      action: 'create_user',
      productName: 'Customer User',
      details: expect.any(Array),
    }));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'ActivityLog error in admin-create:',
      'activity log unavailable'
    );
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('maps unexpected register and admin-create failures to 500 responses', async () => {
    User.findOne.mockRejectedValue(new Error('database unavailable'));
    const registerResponse = createResponse();
    const adminCreateResponse = createResponse();

    await registerUser(createRequest(), registerResponse);
    await adminCreateUser(createRequest(), adminCreateResponse);

    for (const response of [registerResponse, adminCreateResponse]) {
      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith({ message: expect.any(String) });
    }
  });
});
