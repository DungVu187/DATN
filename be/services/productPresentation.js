const { removeVietnameseTones } = require('../utils/textNormalization');
const { isContactOnlyVariant } = require('./productPricing');

function hasAdjustedRequiredValue(value) {
    const normalized = removeVietnameseTones(String(value ?? ''))
        .toLowerCase()
        .trim();

    return ![
        '',
        'n/a',
        'na',
        'chua ro',
        'chua co',
        'chua phan loai'
    ].includes(normalized);
}

function calculateProductAdjustedStatus(product) {
    return ['type', 'brand', 'section'].every(field =>
        hasAdjustedRequiredValue(product?.[field])
    );
}

const stripPrivateVariantFields = (product) => {
    const productObj = product?.toJSON ? product.toJSON() : { ...(product || {}) };
    if (Array.isArray(productObj.variant)) {
        productObj.variant = productObj.variant.map((variant) => {
            const variantObj = variant?.toJSON ? variant.toJSON() : { ...variant };
            const contactForPrice = isContactOnlyVariant(variantObj);
            variantObj.contactForPrice = contactForPrice;
            if (contactForPrice) {
                variantObj.price = '';
            }
            delete variantObj.importPrice;
            delete variantObj.earn;
            return variantObj;
        });
    }
    return productObj;
};

module.exports = {
    hasAdjustedRequiredValue,
    calculateProductAdjustedStatus,
    stripPrivateVariantFields,
};
