const { Product } = require('../models/product');
const { normalizeProductCodeForCompare } = require('../utils/productCodeNormalization');

async function findProductByEquivalentCode(code, excludeId = null) {
    const normalizedCode = normalizeProductCodeForCompare(code);
    if (!normalizedCode) {
        return null;
    }

    const products = await Product.find({
        code: { $exists: true, $nin: [null, ''] },
    }).select('_id name code').lean();

    return products.find((product) => {
        if (excludeId && product._id.toString() === excludeId.toString()) {
            return false;
        }
        return normalizeProductCodeForCompare(product.code) === normalizedCode;
    }) || null;
}

module.exports = {
    findProductByEquivalentCode,
    normalizeProductCodeForCompare,
};
