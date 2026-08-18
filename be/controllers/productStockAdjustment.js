const {
    ProductVariantActionValidationError,
    validateStockAdjustmentPayload,
} = require('../validators/productVariantActions');
const {
    ProductStockAdjustmentError,
    adjustManualProductStock,
} = require('../services/productStockAdjustment');

const sendValidationError = (res, error) => {
    if (!(error instanceof ProductVariantActionValidationError)) return false;

    res.status(400).json({ message: error.message });
    return true;
};

async function adjustProductStock(req, res) {
    try {
        const payload = validateStockAdjustmentPayload(req.body);
        const { product, history } = await adjustManualProductStock({
            productId: req.params.id,
            variantIndex: req.params.variantIndex,
            payload,
            userName: req.user.name,
        });

        return res.status(200).json({
            message: 'Quantity updated & history saved',
            product,
            history,
        });
    } catch (error) {
        if (sendValidationError(res, error)) return;
        if (error instanceof ProductStockAdjustmentError) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error(error);
        return res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : 'Server error',
        });
    }
}

module.exports = {
    adjustProductStock,
};
