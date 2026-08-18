const { ProductPayloadValidationError } = require('../validators/productPayload');

const sendProductPayloadValidationError = (res, error) => {
    const isPayloadValidationError = error instanceof ProductPayloadValidationError;
    const isMongooseValidationError = error?.name === 'ValidationError' || error?.name === 'CastError';
    if (!isPayloadValidationError && !isMongooseValidationError) return false;

    res.status(400).json({ message: error.message });
    return true;
};

module.exports = {
    sendProductPayloadValidationError,
};
