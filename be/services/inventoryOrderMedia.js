const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');

const invoiceStorage = multer.diskStorage({
  destination: './upload/invoices',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.webp';
    cb(null, 'invoice-manual-' + uniqueSuffix + ext);
  },
});

const uploadInventoryOrderInvoice = multer({
  storage: invoiceStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, webp).'));
    }
  },
});

async function deleteInventoryOrderImageFile(imageUrl) {
  const filename = path.basename(imageUrl);
  const filePath = path.join(__dirname, '../upload/invoices', filename);

  try {
    await fs.stat(filePath);
    await fs.unlink(filePath);
    return { deleted: true, filename };
  } catch (error) {
    return { deleted: false, filename };
  }
}

module.exports = {
  deleteInventoryOrderImageFile,
  uploadInventoryOrderInvoice,
};
