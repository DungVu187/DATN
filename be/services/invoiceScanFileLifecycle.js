const fs = require('fs').promises;
const multer = require('multer');
const path = require('path');

const INVOICE_SCAN_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const INVOICE_SCAN_UPLOAD_ROOT = path.resolve(__dirname, '../upload/invoices');

const invoiceScanUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: INVOICE_SCAN_MAX_SIZE_BYTES },
    fileFilter: (req, file, callback) => {
        if (/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) {
            callback(null, true);
        } else {
            callback(new Error('Chỉ chấp nhận file ảnh (jpg, png, webp).'));
        }
    },
});
const uploadInvoiceScan = invoiceScanUpload.single('invoice');

function createInvoiceScanFileDescriptor({
    uploadRoot = INVOICE_SCAN_UPLOAD_ROOT,
    now = Date.now,
    random = Math.random,
} = {}) {
    const uniqueSuffix = now() + '-' + Math.round(random() * 1e9);
    const filename = `invoice-scan-${uniqueSuffix}.webp`;
    return {
        filename,
        filePath: path.join(uploadRoot, filename),
        imageUrl: `/invoice-images/${filename}`,
    };
}

async function unlinkInvoiceScanFile(filePath, { fsImpl = fs } = {}) {
    try {
        await fsImpl.unlink(filePath);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

async function storeInvoiceScanFile(file, {
    fsImpl = fs,
    uploadRoot = INVOICE_SCAN_UPLOAD_ROOT,
    now = Date.now,
    random = Math.random,
} = {}) {
    const storedFile = createInvoiceScanFileDescriptor({ uploadRoot, now, random });

    try {
        await fsImpl.mkdir(uploadRoot, { recursive: true });
        await fsImpl.writeFile(storedFile.filePath, file.buffer);
        return storedFile;
    } catch (error) {
        try {
            await unlinkInvoiceScanFile(storedFile.filePath, { fsImpl });
        } catch (cleanupError) {
            if (error && typeof error === 'object') {
                error.cleanupError = cleanupError;
            }
        }
        throw error;
    }
}

async function rollbackInvoiceScanFile(storedFile, options) {
    if (!storedFile?.filePath) {
        return false;
    }
    return unlinkInvoiceScanFile(storedFile.filePath, options);
}

module.exports = {
    INVOICE_SCAN_MAX_SIZE_BYTES,
    INVOICE_SCAN_UPLOAD_ROOT,
    createInvoiceScanFileDescriptor,
    rollbackInvoiceScanFile,
    storeInvoiceScanFile,
    uploadInvoiceScan,
};
