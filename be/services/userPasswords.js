const crypto = require("crypto");
const { User, canonicalizePhone } = require("../models/user");

const validatePasswordPolicy = (password) => {
  if (typeof password !== "string" || password.length < 6) {
    return { valid: false, message: "Mật khẩu phải có ít nhất 6 ký tự" };
  }
  return { valid: true };
};

const findUserByRecoveryInput = async (input) => {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
  if (isEmail) {
    return User.findOne({ email: input.toLowerCase() });
  }
  return User.findOne({ phone: canonicalizePhone(input) });
};

const changeUserPassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId);
  if (!user) return { status: "user_not_found" };

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) return { status: "current_password_invalid" };

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  return { status: "ok" };
};

const requestPasswordReset = async (input) => {
  const user = await findUserByRecoveryInput(input);
  if (!user) return { status: "user_not_found" };
  if (!user.email) return { status: "email_missing" };

  const otp = crypto.randomInt(100000, 1000000).toString();
  user.resetOtp = otp;
  user.resetOtpExpires = Date.now() + 5 * 60 * 1000;
  await user.save();

  const { sendResetOtpEmail } = require("../mailer");
  await sendResetOtpEmail(user.email, otp, user.name);

  const emailParts = user.email.split("@");
  const maskedEmail = emailParts[0].substring(0, 2) + "***@" + emailParts[1];

  return { status: "ok", user, maskedEmail };
};

const resetUserPassword = async (input, otp, newPassword) => {
  const user = await findUserByRecoveryInput(input);
  if (!user) return { status: "user_not_found" };

  if (
    !user.resetOtp ||
    user.resetOtp !== otp ||
    !user.resetOtpExpires ||
    user.resetOtpExpires < Date.now()
  ) {
    return { status: "otp_invalid" };
  }

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  user.resetOtp = undefined;
  user.resetOtpExpires = undefined;
  await user.save();

  return { status: "ok" };
};

module.exports = {
  validatePasswordPolicy,
  changeUserPassword,
  requestPasswordReset,
  resetUserPassword,
};
