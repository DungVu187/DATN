const { Product } = require('../models/product');
const { ActivityLog } = require('../models/activitylog');
const { removeVietnameseTones } = require('../utils/textNormalization');
const {
    pickAllowedProductUpdateFields,
    pickVariantMetadata,
} = require('../utils/productUpdatePolicy');
const { findProductByEquivalentCode } = require('./productCodeLookup');

const PRODUCT_ACTIVITY_FIELDS = [
    'name',
    'code',
    'brand',
    'type',
    'section',
    'value',
    'warranty',
    'vat',
    'solution',
    'description',
    'features',
    'operatingMethod',
    'advantages',
    'specifications',
];

const VARIANT_ACTIVITY_FIELDS = [
    'price',
    'importPrice',
    'earn',
    'note',
    'color',
    'shape',
    'buttonCount',
    'frame',
];

class ProductUpdateError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.name = 'ProductUpdateError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

async function updateExistingVariantMetadata(productId, incomingVariants, currentProduct) {
    if (!Array.isArray(incomingVariants)) return;

    for (let variantIndex = 0; variantIndex < incomingVariants.length; variantIndex += 1) {
        const incomingVariant = incomingVariants[variantIndex];
        const currentVariant = incomingVariant?._id
            ? currentProduct.variant.id(incomingVariant._id)
            : currentProduct.variant[variantIndex];
        if (!currentVariant) continue;

        const metadata = pickVariantMetadata(incomingVariant);
        const setUpdate = Object.entries(metadata).reduce((update, [field, value]) => {
            update['variant.$[target].' + field] = value;
            return update;
        }, {});
        if (Object.keys(setUpdate).length === 0) continue;

        await Product.updateOne(
            { _id: productId, 'variant._id': currentVariant._id },
            { $set: setUpdate },
            { arrayFilters: [{ 'target._id': currentVariant._id }], runValidators: true },
        );
    }
}

function buildUpdateActivityDetails({ oldData, newData, updateData, incomingVariants }) {
    const details = [];

    for (const field of PRODUCT_ACTIVITY_FIELDS) {
        if (updateData[field] === undefined) continue;

        const oldValue = (oldData[field] || '').toString();
        const newValue = (newData[field] || '').toString();
        if (oldValue !== newValue) {
            details.push({ field, oldValue, newValue });
        }
    }

    if (!Array.isArray(incomingVariants)) return details;

    const oldVariants = oldData.variant || [];
    const newVariants = newData.variant || [];
    const variantCount = Math.max(oldVariants.length, newVariants.length);
    for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
        const oldVariant = oldVariants[variantIndex] || {};
        const newVariant = newVariants[variantIndex] || {};
        for (const field of VARIANT_ACTIVITY_FIELDS) {
            const oldValue = (oldVariant[field] !== undefined ? oldVariant[field] : '').toString();
            const newValue = (newVariant[field] !== undefined ? newVariant[field] : '').toString();
            if (oldValue !== newValue) {
                details.push({
                    field: 'variant[' + variantIndex + '].' + field,
                    oldValue,
                    newValue,
                });
            }
        }
    }

    return details;
}

async function writeUpdateActivityLog({ userName, oldData, updatedProduct, updateData, incomingVariants }) {
    try {
        const details = buildUpdateActivityDetails({
            oldData,
            newData: updatedProduct.toJSON(),
            updateData,
            incomingVariants,
        });
        if (details.length === 0) return;

        await new ActivityLog({
            userName,
            action: 'update_product',
            productId: updatedProduct._id,
            productName: updatedProduct.name,
            details,
        }).save();
    } catch (error) {
        console.error('ActivityLog error:', error.message);
    }
}

async function updateProduct({ productId, payload, userName }) {
    const oldProduct = await Product.findById(productId);
    if (!oldProduct) {
        throw new ProductUpdateError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    const oldData = oldProduct.toJSON();
    const updateData = pickAllowedProductUpdateFields(payload);
    const incomingVariants = payload.variant;

    if (updateData.name !== undefined) {
        updateData.nameUnsigned = removeVietnameseTones(updateData.name);
    }

    if (updateData.code && updateData.code.trim()) {
        const existing = await findProductByEquivalentCode(updateData.code, productId);
        if (existing) {
            throw new ProductUpdateError(
                'Mã sản phẩm "' + updateData.code.trim() + '" đã tồn tại (' + existing.name + '). Vui lòng dùng mã khác.',
                409,
                'DUPLICATE_CODE',
            );
        }
    }

    let updatedProduct = await Product.findByIdAndUpdate(
        productId,
        { $set: updateData },
        { new: true, runValidators: true },
    );
    if (!updatedProduct) {
        throw new ProductUpdateError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    await updateExistingVariantMetadata(productId, incomingVariants, oldProduct);
    updatedProduct = await Product.findById(productId);
    await writeUpdateActivityLog({
        userName,
        oldData,
        updatedProduct,
        updateData,
        incomingVariants,
    });

    return updatedProduct;
}

module.exports = {
    ProductUpdateError,
    updateProduct,
};
