const { Product } = require('../models/product');
const {
    ProductAccessError,
    buildProductVisibilityFilter,
    combineProductFilters,
    loadProductViewer,
} = require('../services/productAccess');
const { stripPrivateVariantFields } = require('../services/productPresentation');

function sendProductAccessError(res, error) {
    if (!(error instanceof ProductAccessError)) return false;

    res.status(error.statusCode).json({ message: error.message });
    return true;
}

async function getTopPurchasedProducts(req, res) {
    try {
        const viewer = await loadProductViewer(req.user?.userId);
        const { filter } = await buildProductVisibilityFilter(viewer);
        const products = await Product.find(filter)
            .sort({ purchaseCount: -1 })
            .limit(10);

        res.json(products.map(stripPrivateVariantFields));
    } catch (error) {
        if (sendProductAccessError(res, error)) return;
        console.error("Error fetching top purchased products:", error);
        res.status(500).json({ message: "Lỗi server khi lấy sản phẩm mua nhiều" });
    }
}

async function getAdminProductDetail(req, res) {
    try {
        const product = await Product.findById(req.params._id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: "Lỗi server" });
    }
}

async function getProductDetail(req, res) {
    try {
        const viewer = await loadProductViewer(req.user?.userId);
        const { filter } = await buildProductVisibilityFilter(viewer);
        const product = await Product.findOne(combineProductFilters(
            { _id: req.params._id },
            filter
        ));
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.json(stripPrivateVariantFields(product));
    } catch (error) {
        if (sendProductAccessError(res, error)) return;
        res.status(500).json({ message: "Lỗi server" });
    }
}

module.exports = {
    getAdminProductDetail,
    getProductDetail,
    getTopPurchasedProducts,
};
