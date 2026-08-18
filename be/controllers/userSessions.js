const { User, canonicalizePhone } = require('../models/user');
const { getCookieOptions } = require('../middlewares/auth');
const {
  SESSION_DURATION_MS,
  createSessionToken,
} = require('../services/userSessions');

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

async function loginUser(req, res) {
  try {
    if (rejectInvalidStringFields(res, req.body, ['phone', 'email'])) return;
    const { phone, email, password } = req.body;
    const identifier = phone || email;
    if (!identifier) {
      return res.status(400).json({ message: 'Vui lòng nhập số điện thoại hoặc email' });
    }

    let user;
    if (phone) {
      user = await User.findOne({ phone: canonicalizePhone(phone) });
    } else if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
    }

    if (!user) {
      return res.status(400).json({ message: 'Thông tin đăng nhập không hợp lệ' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Thông tin đăng nhập không hợp lệ' });
    }

    const token = createSessionToken(user);
    res.cookie('authToken', token, getCookieOptions(req, SESSION_DURATION_MS));
    res.json({ message: 'Đăng nhập thành công' });
  } catch (error) {
    console.error('Lỗi trong đăng nhập:', error.message);
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function loginAdmin(req, res) {
  try {
    if (rejectInvalidStringFields(res, req.body, ['phone'])) return;
    const { phone, password } = req.body;
    const user = await User.findOne({ phone: canonicalizePhone(phone) });
    if (!user || (user.role !== 'superadmin' && user.role !== 'admin' && user.role !== 'staff')) {
      return res.status(403).json({ message: 'Truy cập bị từ chối. Chỉ dành cho admin hoặc nhân viên' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Thông tin đăng nhập không hợp lệ' });
    }

    const token = createSessionToken(user);
    res.cookie('authToken', token, getCookieOptions(req, SESSION_DURATION_MS));
    res.json({ message: 'Đăng nhập admin thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

function logoutUser(req, res) {
  res.clearCookie('authToken', getCookieOptions(req, null));
  res.json({ message: 'Logout successful' });
}

module.exports = {
  loginAdmin,
  loginUser,
  logoutUser,
};
