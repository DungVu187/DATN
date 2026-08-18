const mongoose = require('mongoose');
const { Product } = require('../models/product');
const { ActivityLog } = require('../models/activitylog');
const {
    ProductAccessError,
    buildProductVisibilityFilter,
    combineProductFilters,
    loadProductViewer,
} = require('../services/productAccess');
const { stripPrivateVariantFields } = require('../services/productPresentation');
const {
    ProductBatchValidationError,
    validateFetchByIdsPayload,
    validateByCodesPayload,
    validateBulkDeletePayload,
} = require('../validators/productBatchOperations');

function sendProductAccessError(res, error) {
    if (!(error instanceof ProductAccessError)) return false;

    res.status(error.statusCode).json({ message: error.message });
    return true;
}

function isValidationError(error) {
    return error instanceof ProductBatchValidationError
        || error instanceof mongoose.Error.ValidationError
        || error instanceof mongoose.Error.CastError;
}

async function fetchProductsByIds(req, res) {
    try {
        const { ids } = validateFetchByIdsPayload(req.body);

        if (ids.length === 0) {
            return res.json({
                success: 1,
                total: 0,
                products: [],
            });
        }

        const validIds = ids
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id));

        if (validIds.length === 0) {
            return res.status(400).json({
                success: 0,
                message: 'Không có id nào hợp lệ trong mảng',
            });
        }

        const viewer = await loadProductViewer(req.user?.userId);
        const { filter } = await buildProductVisibilityFilter(viewer);
        const products = await Product.find(combineProductFilters(
            { _id: { $in: validIds } },
            filter
        ));

        const processedProducts = products.map((product) => {
            const productObject = stripPrivateVariantFields(product);
            return {
                ...productObject,
                purchaseCount: productObject.purchaseCount || 0,
                averageReviews: productObject.averageReviews || 0,
                reviewCount: productObject.reviewCount || 0,
                totalRating: productObject.totalRating || 0,
            };
        });

        return res.json({
            success: 1,
            total: processedProducts.length,
            products: processedProducts,
        });
    } catch (error) {
        if (isValidationError(error)) {
            return res.status(400).json({
                success: 0,
                message: error.message,
            });
        }
        if (sendProductAccessError(res, error)) return undefined;

        console.error('Error fetching products by IDs:', error);
        return res.status(500).json({
            success: 0,
            message: 'Lỗi server khi lấy thông tin sản phẩm',
            error: 'Lỗi server',
        });
    }
}

async function fetchInventoryProductsByIds(req, res) {
    try {
        const { ids } = validateFetchByIdsPayload(req.body);

        if (ids.length === 0) {
            return res.json({
                success: 1,
                total: 0,
                products: [],
            });
        }

        const validIds = ids
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id));

        if (validIds.length === 0) {
            return res.status(400).json({
                success: 0,
                message: 'Không có id nào hợp lệ trong mảng',
            });
        }

        const products = await Product.find(
            { _id: { $in: validIds } },
            { name: 1, code: 1, brand: 1, variant: 1 }
        );

        const inventoryProducts = products.map((product) => ({
            _id: product._id.toString(),
            name: product.name,
            code: product.code,
            brand: product.brand,
            variant: (product.variant || []).map((variant) => ({
                imgUrl: variant.imgUrl || '',
                importPrice: variant.importPrice ?? '',
                price: variant.price ?? '',
                earn: variant.earn ?? 0,
            })),
        }));

        return res.json({
            success: 1,
            total: inventoryProducts.length,
            products: inventoryProducts,
        });
    } catch (error) {
        if (isValidationError(error)) {
            return res.status(400).json({
                success: 0,
                message: error.message,
            });
        }

        console.error('Fetch inventory products by IDs error:', error);
        return res.status(500).json({ message: 'Lỗi server' });
    }
}

async function fetchProductsByCodes(req, res) {
    try {
        const { codes } = validateByCodesPayload(req.body);
        const viewer = await loadProductViewer(req.user?.userId);
        const { filter } = await buildProductVisibilityFilter(viewer);
        const products = await Product.find(combineProductFilters(
            { code: { $in: codes } },
            filter
        )).select('_id code');

        const result = products.map((product) => ({
            code: product.code,
            _id: product._id,
        }));

        if (result.length === 0) {
            return res.status(404).json({
                message: 'Không tìm thấy sản phẩm nào với các code được cung cấp',
            });
        }

        return res.json({
            success: 1,
            total: result.length,
            products: result,
        });
    } catch (error) {
        if (isValidationError(error)) {
            return res.status(400).json({ message: error.message });
        }
        if (sendProductAccessError(res, error)) return undefined;

        console.error('Error fetching products by codes:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

async function bulkDeleteProducts(req, res) {
    try {
        const { ids } = validateBulkDeletePayload(req.body);
        const productsToDelete = await Product.find({ _id: { $in: ids } });
        const deleteResult = await Product.deleteMany({ _id: { $in: ids } });

        try {
            const logs = productsToDelete.map((product) => ({
                userName: req.user.name,
                action: 'delete_product',
                productId: product._id,
                productName: product.name,
                details: [{
                    field: 'Xóa sản phẩm hàng loạt',
                    oldValue: product.name,
                    newValue: '',
                }],
            }));
            await ActivityLog.insertMany(logs);
        } catch (logError) {
            console.error('Bulk ActivityLog error:', logError.message);
        }

        return res.json({
            message: 'Đã xóa thành công ' + deleteResult.deletedCount + ' sản phẩm.',
        });
    } catch (error) {
        if (isValidationError(error)) {
            return res.status(400).json({ message: error.message });
        }

        return res.status(500).json({ message: 'Lỗi server' });
    }
}

module.exports = {
    fetchProductsByIds,
    fetchInventoryProductsByIds,
    fetchProductsByCodes,
    bulkDeleteProducts,
};
