class ProductAdminActionValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProductAdminActionValidationError';
    }
}

function validatePurchaseAdjustment(productId, payload) {
    const { action, amount } = payload;
    const numericAmount = parseInt(amount, 10);

    if (!/^[a-f\d]{24}$/i.test(String(productId || ''))) {
        throw new ProductAdminActionValidationError('Mã sản phẩm không hợp lệ');
    }

    if (!["increase", "decrease"].includes(action) || Number.isNaN(numericAmount) || numericAmount <= 0) {
        throw new ProductAdminActionValidationError('Dữ liệu không hợp lệ');
    }

    return {
        action,
        amount: numericAmount,
        productId,
    };
}

module.exports = {
    ProductAdminActionValidationError,
    validatePurchaseAdjustment,
};
