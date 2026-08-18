const PRODUCT_UPDATE_ALLOWED_FIELDS = [
    'type',
    'name',
    'code',
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
    'infoDoc',
    'documents',
    'adjusted',
    'display',
    'nameUnsigned',
];

const VARIANT_METADATA_FIELDS = [
    'price',
    'importPrice',
    'earn',
    'imgUrl',
    'note',
    'color',
    'shape',
    'buttonCount',
    'frame',
];

function pickAllowedProductUpdateFields(body) {
    return PRODUCT_UPDATE_ALLOWED_FIELDS.reduce((update, field) => {
        if (body[field] !== undefined) {
            update[field] = body[field];
        }
        return update;
    }, {});
}

function pickVariantMetadata(body) {
    return VARIANT_METADATA_FIELDS.reduce((update, field) => {
        if (body && body[field] !== undefined) {
            update[field] = body[field];
        }
        return update;
    }, {});
}

module.exports = {
    PRODUCT_UPDATE_ALLOWED_FIELDS,
    VARIANT_METADATA_FIELDS,
    pickAllowedProductUpdateFields,
    pickVariantMetadata,
};
