const {
  changeUserPassword,
  requestPasswordReset,
  resetUserPassword,
  validatePasswordPolicy,
} = require('../services/userPasswords');

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

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const passwordValidation = validatePasswordPolicy(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const result = await changeUserPassword(
      req.user.userId,
      currentPassword,
      newPassword
    );
    if (result.status === 'user_not_found') {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    if (result.status === 'current_password_invalid') {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
    }

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Lỗi khi đổi mật khẩu:', error.message);
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function forgotPassword(req, res) {
  try {
    if (rejectInvalidStringFields(res, req.body, ['phone', 'email', 'identifier'])) return;
    const { phone, email, identifier } = req.body;
    const input = identifier || phone || email;
    if (!input) {
      return res.status(400).json({ message: 'Vui lòng cung cấp số điện thoại hoặc email' });
    }

    const result = await requestPasswordReset(input);
    if (result.status === 'user_not_found') {
      return res.status(404).json({
        message: 'Không tìm thấy tài khoản với thông tin đã cung cấp',
      });
    }
    if (result.status === 'email_missing') {
      return res.status(400).json({
        message: 'Tài khoản của bạn chưa được cập nhật email liên kết. Vui lòng liên hệ Admin để được hỗ trợ.',
      });
    }

    res.json({
      message: `Mã OTP đã được gửi về email ${result.maskedEmail}`,
      phone: result.user.phone,
    });
  } catch (error) {
    console.error('Lỗi khi yêu cầu OTP quên mật khẩu:', error.message);
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function resetPassword(req, res) {
  try {
    if (rejectInvalidStringFields(res, req.body, ['phone', 'email', 'identifier'])) return;
    const { phone, email, identifier, otp, newPassword } = req.body;
    const input = identifier || phone || email;
    if (!input || !otp || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin yêu cầu' });
    }

    const passwordValidation = validatePasswordPolicy(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const result = await resetUserPassword(input, otp, newPassword);
    if (result.status === 'user_not_found') {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    }
    if (result.status === 'otp_invalid') {
      return res.status(400).json({
        message: 'Mã OTP không chính xác hoặc đã hết hạn',
      });
    }

    res.json({
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
    });
  } catch (error) {
    console.error('Lỗi khi đặt lại mật khẩu bằng OTP:', error.message);
    res.status(500).json({ message: 'Lỗi server' });
  }
}

module.exports = {
  changePassword,
  forgotPassword,
  resetPassword,
};
