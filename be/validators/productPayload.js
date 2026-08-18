class ProductPayloadValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProductPayloadValidationError';
        this.statusCode = 400;
    }
}

const PRODUCT_TEXT_FIELDS = [
    'type',
    'brand',
    'section',
    'value',
    'warranty',
    'waranty',
    'vat',
    'solution',
    'description',
    'features',
    'operatingMethod',
    'advantages',
    'specifications',
    'nameUnsigned',
];

const PRODUCT_BOOLEAN_FIELDS = ['adjusted', 'display'];
const INFO_DOCUMENT_FIELDS = ['manual', 'dataSheet', 'catalog', 'others'];
const DOCUMENT_FIELDS = ['label', 'url', 'sourceType'];
const MAX_PRODUCT_DOCUMENTS = 5;
const VARIANT_STRING_LIKE_FIELDS = [
    'price',
    'importPrice',
    'imgUrl',
    'note',
    'color',
    'shape',
    'buttonCount',
    'frame',
];
function fail(message) {
    throw new ProductPayloadValidationError(message);
}

function isNonArrayObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isComplexValue(value) {
    return value !== null && typeof value === 'object';
}

function assertBodyObject(body) {
    if (!isNonArrayObject(body)) {
        fail('Dữ liệu tại "body" phải là một đối tượng không null và không phải mảng.');
    }
}

function assertStringOrNull(value, path) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
        fail(`Trường "${path}" phải là chuỗi hoặc null.`);
    }
}

function assertNotComplex(value, path) {
    if (value !== undefined && isComplexValue(value)) {
        fail(`Trường "${path}" không được là đối tượng hoặc mảng.`);
    }
}

function assertScalarOrNull(value, path) {
    const isInvalid = value !== undefined
        && value !== null
        && (typeof value === 'object' || typeof value === 'function');

    if (isInvalid) {
        fail(`Trường "${path}" phải là giá trị vô hướng hoặc null.`);
    }
}

function assertBooleanLike(value, path) {
    const isAllowed = value === undefined
        || value === null
        || typeof value === 'boolean'
        || value === 0
        || value === 1;

    if (!isAllowed) {
        fail(`Trường "${path}" phải là boolean, 0, 1 hoặc null.`);
    }
}

function assertNumericLike(value, path) {
    if (value === undefined || value === null || value === '') return;

    if (typeof value === 'number' && Number.isFinite(value)) return;

    if (typeof value === 'string') {
        const normalizedValue = value.trim();
        if (normalizedValue !== '' && Number.isFinite(Number(normalizedValue))) return;
    }

    fail(`Trường "${path}" phải là số hữu hạn, chuỗi số, chuỗi rỗng hoặc null.`);
}

function validateInfoDoc(infoDoc) {
    if (infoDoc === undefined || infoDoc === null) return;

    if (!isNonArrayObject(infoDoc)) {
        fail('Trường "infoDoc" phải là null hoặc một đối tượng không phải mảng.');
    }

    for (const field of INFO_DOCUMENT_FIELDS) {
        assertNotComplex(infoDoc[field], `infoDoc.${field}`);
    }

    for (const [field, value] of Object.entries(infoDoc)) {
        if (!INFO_DOCUMENT_FIELDS.includes(field)) {
            assertNotComplex(value, `infoDoc.${field}`);
        }
    }
}

function validateDocuments(documents) {
    if (documents === undefined) return;

    if (!Array.isArray(documents)) {
        fail('Trường "documents" phải là một mảng.');
    }

    if (documents.length > MAX_PRODUCT_DOCUMENTS) {
        fail(`Trường "documents" chỉ được chứa tối đa ${MAX_PRODUCT_DOCUMENTS} tài liệu.`);
    }

    documents.forEach((document, index) => {
        const documentPath = `documents[${index}]`;
        if (!isNonArrayObject(document)) {
            fail(`Phần tử "${documentPath}" phải là một đối tượng không phải mảng.`);
        }

        for (const field of DOCUMENT_FIELDS) {
            assertScalarOrNull(document[field], `${documentPath}.${field}`);
        }
    });
}

function validateVariantFields(variant, path, { includeInventoryFields }) {
    for (const field of VARIANT_STRING_LIKE_FIELDS) {
        assertNotComplex(variant[field], `${path}.${field}`);
    }

    assertNumericLike(variant.earn, `${path}.earn`);

    if (includeInventoryFields) {
        assertNumericLike(variant.quantityForSale, `${path}.quantityForSale`);
        assertNumericLike(variant.quantityInStorage, `${path}.quantityInStorage`);
    }
}

function validateVariantArray(variants, validator) {
    if (variants === undefined) return;

    if (!Array.isArray(variants)) {
        fail('Trường "variant" phải là một mảng.');
    }

    variants.forEach((variant, index) => {
        const variantPath = `variant[${index}]`;
        if (!isNonArrayObject(variant)) {
            fail(`Phần tử "${variantPath}" phải là một đối tượng không phải mảng.`);
        }
        validator(variant, variantPath);
    });
}

function validateProductFields(body, variantValidator) {
    assertStringOrNull(body.name, 'name');
    assertStringOrNull(body.code, 'code');

    for (const field of PRODUCT_TEXT_FIELDS) {
        assertNotComplex(body[field], field);
    }

    for (const field of PRODUCT_BOOLEAN_FIELDS) {
        assertBooleanLike(body[field], field);
    }

    validateInfoDoc(body.infoDoc);
    validateDocuments(body.documents);
    validateVariantArray(body.variant, variantValidator);
}

function validateCreateProductPayload(body) {
    assertBodyObject(body);
    validateProductFields(body, (variant, path) => {
        validateVariantFields(variant, path, { includeInventoryFields: true });
    });
    return body;
}

function validateUpdateProductPayload(body) {
    assertBodyObject(body);
    validateProductFields(body, (variant, path) => {
        validateVariantFields(variant, path, { includeInventoryFields: false });
    });
    return body;
}

function validateCreateVariantPayload(body) {
    assertBodyObject(body);
    validateVariantFields(body, 'variant', { includeInventoryFields: true });
    return body;
}

function validateUpdateVariantPayload(body) {
    assertBodyObject(body);
    validateVariantFields(body, 'variant', { includeInventoryFields: false });
    return body;
}

module.exports = {
    ProductPayloadValidationError,
    validateCreateProductPayload,
    validateUpdateProductPayload,
    validateCreateVariantPayload,
    validateUpdateVariantPayload,
};
