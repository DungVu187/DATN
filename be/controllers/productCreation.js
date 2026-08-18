const { validateCreateProductPayload } = require('../validators/productPayload');
const { sendProductPayloadValidationError } = require('../utils/productPayloadErrors');
const { ProductCreationError, createProduct } = require('../services/productCreation');

async function createProductHandler(req, res) {
    try {
        validateCreateProductPayload(req.body);
        const product = await createProduct({
            payload: req.body,
            userName: req.user.name,
        });

        return res.status(201).json({
            message: 'Product created successfully',
            product,
        });
    } catch (error) {
        if (error.code === 11000 && error.keyPattern?.code) {
            const duplicateCode = error.keyValue?.code || '';
            return res.status(409).json({
                message: 'Mã sản phẩm "' + duplicateCode + '" đã tồn tại trong hệ thống. Vui lòng dùng mã khác.',
            });
        }
        if (sendProductPayloadValidationError(res, error)) return;
        if (error instanceof ProductCreationError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Lỗi server' });
    }
}

module.exports = {
    createProductHandler,
};
