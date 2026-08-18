const { Product, DEFAULT_PRODUCT_EARN } = require('../models/product');
const { ActivityLog } = require('../models/activitylog');
const { findProductByEquivalentCode } = require('./productCodeLookup');

class ProductCreationError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.name = 'ProductCreationError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const normalizeVariants = (variant) => (
    Array.isArray(variant) && variant.length > 0
        ? variant.map((item) => {
            if (!item || typeof item !== 'object') return item;
            const { _id: ignoredVariantId, ...safeItem } = item;
            return safeItem.earn === undefined || safeItem.earn === null || safeItem.earn === ''
                ? { ...safeItem, earn: DEFAULT_PRODUCT_EARN }
                : safeItem;
        })
        : undefined
);

const writeCreateActivityLog = async ({ userName, product }) => {
    try {
        await new ActivityLog({
            userName,
            action: 'create_product',
            productId: product._id,
            productName: product.name,
            details: [{ field: 'Tạo mới', oldValue: '', newValue: product.name }],
        }).save();
    } catch (error) {
        console.error('ActivityLog error:', error.message);
    }
};

const createProduct = async ({ payload, userName }) => {
    const {
        type,
        name,
        code,
        brand,
        warranty,
        solution,
        description,
        features,
        operatingMethod,
        advantages,
        specifications,
        variant,
        section,
        value,
        infoDoc,
        documents,
        adjusted,
        vat,
    } = payload;

    if (code && code.trim()) {
        const existing = await findProductByEquivalentCode(code);
        if (existing) {
            throw new ProductCreationError(
                'Mã sản phẩm "' + code.trim() + '" đã tồn tại (' + existing.name + '). Vui lòng dùng mã khác.',
                409,
                'DUPLICATE_CODE',
            );
        }
    }

    const newProduct = new Product({
        type,
        name,
        code,
        brand,
        warranty,
        solution,
        description,
        features,
        operatingMethod,
        advantages,
        specifications,
        variant: normalizeVariants(variant),
        section,
        value,
        infoDoc,
        documents,
        adjusted,
        vat,
    });
    await newProduct.save();
    await writeCreateActivityLog({ userName, product: newProduct });

    return newProduct;
};

module.exports = {
    ProductCreationError,
    createProduct,
    normalizeVariants,
    writeCreateActivityLog,
};
