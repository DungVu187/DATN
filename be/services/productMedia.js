const fs = require('fs').promises;
const path = require('path');
const { PRODUCT_IMAGE_UPLOAD_SETTINGS } = require('../config/imageUpload');
const { EpOrder } = require('../models/eporder');
const { IpOrder } = require('../models/iporder');
const { Order } = require('../models/order');
const { Product } = require('../models/product');

const PRODUCT_IMAGE_ROOT = path.resolve(__dirname, '../upload/images');
const TEMPORARY_INVOICE_ROOT = path.resolve(__dirname, '../upload/invoices');
const PRODUCT_IMAGE_ALLOWED_EXTENSIONS = new Set([
    ...PRODUCT_IMAGE_UPLOAD_SETTINGS.allowedExtensions,
    '.jfif',
]);
const PRODUCT_IMAGE_FILENAME_PATTERN = /^product_\d{13,17}(\.[a-z0-9]+)$/i;
const TEMPORARY_INVOICE_FILENAME_PATTERN = /^invoice-scan-\d+-\d+\.webp$/;
const MAX_MEDIA_URL_LENGTH = 2048;

class ProductMediaError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'ProductMediaError';
        this.statusCode = statusCode;
    }
}

function parseMediaPathname(value, errorMessage) {
    if (
        typeof value !== 'string'
        || value.length === 0
        || value.length > MAX_MEDIA_URL_LENGTH
        || value.includes('\0')
    ) {
        throw new ProductMediaError(errorMessage, 400);
    }

    try {
        const parsedUrl = new URL(value, 'http://localhost');
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('Unsupported media URL scheme');
        }

        const pathname = decodeURIComponent(parsedUrl.pathname).replace(/\\/g, '/');
        if (pathname.includes('%') || /[\0-\x1f\x7f]/.test(pathname)) {
            throw new Error('Unsafe media pathname');
        }

        return pathname;
    } catch (error) {
        throw new ProductMediaError(errorMessage, 400);
    }
}

function resolveContainedFilePath(rootPath, filename, errorMessage) {
    const filePath = path.resolve(rootPath, filename);
    const relativePath = path.relative(rootPath, filePath);
    if (
        !relativePath
        || relativePath === '..'
        || relativePath.startsWith('..' + path.sep)
        || path.isAbsolute(relativePath)
    ) {
        throw new ProductMediaError(errorMessage, 400);
    }

    return filePath;
}

function resolveProductImagePath(imgUrl) {
    const pathname = parseMediaPathname(imgUrl, 'Invalid image path');
    const pathMatch = /^\/(?:api\/)?images\/([^/]+)$/.exec(pathname);
    if (!pathMatch) {
        throw new ProductMediaError('Invalid image path', 400);
    }

    const filename = pathMatch[1];
    const filenameMatch = PRODUCT_IMAGE_FILENAME_PATTERN.exec(filename);
    if (
        !filenameMatch
        || !PRODUCT_IMAGE_ALLOWED_EXTENSIONS.has(filenameMatch[1].toLowerCase())
    ) {
        throw new ProductMediaError('Invalid image path', 400);
    }

    return {
        filePath: resolveContainedFilePath(PRODUCT_IMAGE_ROOT, filename, 'Invalid image path'),
        filename,
    };
}

function resolveTemporaryInvoicePath(imageUrl) {
    const errorMessage = 'Đường dẫn ảnh tạm không hợp lệ.';
    const pathname = parseMediaPathname(imageUrl, errorMessage);
    const pathMatch = /^\/invoice-images\/([^/]+)$/.exec(pathname);
    if (!pathMatch) {
        throw new ProductMediaError(errorMessage, 400);
    }

    const filename = pathMatch[1];
    if (!TEMPORARY_INVOICE_FILENAME_PATTERN.test(filename)) {
        throw new ProductMediaError(errorMessage, 400);
    }

    return {
        filePath: resolveContainedFilePath(TEMPORARY_INVOICE_ROOT, filename, errorMessage),
        filename,
    };
}

