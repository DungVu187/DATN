const {
    validateCreateVariantPayload,
    validateUpdateVariantPayload,
} = require('../validators/productPayload');
const { sendProductPayloadValidationError } = require('../utils/productPayloadErrors');
const {
    ProductVariantOperationError,
    addVariant,
    deleteVariant,
    updateVariant,
} = require('../services/productVariantOperations');

const sendOperationError = (res, error) => {
    if (!(error instanceof ProductVariantOperationError)) return false;

    res.status(error.statusCode).json({ message: error.message });
    return true;
};

async function addProductVariant(req, res) {
    try {
        validateCreateVariantPayload(req.body);
        const product = await addVariant({
            productId: req.params.id,
            payload: req.body,
            userName: req.user.name,
        });

        return res.status(201).json({
            message: 'Variant added successfully',
            product,
        });
    } catch (error) {
        if (sendProductPayloadValidationError(res, error)) return;
        if (sendOperationError(res, error)) return;
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
}

async function updateProductVariant(req, res) {
    try {
        validateUpdateVariantPayload(req.body);
        const product = await updateVariant({
            productId: req.params.id,
            variantIndex: req.params.variantIndex,
            payload: req.body,
            userName: req.user.name,
        });

        return res.status(200).json({
            message: 'Variant updated successfully',
            product,
        });
    } catch (error) {
        if (sendProductPayloadValidationError(res, error)) return;
        if (sendOperationError(res, error)) return;
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
}

async function deleteProductVariant(req, res) {
    try {
        const product = await deleteVariant({
            productId: req.params.id,
            variantIndex: req.params.variantIndex,
            userName: req.user.name,
        });

        return res.status(200).json({
            message: 'Variant deleted successfully',
            product,
        });
    } catch (error) {
        if (sendOperationError(res, error)) return;
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
}

module.exports = {
    addProductVariant,
    deleteProductVariant,
    updateProductVariant,
};
