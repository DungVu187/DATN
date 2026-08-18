class ProductVariantActionValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProductVariantActionValidationError';
        this.statusCode = 400;
    }
}

function fail(message) {
    throw new ProductVariantActionValidationError(message);
}

function assertBodyObject(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        fail('Trường "body" phải là một đối tượng không null và không phải mảng.');
    }
}

function assertScalarOrNull(value, path) {
    if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        fail('Trường "' + path + '" phải là giá trị vô hướng hoặc null.');
    }
}

function validateStockAdjustmentPayload(body) {
    assertBodyObject(body);

    const { quantity, orderId, orderName, isAIScan } = body;
    const isFiniteNumber = typeof quantity === 'number' && Number.isFinite(quantity);
    const isNumericString = typeof quantity === 'string'
        && quantity.trim() !== ''
        && Number.isFinite(Number(quantity));

    if (!isFiniteNumber && !isNumericString) {
        fail('Quantity must be a number');
    }

    const quantityNumber = Number(quantity);
    if (quantityNumber === 0) {
        fail('Số lượng thay đổi phải khác 0');
    }

    assertScalarOrNull(orderId, 'orderId');
    assertScalarOrNull(orderName, 'orderName');

    const isAIScanAllowed = isAIScan === undefined
        || isAIScan === null
        || typeof isAIScan === 'boolean'
        || isAIScan === 0
        || isAIScan === 1;

    if (!isAIScanAllowed) {
        fail('Trường "isAIScan" phải là boolean, 0, 1 hoặc null.');
    }

    return {
        quantity: quantityNumber,
        orderId,
        orderName,
        isAIScan: Boolean(isAIScan),
    };
}

function validateEarnUpdatePayload(body) {
    assertBodyObject(body);

    const { earn } = body;
    if (typeof earn !== 'number' || !Number.isFinite(earn) || earn < 0) {
        fail('Earn phải là một số không âm');
    }

    return { earn };
}

function validateImportPriceUpdatePayload(body) {
    assertBodyObject(body);

    const { importPrice } = body;
    if (typeof importPrice !== 'string'
        || !importPrice
        || isNaN(importPrice.replace(/\./g, ''))) {
        fail('ImportPrice phải là một chuỗi số hợp lệ');
    }

    const importPriceNumber = parseFloat(
        importPrice.replace(/\./g, '').replace(',', '.')
    ) || 0;

    if (importPriceNumber < 0) {
        fail('ImportPrice không hợp lệ để tính toán price');
    }

    return { importPrice, importPriceNumber };
}

module.exports = {
    ProductVariantActionValidationError,
    validateStockAdjustmentPayload,
    validateEarnUpdatePayload,
    validateImportPriceUpdatePayload,
};
