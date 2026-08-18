const { validateUpdateProductPayload } = require('../validators/productPayload');
const { sendProductPayloadValidationError } = require('../utils/productPayloadErrors');
const {
    ProductUpdateError,
    updateProduct,
} = require('../services/productUpdate');

async function updateProductHandler(req, res) {
    try {
        validateUpdateProductPayload(req.body);
        const product = await updateProduct({
            productId: req.params._id,
            payload: req.body,
            userName: req.user.name,
        });

        return res.json(product);
    } catch (error) {
        if (sendProductPayloadValidationError(res, error)) return;
        if (error instanceof ProductUpdateError) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error('[PUT /products/:_id] error =', error.message);
        return res.status(500).json({ message: 'Lỗi server' });
    }
}

module.exports = {
    updateProductHandler,
};
