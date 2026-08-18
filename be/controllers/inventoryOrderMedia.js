const {
  deleteInventoryOrderImageFile,
} = require('../services/inventoryOrderMedia');

function uploadInventoryOrderImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: 0, message: 'Không có file được tải lên' });
    }
    const imageUrl = '/invoice-images/' + req.file.filename;
    res.json({ success: 1, imageUrl });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi upload ảnh' });
  }
}

const createDeleteInventoryOrderImageHandler = (source) => async (req, res) => {
  try {
    const { imageUrl } = req.query;
    if (!imageUrl) {
      return res.status(400).json({ success: 0, message: 'Thiếu thông tin imageUrl.' });
    }

    const result = await deleteInventoryOrderImageFile(imageUrl);
    if (result.deleted) {
      console.log('[' + source + '] Đã xóa thành công tệp ảnh hóa đơn vật lý: ' + result.filename);
      return res.json({ success: 1, message: 'Đã xóa ảnh vật lý thành công.' });
    }
    return res.json({ success: 1, message: 'File không tồn tại trên ổ cứng hoặc đã được xóa.' });
  } catch (error) {
    res.status(500).json({ success: 0, message: 'Lỗi server khi xóa ảnh vật lý' });
  }
};

const deleteIpOrderImage = createDeleteInventoryOrderImageHandler('iporder');
const deleteEpOrderImage = createDeleteInventoryOrderImageHandler('eporder');

module.exports = {
  deleteEpOrderImage,
  deleteIpOrderImage,
  uploadInventoryOrderImage,
};
