const fs = require('fs');
const multer = require('multer');
const path = require('path');

const {
    PRODUCT_DOCUMENT_UPLOAD_SETTINGS,
    PRODUCT_IMAGE_UPLOAD_SETTINGS,
} = require('../config/imageUpload');

const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../upload/images');
        fs.mkdir(uploadDir, { recursive: true }, (error) => cb(error, uploadDir));
    },
    filename: (req, file, cb) => {
        return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
    },
});

const uploadImage = multer({
    storage: imageStorage,
    limits: { fileSize: PRODUCT_IMAGE_UPLOAD_SETTINGS.maxSizeBytes },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        const isAllowedMime = PRODUCT_IMAGE_UPLOAD_SETTINGS.allowedMimeTypes.includes(file.mimetype);
        const isAllowedExtension = PRODUCT_IMAGE_UPLOAD_SETTINGS.allowedExtensions.includes(extension);

        if (!isAllowedMime || !isAllowedExtension) {
            return cb(new Error(`Chỉ cho phép upload ảnh: ${PRODUCT_IMAGE_UPLOAD_SETTINGS.allowedExtensions.join(', ')}`));
        }
        cb(null, true);
    },
});

const handleProductImageUpload = (req, res, next) => {
    uploadImage.single('product')(req, res, (error) => {
        if (error) {
            const message = error.code === 'LIMIT_FILE_SIZE'
                ? `Dung lượng ảnh tối đa ${PRODUCT_IMAGE_UPLOAD_SETTINGS.maxSizeLabel}`
                : error.message || 'File ảnh không hợp lệ';

            return res.status(400).json({ success: 0, message });
        }
        next();
    });
};

const documentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../upload/documents');
        fs.mkdir(uploadDir, { recursive: true }, (error) => cb(error, uploadDir));
    },
    filename: (req, file, cb) => {
        return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
    },
});

const uploadDocument = multer({
    storage: documentStorage,
    limits: { fileSize: PRODUCT_DOCUMENT_UPLOAD_SETTINGS.maxSizeBytes },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        const isAllowedMime = PRODUCT_DOCUMENT_UPLOAD_SETTINGS.allowedMimeTypes.includes(file.mimetype);
        const isAllowedExtension = PRODUCT_DOCUMENT_UPLOAD_SETTINGS.allowedExtensions.includes(extension);

        if (!isAllowedMime || !isAllowedExtension) {
            return cb(new Error('Chỉ cho phép upload file PDF'));
        }
        cb(null, true);
    },
});

const handleProductDocumentUpload = (req, res, next) => {
    uploadDocument.single('document')(req, res, (error) => {
        if (error) {
            const message = error.code === 'LIMIT_FILE_SIZE'
                ? `Dung lượng file tối đa ${PRODUCT_DOCUMENT_UPLOAD_SETTINGS.maxSizeLabel}`
                : error.message || 'File PDF không hợp lệ';

            return res.status(400).json({ success: 0, message });
        }
        next();
    });
};

module.exports = {
    uploadImage,
    handleProductImageUpload,
    uploadDocument,
    handleProductDocumentUpload,
};
