const { User, canonicalizePhone, isValidVietnamPhone } = require('../models/user');
const { ActivityLog } = require('../models/activitylog');
const { hasPermission } = require('../middlewares/auth');
const { sanitizeUserForResponse } = require('../services/userProfile');
const { validatePasswordPolicy } = require('../services/userPasswords');
const { validateGrantablePermissions } = require('../services/userRolePolicy');

const INVALID_PHONE_MESSAGE = 'Số điện thoại không hợp lệ. Vui lòng nhập số điện thoại Việt Nam gồm 10-11 chữ số, bắt đầu bằng 0.';

const hasNonStringField = (source, fields) => fields.some((field) => (
  source[field] !== undefined
  && source[field] !== null
  && typeof source[field] !== 'string'
));

const rejectInvalidStringFields = (res, source, fields) => {
  if (hasNonStringField(source, fields)) {
    res.status(400).json({ message: 'Thông tin tìm kiếm không hợp lệ' });
    return true;
  }
  return false;
};

const findExistingUser = (phone, email) => User.findOne({
  $or: [
    { phone },
    ...(email ? [{ email: email.toLowerCase() }] : []),
  ],
});

const hasExistingSuperadmin = async () => Boolean(
  await User.findOne({ role: 'superadmin' })
);

async function registerUser(req, res) {
  try {
    if (rejectInvalidStringFields(res, req.body, ['phone', 'email'])) return;
    const {
      email,
      phone,
      name,
      password,
      role,
      permissions,
    } = req.body;

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const canonicalPhone = canonicalizePhone(phone);
    if (!isValidVietnamPhone(phone)) {
      return res.status(400).json({ message: INVALID_PHONE_MESSAGE });
    }

    if (await findExistingUser(canonicalPhone, email)) {
      return res.status(400).json({ message: 'Email hoặc số điện thoại đã tồn tại' });
    }

    let finalRole = 'customer';
    let finalPermissions = [];

    if (process.env.PUBLIC_SIGNUP_ENABLED !== 'true' && req.user) {
      if (req.user.role === 'superadmin') {
        finalRole = role || 'customer';
      } else if (req.user.role === 'admin') {
        if (role === 'superadmin' || role === 'admin') {
          return res.status(403).json({
            message: 'Admin chỉ được phép tạo tài khoản Staff hoặc Customer',
          });
        }
        finalRole = role || 'customer';
      } else if (req.user.role === 'staff') {
        if (role && role !== 'customer') {
          return res.status(403).json({
            message: 'Nhân viên chỉ được tạo tài khoản khách hàng',
          });
        }
        if (!hasPermission(req.user, 'customer.create')) {
          return res.status(403).json({
            message: 'Access denied, missing permission: customer.create',
          });
        }
        finalRole = 'customer';
      } else {
        finalRole = 'customer';
      }
    } else {
      finalRole = 'customer';
    }

    if (finalRole === 'admin' || finalRole === 'staff') {
      if (permissions !== undefined) {
        const result = validateGrantablePermissions(permissions);
        if (!result.valid) {
          return res.status(400).json({ message: result.message });
        }
        finalPermissions = result.permissions;
      }
    }

    if (finalRole === 'superadmin' && await hasExistingSuperadmin()) {
      return res.status(400).json({
        message: 'Hệ thống chỉ được phép có duy nhất 1 tài khoản Super Admin',
      });
    }

    const newUser = new User({
      email,
      phone: canonicalPhone,
      name,
      password,
      role: finalRole,
      functions: [],
      permissions: finalPermissions,
    });
    await newUser.save();

    res.status(201).json({
      message: 'User created successfully',
      user: sanitizeUserForResponse(newUser),
    });
  } catch (error) {
    console.error('Error in register:', error.message);
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function adminCreateUser(req, res) {
  try {
    if (rejectInvalidStringFields(res, req.body, ['phone', 'email'])) return;
    const { email, phone, name, password, role, permissions } = req.body;

    if (!['superadmin', 'admin', 'staff'].includes(req.user.role)) {
      return res.status(403).json({
        message: 'Bạn không có quyền thực hiện chức năng này',
      });
    }

    if (req.user.role === 'admin') {
      if (role === 'superadmin' || role === 'admin') {
        return res.status(403).json({
          message: 'Admin chỉ được phép tạo tài khoản Staff hoặc Customer',
        });
      }
    } else if (req.user.role === 'staff') {
      if (role && role !== 'customer') {
        return res.status(403).json({
          message: 'Nhân viên chỉ được tạo tài khoản khách hàng',
        });
      }
      if (!hasPermission(req.user, 'customer.create')) {
        return res.status(403).json({
          message: 'Access denied, missing permission: customer.create',
        });
      }
    }

    if (!phone || !password) {
      return res.status(400).json({
        message: 'Số điện thoại và mật khẩu là bắt buộc',
      });
    }

    const canonicalPhone = canonicalizePhone(phone);
    if (!isValidVietnamPhone(phone)) {
      return res.status(400).json({ message: INVALID_PHONE_MESSAGE });
    }

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    if (await findExistingUser(canonicalPhone, email)) {
      return res.status(400).json({ message: 'Email hoặc số điện thoại đã tồn tại' });
    }

    const finalRole = req.user.role === 'staff' ? 'customer' : role || 'customer';
    if (finalRole === 'superadmin' && await hasExistingSuperadmin()) {
      return res.status(400).json({
        message: 'Hệ thống chỉ được phép có duy nhất 1 tài khoản Super Admin',
      });
    }

    let finalPermissions = [];
    if ((finalRole === 'admin' || finalRole === 'staff') && permissions !== undefined) {
      const result = validateGrantablePermissions(permissions);
      if (!result.valid) {
        return res.status(400).json({ message: result.message });
      }
      finalPermissions = result.permissions;
    }

    const newUser = new User({
      email: email ? email.toLowerCase() : undefined,
      phone: canonicalPhone,
      name,
      password,
      role: finalRole,
      functions: [],
      permissions: finalPermissions,
    });
    await newUser.save();

    try {
      await new ActivityLog({
        userName: req.user.name,
        action: 'create_user',
        productName: newUser.name || newUser.phone,
        details: [{
          field: 'Tạo tài khoản',
          oldValue: '',
          newValue: `${newUser.name || ''}, SĐT: ${newUser.phone}, Vai trò: ${newUser.role}`,
        }],
      }).save();
    } catch (logError) {
      console.error('ActivityLog error in admin-create:', logError.message);
    }

    res.status(201).json({
      message: 'Tạo tài khoản thành công',
      user: sanitizeUserForResponse(newUser),
    });
  } catch (error) {
    console.error('Lỗi khi admin tạo tài khoản:', error.message);
    res.status(500).json({ message: 'Lỗi server' });
  }
}

module.exports = {
  adminCreateUser,
  registerUser,
};
