const { Product } = require('../models/product');
const { ActivityLog } = require('../models/activitylog');

class ProductVariantPricingError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.name = 'ProductVariantPricingError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const loadProductVariant = async (productId, variantIndex) => {
    const product = await Product.findById(productId);
    if (!product) {
        throw new ProductVariantPricingError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    const index = parseInt(variantIndex, 10);
    if (isNaN(index) || index < 0 || index >= product.variant.length) {
        throw new ProductVariantPricingError('Invalid variant index', 400, 'INVALID_VARIANT_INDEX');
    }

    return {
        product,
        index,
        variant: product.variant[index],
    };
};

const calculateRoundedPrice = (amount, earn) => {
    const rawPrice = amount * (1 + earn / 100);
    return Math.ceil(rawPrice / 1000) * 1000;
};

const writePricingActivityLog = async ({ userName, product, action, details }) => {
    if (details.length === 0) return;

    try {
        await new ActivityLog({
            userName,
            action,
            productId: product._id,
            productName: product.name,
            details,
        }).save();
    } catch (error) {
        console.error('ActivityLog error:', error.message);
    }
};

const updateVariantEarn = async ({ productId, variantIndex, earn, userName }) => {
    const { product, index, variant } = await loadProductVariant(productId, variantIndex);
    const oldEarn = variant.earn;
    const oldPrice = variant.price;
    const importPriceStr = variant.importPrice || '0';
    const importPriceNum = parseFloat(importPriceStr.replace(/\./g, '').replace(',', '.')) || 0;

    if (importPriceNum < 0) {
        throw new ProductVariantPricingError(
            'ImportPrice không hợp lệ để tính toán price',
            400,
            'INVALID_STORED_IMPORT_PRICE',
        );
    }

    variant.earn = earn;
    variant.price = calculateRoundedPrice(importPriceNum, variant.earn).toString();
    product.adjusted = true;
    await product.save();

    const details = [];
    if (oldEarn.toString() !== earn.toString()) {
        details.push({
            field: 'variant[' + index + '].earn',
            oldValue: oldEarn.toString() + '%',
            newValue: earn.toString() + '%',
        });
    }
    if (oldPrice !== variant.price) {
        details.push({
            field: 'variant[' + index + '].price',
            oldValue: oldPrice,
            newValue: variant.price,
        });
    }
    await writePricingActivityLog({
        userName,
        product,
        action: 'update_earn',
        details,
    });

    return { product, variant };
};

const updateVariantImportPrice = async ({ productId, variantIndex, importPrice, importPriceNumber, userName }) => {
    const { product, index, variant } = await loadProductVariant(productId, variantIndex);
    const oldImportPrice = variant.importPrice;
    const oldPrice = variant.price;

    variant.importPrice = importPrice;
    variant.price = calculateRoundedPrice(importPriceNumber, variant.earn || 0).toString();
    product.adjusted = true;
    await product.save();

    const details = [];
    if (oldImportPrice !== importPrice) {
        details.push({
            field: 'variant[' + index + '].importPrice',
            oldValue: oldImportPrice || '0',
            newValue: importPrice,
        });
    }
    if (oldPrice !== variant.price) {
        details.push({
            field: 'variant[' + index + '].price',
            oldValue: oldPrice,
            newValue: variant.price,
        });
    }
    await writePricingActivityLog({
        userName,
        product,
        action: 'update_import_price',
        details,
    });

    return { product, variant };
};

module.exports = {
    ProductVariantPricingError,
    calculateRoundedPrice,
    loadProductVariant,
    updateVariantEarn,
    updateVariantImportPrice,
    writePricingActivityLog,
};
