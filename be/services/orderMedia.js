const multer = require('multer');
const path = require('path');
const fs = require('fs');

const invoiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../upload/invoices');
    fs.mkdir(uploadDir, { recursive: true }, (error) => cb(error, uploadDir));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.webp';
    cb(null, 'invoice-sale-' + uniqueSuffix + ext);
  },
});

const uploadInvoice = multer({
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

const handleInvoiceUpload = (req, res, next) => {
  uploadInvoice.single('invoice')(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: 0,
        message: error.message || 'File ảnh không hợp lệ',
      });
    }
    next();
  });
};

const deleteOrderImageFile = async (imageUrl) => {
  const filename = path.basename(String(imageUrl));
  const filePath = path.join(__dirname, '../upload/invoices', filename);

  try {
    await fs.promises.unlink(filePath);
  } catch (fileError) {
    if (fileError.code !== 'ENOENT') {
      throw fileError;
    }
  }
};

module.exports = {
  deleteOrderImageFile,
  handleInvoiceUpload,
};