async function unlinkRegularFile(filePath, errorMessage) {
    try {
        const fileStats = await fs.lstat(filePath);
        if (!fileStats.isFile()) {
            throw new ProductMediaError(errorMessage, 400);
        }

        await fs.unlink(filePath);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

async function getStoredVariantImageUrl(product, index) {
    const storedProduct = await Product.collection.findOne(
        { _id: product._id },
        { projection: { variant: 1 } },
    );
    const storedVariant = storedProduct?.variant?.[index];
    if (storedVariant && typeof storedVariant.imgUrl === 'string') {
        return { imgUrl: storedVariant.imgUrl, storedProduct };
    }

    return { imgUrl: product.variant[index].imgUrl, storedProduct };
}

function escapeRegExp(value) {
    return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function referencesProductImage(imageUrl, filename) {
    try {
        return resolveProductImagePath(imageUrl).filename === filename;
    } catch (error) {
        if (error instanceof ProductMediaError) {
            return false;
        }
        throw error;
    }
}

async function isProductImageReferencedElsewhere({ productId, index, filename, storedProduct }) {
    const sameProductReference = storedProduct?.variant?.some((variant, variantIndex) => (
        variantIndex !== index
        && typeof variant.imgUrl === 'string'
        && referencesProductImage(variant.imgUrl, filename)
    ));
    if (sameProductReference) {
        return true;
    }

    const escapedFilename = escapeRegExp(filename);
    const referencePattern = new RegExp(
        '(?:^|/)(?:api/)?images/' + escapedFilename + '(?:[?#].*)?$',
    );
    return Boolean(await Product.exists({
        _id: { $ne: productId },
        'variant.imgUrl': referencePattern,
    }));
}

async function isInvoiceImageReferenced(filename) {
    const escapedFilename = escapeRegExp(filename);
    const referencePattern = new RegExp(
        '(?:^|/)invoice-images/' + escapedFilename + '(?:[?#].*)?$',
    );
    const references = await Promise.all([
        Order.exists({ images: referencePattern }),
        IpOrder.exists({ images: referencePattern }),
        EpOrder.exists({ images: referencePattern }),
    ]);
    return references.some(Boolean);
}

async function deleteVariantImage({ productId, variantIndex }) {
    const product = await Product.findById(productId);
    if (!product) {
        throw new ProductMediaError('Product not found', 404);
    }

    const index = parseInt(variantIndex, 10);
    if (isNaN(index) || index < 0 || index >= product.variant.length) {
        throw new ProductMediaError('Variant not found', 404);
    }

    const { imgUrl, storedProduct } = await getStoredVariantImageUrl(product, index);
    if (!imgUrl) {
        throw new ProductMediaError('No image to delete', 400);
    }

    const { filePath, filename } = resolveProductImagePath(imgUrl);
    if (await isProductImageReferencedElsewhere({
        productId: product._id,
        index,
        filename,
        storedProduct,
    })) {
        throw new ProductMediaError('Image is referenced by another product variant', 409);
    }
    await unlinkRegularFile(filePath, 'Invalid image path');

    product.variant[index].imgUrl = '';
    await product.save();
    return product;
}

async function cleanTemporaryInvoiceImage(imageUrl) {
    const { filePath, filename } = resolveTemporaryInvoicePath(imageUrl);
    if (await isInvoiceImageReferenced(filename)) {
        throw new ProductMediaError('Ảnh tạm đã được sử dụng và không thể xóa.', 409);
    }

    const fileDeleted = await unlinkRegularFile(
        filePath,
        'Đường dẫn ảnh tạm không hợp lệ.',
    );
    if (fileDeleted) {
        console.log('[scan-invoice] Đã xóa thành công tệp ảnh tạm: ' + filename);
        return 'Đã xóa ảnh tạm thành công.';
    }

    return 'File không tồn tại hoặc đã được xóa.';
}

module.exports = {
    ProductMediaError,
    cleanTemporaryInvoiceImage,
    deleteVariantImage,
};
