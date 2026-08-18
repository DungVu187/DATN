const express = require('express');
const { Product } = require('../models/product');
const { normalizeBrandKey, resolveBrand } = require('../utils/brandNormalization');
const { authenticateUser, authenticateAdmin, checkPermission, checkAnyPermission } = require('../middlewares/auth');
require('dotenv').config();
const { uploadInvoiceScan } = require('../services/invoiceScanFileLifecycle');
const {
    handleProductDocumentUpload,
    handleProductImageUpload,
    uploadImage,
} = require('../services/productUploads');
const {
    buildTokenQuery,
    greedyNarrowTokens,
} = require('../utils/productSearch');
const {
    createProductReview,
    deleteProductReview,
    getProductReviews,
    updateProductReview,
} = require('../controllers/productReviews');
const {
    bulkDeleteProducts,
    fetchInventoryProductsByIds,
    fetchProductsByCodes,
    fetchProductsByIds,
} = require('../controllers/productBatchOperations');
const {
    adjustProductPurchaseCount,
    backfillProductDisplay,
    deleteProduct,
    toggleProductDisplay,
} = require('../controllers/productAdminActions');
const {
    getAdminProductDetail,
    getProductDetail,
    getTopPurchasedProducts,
} = require('../controllers/productReadOperations');
const {
    updateProductEarn,
    updateProductImportPrice,
} = require('../controllers/productVariantPricingActions');
const { createProductHandler } = require('../controllers/productCreation');
const { updateProductHandler } = require('../controllers/productUpdate');
const {
    addProductVariant,
    deleteProductVariant,
    updateProductVariant,
} = require('../controllers/productVariantOperations');
const { adjustProductStock } = require('../controllers/productStockAdjustment');
const { getProducts } = require('../controllers/productListing');
const {
    cleanProductTemporaryImage,
    deleteProductVariantImage,
    respondProductDocumentUpload,
    respondProductImageUpload,
} = require('../controllers/productMedia');
const { scanProductInvoice } = require('../controllers/productInvoiceScan');
const {
    createProductType,
    deleteProductType,
    getProductTypes,
    updateProductType,
} = require('../controllers/productTypeOperations');

const authenticateOptionalProductViewer = (req, res, next) => {
    if (!req.cookies?.authToken) return next();
    return authenticateUser(req, res, next);
};

// Tạo router cho các API sản phẩm
const router = express.Router();

router.post("/upload/image", [authenticateAdmin, checkAnyPermission(['product.create', 'product.edit']), handleProductImageUpload], respondProductImageUpload);

router.post("/upload/document", [authenticateAdmin, checkAnyPermission(['product.create', 'product.edit']), handleProductDocumentUpload], respondProductDocumentUpload);

// API xóa ảnh
router.delete('/:id/:variantIndex/image', [authenticateAdmin, checkPermission('product.edit')], deleteProductVariantImage);

router.post('/create', [authenticateAdmin, checkPermission('product.create')], createProductHandler);

router.get('/types', getProductTypes);

router.post('/types', [authenticateAdmin, checkPermission('product.create')], createProductType);

router.put('/types/:id', [authenticateAdmin, checkPermission('product.edit')], updateProductType);

router.delete('/types/:id', [authenticateAdmin, checkPermission('product.delete')], deleteProductType);

// API lấy tất cả sản phẩm
router.get("/", authenticateOptionalProductViewer, getProducts);

// API lấy 10 sản phẩm có purchaseCount cao nhất
router.get('/top-purchased', authenticateOptionalProductViewer, getTopPurchasedProducts);

router.get('/:_id/admin-detail', [authenticateUser, checkPermission('product.edit')], getAdminProductDetail);

// API lấy thông tin sản phẩm theo ID (Public)
router.get('/:_id', authenticateOptionalProductViewer, getProductDetail);

// API lấy thông tin nhiều sản phẩm qua mảng id
router.post('/fetch-by-ids', authenticateOptionalProductViewer, fetchProductsByIds);

// API nội bộ lấy dữ liệu sản phẩm phục vụ nghiệp vụ nhập/xuất kho, bao gồm giá nhập.
router.post(
    '/fetch-inventory-by-ids',
    [
        authenticateAdmin,
        checkAnyPermission([
            'iporder.view',
            'iporder.create',
            'iporder.edit',
            'eporder.view',
            'eporder.create',
            'eporder.edit',
        ]),
    ],
    fetchInventoryProductsByIds
);

router.put('/update-display-field', [authenticateAdmin, checkPermission('product.edit')], backfillProductDisplay);

// API sửa thông tin sản phẩm
router.put('/:_id', [authenticateAdmin, checkPermission('product.edit')], updateProductHandler);

// API tăng hoặc giảm số lượng sản phẩm đã mua
router.put("/purchase/:_id", [authenticateAdmin, checkPermission('product.edit')], adjustProductPurchaseCount);

// API xóa ảnh tạm quét AI để tránh rác ổ cứng (Đặt trước API xóa sản phẩm có param /:_id)
router.delete('/clean-temp-image', [authenticateAdmin, checkPermission('product.edit')], cleanProductTemporaryImage);

// API xóa nhiều sản phẩm hàng loạt (bulk delete)
router.post('/bulk-delete', [authenticateAdmin, checkPermission('product.delete')], bulkDeleteProducts);

// API xóa sản phẩm
router.delete('/:_id', [authenticateAdmin, checkPermission('product.delete')], deleteProduct);

// API thêm mới variant
router.post('/:id/variant', [authenticateAdmin, checkPermission('product.edit')], addProductVariant);

// API thay đổi thuộc tính display của sản phẩm
router.put('/:_id/toggle-display', [authenticateAdmin, checkPermission('product.edit')], toggleProductDisplay);

// API để cập nhật số lượng bằng variantIndex
router.post("/:id/:variantIndex", [authenticateAdmin, checkPermission('product.edit')], adjustProductStock);

// API chỉnh sửa variant đang tồn tại
router.put('/:id/:variantIndex', [authenticateAdmin, checkPermission('product.edit')], updateProductVariant);

// API xóa variant
router.delete('/:id/:variantIndex', [authenticateAdmin, checkPermission('product.edit')], deleteProductVariant);

// Lấy đánh giá của một sản phẩm
router.get('/:_id/review', getProductReviews);

// Thêm review
router.post('/:_id/review/create', authenticateUser, createProductReview);

// Sửa review
router.put('/:_id/review/:reviewId', authenticateUser, updateProductReview);

// Xóa review
router.delete('/:_id/review/:reviewId', authenticateUser, deleteProductReview);

router.put('/:id/:variantIndex/update-earn', [authenticateAdmin, checkPermission('product.edit')], updateProductEarn);
router.put('/:id/:variantIndex/update-import-price', [authenticateAdmin, checkPermission('product.edit')], updateProductImportPrice);

// API lấy danh sách _id dựa trên mảng product.code
router.post('/by-codes', authenticateOptionalProductViewer, fetchProductsByCodes);

// API quét ảnh hóa đơn bằng AI
router.post('/scan-invoice', [
    authenticateAdmin,
    checkAnyPermission(['order.scan_ai', 'iporder.scan_ai', 'eporder.scan_ai']),
    uploadInvoiceScan
], scanProductInvoice);

// Export router
module.exports = {
    Product,
    router,
    uploadImage,
    buildTokenQuery,
    greedyNarrowTokens,
    normalizeBrandKey,
    resolveBrand
};
