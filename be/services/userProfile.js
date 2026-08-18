const { User } = require("../models/user");

const sanitizeUserForResponse = (user) => {
  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.password;
  delete userObj.resetOtp;
  delete userObj.resetOtpExpires;
  return userObj;
};

const getUserProfile = async (userId) => {
  return User.findById(userId);
};

const updateUserProfile = async (userId, profile) => {
  const { name, email } = profile;
  const user = await User.findById(userId);
  if (!user) return { status: "user_not_found" };

  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;

  await user.save();
  return { status: "ok", user };
};

const addUserAddress = async (userId, addressInput) => {
  const {
    label,
    receiverName,
    receiverPhone,
    provinceCode,
    provinceName,
    wardCode,
    wardName,
    addressLine,
    addressDetail,
  } = addressInput;
  const user = await User.findById(userId);
  if (!user) return { status: "user_not_found" };

  user.addresses.push({
    label: label || "Địa chỉ",
    receiverName,
    receiverPhone,
    provinceCode,
    provinceName,
    wardCode,
    wardName,
    addressLine,
    addressDetail,
    isDefault: user.addresses.length === 0,
  });

  await user.save();
  return { status: "ok", user };
};

const updateUserAddress = async (userId, addressId, addressInput) => {
  const {
    label,
    receiverName,
    receiverPhone,
    provinceCode,
    provinceName,
    wardCode,
    wardName,
    addressLine,
    addressDetail,
  } = addressInput;
  const user = await User.findById(userId);
  if (!user) return { status: "user_not_found" };

  const address = user.addresses.id(addressId);
  if (!address) return { status: "address_not_found" };

  if (label !== undefined) address.label = label;
  if (receiverName !== undefined) address.receiverName = receiverName;
  if (receiverPhone !== undefined) address.receiverPhone = receiverPhone;
  if (provinceCode !== undefined) address.provinceCode = provinceCode;
  if (provinceName !== undefined) address.provinceName = provinceName;
  if (wardCode !== undefined) address.wardCode = wardCode;
  if (wardName !== undefined) address.wardName = wardName;
  if (addressLine !== undefined) address.addressLine = addressLine;
  if (addressDetail !== undefined) address.addressDetail = addressDetail;

  await user.save();
  return { status: "ok", user };
};

const deleteUserAddress = async (userId, addressId) => {
  const user = await User.findById(userId);
  if (!user) return { status: "user_not_found" };

  const addressIndex = user.addresses.findIndex(
    (address) => address._id.toString() === addressId
  );
  if (addressIndex === -1) return { status: "address_not_found" };

  const wasDefault = user.addresses[addressIndex].isDefault;
  user.addresses.splice(addressIndex, 1);

  if (wasDefault && user.addresses.length > 0) {
    user.addresses[0].isDefault = true;
  }

  await user.save();
  return { status: "ok", user };
};

const setDefaultUserAddress = async (userId, addressId) => {
  const user = await User.findById(userId);
  if (!user) return { status: "user_not_found" };

  let found = false;
  user.addresses.forEach((address) => {
    if (address._id.toString() === addressId) {
      address.isDefault = true;
      found = true;
    } else {
      address.isDefault = false;
    }
  });

  if (!found) return { status: "address_not_found" };

  await user.save();
  return { status: "ok", user };
};

module.exports = {
  sanitizeUserForResponse,
  getUserProfile,
  updateUserProfile,
  addUserAddress,
  updateUserAddress,
  deleteUserAddress,
  setDefaultUserAddress,
};
