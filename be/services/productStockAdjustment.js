const { Product } = require('../models/product');
const { StorageHistory } = require('../models/storagehistory');
const {
    applyStockAdjustments,
    rollbackOrThrow,
} = require('./inventory');

class ProductStockAdjustmentError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.name = 'ProductStockAdjustmentError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

async function adjustManualProductStock({
    productId,
    variantIndex,
    payload,
    userName,
}) {
    const {
        quantity: change,
        orderId,
        orderName,
        isAIScan,
    } = payload;
    const product = await Product.findById(productId)
        .select('name variant._id variant.quantityForSale variant.quantityInStorage');
    if (!product) {
        throw new ProductStockAdjustmentError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    const index = parseInt(variantIndex, 10);
    if (isNaN(index) || index < 0 || index >= product.variant.length) {
        throw new ProductStockAdjustmentError('Invalid variant index', 400, 'INVALID_VARIANT_INDEX');
    }

    const appliedAdjustments = await applyStockAdjustments([{
        productId,
        variantIndex: index,
        expectedVariantId: product.variant[index]._id,
        quantityForSaleDelta: change,
        quantityInStorageDelta: change,
    }]);

    let history;
    try {
        history = await new StorageHistory({
            productId,
            productName: product.name,
            quantity: change,
            userName,
            orderId,
            orderName,
            isAIScan,
            source: 'product_manual',
        }).save();
    } catch (error) {
        await rollbackOrThrow(appliedAdjustments, error);
    }

    const updatedProduct = await Product.findById(productId);

    return {
        product: updatedProduct,
        history,
    };
}

module.exports = {
    ProductStockAdjustmentError,
    adjustManualProductStock,
};
