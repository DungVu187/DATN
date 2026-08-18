class ProductBatchValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProductBatchValidationError';
        this.statusCode = 400;
    }
}

function fail(message) {
    throw new ProductBatchValidationError(message);
}

function assertBodyObject(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        fail('Dữ liệu tại "body" phải là một đối tượng không null và không phải mảng.');
    }
}

function validateFetchByIdsPayload(body) {
    assertBodyObject(body);

    if (!Array.isArray(body.ids)) {
        fail('Vui lòng cung cấp một mảng ids hợp lệ');
    }

    return { ids: [...body.ids] };
}

function validateByCodesPayload(body) {
    assertBodyObject(body);

    if (!Array.isArray(body.codes) || body.codes.length === 0) {
        fail('Vui lòng cung cấp một mảng codes hợp lệ');
    }

    body.codes.forEach((code, index) => {
        if (code !== null && (typeof code === 'object' || typeof code === 'function')) {
            fail(
                'Phần tử "codes[' + index + ']" phải là giá trị vô hướng hoặc null.'
            );
        }
    });

    return { codes: [...body.codes] };
}

function validateBulkDeletePayload(body) {
    assertBodyObject(body);

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
        fail('Danh sách ID không hợp lệ.');
    }

    body.ids.forEach((id, index) => {
        if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
            fail(
                'Phần tử "ids[' + index + ']" phải là chuỗi ObjectId gồm 24 ký tự hex.'
            );
        }
    });

    return { ids: [...body.ids] };
}

module.exports = {
    ProductBatchValidationError,
    validateFetchByIdsPayload,
    validateByCodesPayload,
    validateBulkDeletePayload,
};
