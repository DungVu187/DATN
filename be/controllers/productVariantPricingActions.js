const {
    ProductVariantActionValidationError,
    validateEarnUpdatePayload,
    validateImportPriceUpdatePayload,
} = require('../validators/productVariantActions');
const {
    ProductVariantPricingError,
    updateVariantEarn,
    updateVariantImportPrice,
} = require('../services/productVariantPricing');

const sendValidationError = (res, error) => {
    if (!(error instanceof ProductVariantActionValidationError)) return false;

    res.status(400).json({ message: error.message });
    return true;
};

const sendPricingError = (res, error) => {
    if (!(error instanceof ProductVariantPricingError)) return false;

    res.status(error.statusCode).json({ message: error.message });
    return true;
};

const serializeVariantResponse = (variant) => ({
    ...variant.toJSON(),
    price: variant.price,
    earn: variant.earn,
    importPrice: variant.importPrice,
});

async function updateProductEarn(req, res) {
    const { id, variantIndex } = req.params;

    try {
        const { earn } = validateEarnUpdatePayload(req.body);
        const { variant } = await updateVariantEarn({
            productId: id,
            variantIndex,
            earn,
            userName: req.user.name,
        });

        return res.status(200).json({
            message: 'Earn and price updated successfully',
            variant: serializeVariantResponse(variant),
        });
    } catch (error) {
        if (sendValidationError(res, error)) return;
        if (sendPricingError(res, error)) return;
        console.error('Error updating earn and price:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

async function updateProductImportPrice(req, res) {
    const { id, variantIndex } = req.params;

    try {
        const { importPrice, importPriceNumber } = validateImportPriceUpdatePayload(req.body);
        const { variant } = await updateVariantImportPrice({
            productId: id,
            variantIndex,
            importPrice,
            importPriceNumber,
            userName: req.user.name,
        });

        return res.status(200).json({
            message: 'Import price and price updated successfully',
            variant: serializeVariantResponse(variant),
        });
    } catch (error) {
        if (sendValidationError(res, error)) return;
        if (sendPricingError(res, error)) return;
        console.error('Error updating import price:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

module.exports = {
    updateProductEarn,
    updateProductImportPrice,
};
