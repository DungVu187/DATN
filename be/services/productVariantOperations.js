const { Product } = require('../models/product');
const { ActivityLog } = require('../models/activitylog');
const { pickVariantMetadata } = require('../utils/productUpdatePolicy');

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

class ProductVariantOperationError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.name = 'ProductVariantOperationError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const writeVariantActivityLog = async (entry) => {
    try {
        await new ActivityLog(entry).save();
    } catch (error) {
        console.error('ActivityLog error:', error.message);
    }
};

const buildUpdateVariantDetails = ({ index, oldVariant, variantData }) => {
    const details = [];

    for (const field of VARIANT_ACTIVITY_FIELDS) {
        if (variantData[field] === undefined) continue;

        const oldValue = (oldVariant[field] !== undefined ? oldVariant[field] : '').toString();
        const newValue = (variantData[field] !== undefined ? variantData[field] : '').toString();
        if (oldValue !== newValue) {
            details.push({
                field: 'variant[' + index + '].' + field,
                oldValue,
                newValue,
            });
        }
    }

    return details;
};

async function addVariant({ productId, payload, userName }) {
    const { _id: ignoredVariantId, ...newVariant } = payload;
    const product = await Product.findByIdAndUpdate(
        productId,
        { $push: { variant: newVariant } },
        { new: true, runValidators: true },
    );
    if (!product) {
        throw new ProductVariantOperationError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    const index = product.variant.length - 1;
    await writeVariantActivityLog({
        userName,
        action: 'add_variant',
        productId: product._id,
        productName: product.name,
        details: [{
            field: 'variant[' + index + ']',
            oldValue: '',
            newValue: 'Giá: ' + (newVariant.price || '0') + ', Giá nhập: ' + (newVariant.importPrice || '0'),
        }],
    });

    return product;
}

async function updateVariant({ productId, variantIndex, payload, userName }) {
    const variantData = pickVariantMetadata(payload);
    const product = await Product.findById(productId);
    if (!product) {
        throw new ProductVariantOperationError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    const index = parseInt(variantIndex, 10);
    if (isNaN(index) || index < 0 || index >= product.variant.length) {
        throw new ProductVariantOperationError('Variant not found', 404, 'VARIANT_NOT_FOUND');
    }

    const oldVariant = { ...product.variant[index].toJSON() };
    const variantId = product.variant[index]._id;
    const setUpdate = Object.entries(variantData).reduce((update, [field, value]) => {
        update['variant.$[target].' + field] = value;
        return update;
    }, {});

    let updatedProduct = product;
    if (Object.keys(setUpdate).length > 0) {
        updatedProduct = await Product.findOneAndUpdate(
            { _id: productId, 'variant._id': variantId },
            { $set: setUpdate },
            {
                new: true,
                runValidators: true,
                arrayFilters: [{ 'target._id': variantId }],
            },
        );
    }
    if (!updatedProduct) {
        throw new ProductVariantOperationError(
            'Phiên bản sản phẩm đã thay đổi, vui lòng tải lại dữ liệu.',
            409,
            'VARIANT_CHANGED',
        );
    }

    const details = buildUpdateVariantDetails({ index, oldVariant, variantData });
    if (details.length > 0) {
        await writeVariantActivityLog({
            userName,
            action: 'update_variant',
            productId: updatedProduct._id,
            productName: updatedProduct.name,
            details,
        });
    }

    return updatedProduct;
}

async function deleteVariant({ productId, variantIndex, userName }) {
    const product = await Product.findById(productId);
    if (!product) {
        throw new ProductVariantOperationError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    const index = parseInt(variantIndex, 10);
    if (isNaN(index) || index < 0 || index >= product.variant.length) {
        throw new ProductVariantOperationError('Variant not found', 404, 'VARIANT_NOT_FOUND');
    }
    if (product.variant.length === 1) {
        throw new ProductVariantOperationError(
            'Sản phẩm phải còn ít nhất một phiên bản.',
            400,
            'LAST_VARIANT_REQUIRED',
        );
    }
    if (index !== product.variant.length - 1) {
        throw new ProductVariantOperationError(
            'Chỉ được xóa phiên bản cuối cùng để không làm lệch phiên bản trong các đơn hàng cũ.',
            400,
            'ONLY_LAST_VARIANT_DELETABLE',
        );
    }

    const deletedVariant = product.variant[index];
    if (
        Number(deletedVariant.quantityForSale || 0) !== 0 ||
        Number(deletedVariant.quantityInStorage || 0) !== 0
    ) {
        throw new ProductVariantOperationError(
            'Không thể xóa phiên bản vẫn còn tồn kho hoặc tồn khả dụng.',
            400,
            'VARIANT_HAS_STOCK',
        );
    }

    const updatedProduct = await Product.findOneAndUpdate(
        {
            _id: productId,
            variant: {
                $elemMatch: {
                    _id: deletedVariant._id,
                    quantityForSale: 0,
                    quantityInStorage: 0,
                },
            },
        },
        { $pull: { variant: { _id: deletedVariant._id } } },
        { new: true, runValidators: true },
    );
    if (!updatedProduct) {
        throw new ProductVariantOperationError(
            'Phiên bản vừa được thay đổi bởi thao tác khác, vui lòng tải lại dữ liệu.',
            409,
            'VARIANT_CHANGED',
        );
    }

    await writeVariantActivityLog({
        userName,
        action: 'delete_variant',
        productId: updatedProduct._id,
        productName: updatedProduct.name,
        details: [{
            field: 'variant[' + index + ']',
            oldValue: 'Giá: ' + (deletedVariant.price || '0') + ', Giá nhập: ' + (deletedVariant.importPrice || '0'),
            newValue: '',
        }],
    });

    return updatedProduct;
}

module.exports = {
    ProductVariantOperationError,
    addVariant,
    deleteVariant,
    updateVariant,
};
