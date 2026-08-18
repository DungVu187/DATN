const { removeVietnameseTones } = require('./textNormalization');

function normalizeBrandKey(brand) {
    return removeVietnameseTones(String(brand || ''))
        .toLowerCase()
        .replace(/\s+/g, '')
        .trim();
}

function resolveBrand(scannedBrand, brandDocs) {
    const brand = String(scannedBrand || '').trim();
    if (!brand) {
        return { brand: '', brandIsNew: false };
    }

    const brandKey = normalizeBrandKey(brand);
    const canonicalBrand = (Array.isArray(brandDocs) ? brandDocs : []).find(
        (doc) => normalizeBrandKey(doc && doc.Brand) === brandKey
    );

    if (canonicalBrand) {
        return { brand: canonicalBrand.Brand, brandIsNew: false };
    }

    return { brand, brandIsNew: true };
}

module.exports = {
    normalizeBrandKey,
    resolveBrand,
};
