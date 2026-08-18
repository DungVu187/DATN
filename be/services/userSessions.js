const jwt = require("jsonwebtoken");

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

const createSessionToken = (user) => jwt.sign({
  userId: user._id,
  email: user.email,
  phone: user.phone,
  name: user.name,
  role: user.role,
  functions: user.functions || [],
  permissions: user.permissions || [],
}, process.env.JWT_SECRET, { expiresIn: "12h" });

module.exports = { SESSION_DURATION_MS, createSessionToken };
