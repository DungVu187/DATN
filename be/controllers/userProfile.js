const {
  addUserAddress,
  deleteUserAddress,
  getUserProfile,
  sanitizeUserForResponse,
  setDefaultUserAddress,
  updateUserAddress,
  updateUserProfile,
} = require('../services/userProfile');

const sendUserNotFound = (res) => (
  res.status(404).json({ message: 'Không tìm thấy người dùng' })
);

const sendAddressNotFound = (res) => (
  res.status(404).json({ message: 'Không tìm thấy địa chỉ' })
);

async function getProfile(req, res) {
  try {
    const user = await getUserProfile(req.user.userId);
    if (!user) return sendUserNotFound(res);
    res.json(sanitizeUserForResponse(user));
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function updateProfile(req, res) {
  try {
    const result = await updateUserProfile(req.user.userId, req.body);
    if (result.status === 'user_not_found') return sendUserNotFound(res);

    res.json({
      message: 'Cập nhật thông tin cá nhân thành công',
      user: sanitizeUserForResponse(result.user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function addAddress(req, res) {
  try {
    const result = await addUserAddress(req.user.userId, req.body);
    if (result.status === 'user_not_found') return sendUserNotFound(res);

    res.status(201).json({
      message: 'Thêm địa chỉ thành công',
      addresses: result.user.addresses,
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function updateAddress(req, res) {
  try {
    const result = await updateUserAddress(
      req.user.userId,
      req.params.addressId,
      req.body
    );
    if (result.status === 'user_not_found') return sendUserNotFound(res);
    if (result.status === 'address_not_found') return sendAddressNotFound(res);

    res.json({
      message: 'Cập nhật địa chỉ thành công',
      addresses: result.user.addresses,
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function deleteAddress(req, res) {
  try {
    const result = await deleteUserAddress(req.user.userId, req.params.addressId);
    if (result.status === 'user_not_found') return sendUserNotFound(res);
    if (result.status === 'address_not_found') return sendAddressNotFound(res);

    res.json({
      message: 'Xóa địa chỉ thành công',
      addresses: result.user.addresses,
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

async function setDefaultAddress(req, res) {
  try {
    const result = await setDefaultUserAddress(req.user.userId, req.params.addressId);
    if (result.status === 'user_not_found') return sendUserNotFound(res);
    if (result.status === 'address_not_found') return sendAddressNotFound(res);

    res.json({
      message: 'Đã đặt địa chỉ làm mặc định',
      addresses: result.user.addresses,
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
}

module.exports = {
  addAddress,
  deleteAddress,
  getProfile,
  setDefaultAddress,
  updateAddress,
  updateProfile,
};
