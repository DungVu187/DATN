const { deleteOrderImageFile } = require('../services/orderMedia');

async function uploadOrderImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: 0, message: 'Không có file được tải lên' });
    }

    res.json({ success: 1, imageUrl: '/invoice-images/' + req.file.filename });
  } catch (error) {
    console.error('Error uploading sale order image:', error);
    res.status(500).json({ success: 0, message: 'Lỗi khi tải ảnh lên' });
  }
}

async function deleteOrderImage(req, res) {
  try {
    const { imageUrl } = req.query;
    if (!imageUrl) {
      return res.status(400).json({ success: 0, message: 'Thiếu thông tin imageUrl.' });
    }

    await deleteOrderImageFile(imageUrl);
    res.json({ success: 1, message: 'Đã xóa ảnh nếu file tồn tại.' });
  } catch (error) {
    console.error('Error deleting sale order image:', error);
    res.status(500).json({ success: 0, message: 'Lỗi khi xóa ảnh' });
  }
}

module.exports = {
  deleteOrderImage,
  uploadOrderImage,
};
