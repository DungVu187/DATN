const { Product } = require('../models/product');
const { ActivityLog } = require('../models/activitylog');
const {
    ProductAdminActionValidationError,
    validatePurchaseAdjustment,
} = require('../validators/productAdminActions');

async function backfillProductDisplay(req, res) {
    try {
        const result = await Product.updateMany(
            { display: { $exists: false } },
            { $set: { display: true } }
        );

        if (result.modifiedCount === 0) {
            return res.status(200).json({
                message: 'Không có sản phẩm nào cần cập nhật hoặc tất cả sản phẩm đã có trường display',
            });
        }

        return res.status(200).json({
            message: 'Cập nhật trường display thành công',
            updatedCount: result.modifiedCount,
        });
    } catch (error) {
        console.error('Error updating display field:', error);
        return res.status(500).json({
            message: 'Lỗi server khi cập nhật trường display',
            error: "Lỗi server",
        });
    }
}

async function adjustProductPurchaseCount(req, res) {
    try {
        const { action, amount, productId } = validatePurchaseAdjustment(req.params._id, req.body);
        const delta = action === "increase" ? amount : -amount;
        const filter = { _id: productId };
        if (delta < 0) {
            filter.purchaseCount = { $gte: amount };
        }

        const product = await Product.findOneAndUpdate(
            filter,
            { $inc: { purchaseCount: delta } },
            { new: true, runValidators: true }
        );
        if (!product) {
            const exists = await Product.exists({ _id: productId });
            return res.status(exists ? 400 : 404).json({
                message: exists
                    ? "Số lượng đã mua không đủ để giảm"
                    : "Sản phẩm không tồn tại",
            });
        }

        return res.json({ message: "Cập nhật thành công", purchaseCount: product.purchaseCount });
    } catch (error) {
        if (error instanceof ProductAdminActionValidationError) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: "Lỗi server" });
    }
}

async function deleteProduct(req, res) {
    try {
        const product = await Product.findByIdAndDelete(req.params._id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        try {
            await new ActivityLog({
                userName: req.user.name,
                action: 'delete_product',
                productId: product._id,
                productName: product.name,
                details: [{ field: 'Xóa sản phẩm', oldValue: product.name, newValue: '' }],
            }).save();
        } catch (logError) {
            console.error('ActivityLog error:', logError.message);
        }

        return res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: "Lỗi server" });
    }
}

async function toggleProductDisplay(req, res) {
    try {
        const product = await Product.findById(req.params._id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const oldDisplay = product.display;
        product.display = !product.display;
        await product.save();

        try {
            await new ActivityLog({
                userName: req.user.name,
                action: 'toggle_display',
                productId: product._id,
                productName: product.name,
                details: [{
                    field: 'display',
                    oldValue: oldDisplay ? 'Hiển thị' : 'Ẩn',
                    newValue: product.display ? 'Hiển thị' : 'Ẩn',
                }],
            }).save();
        } catch (logError) {
            console.error('ActivityLog error:', logError.message);
        }

        return res.status(200).json({
            message: 'Thay đổi hiển thị thành công',
            product,
        });
    } catch (error) {
        console.error('Error toggling display:', error);
        return res.status(500).json({
            message: 'Lỗi server khi thay đổi display',
            error: "Lỗi server",
        });
    }
}

module.exports = {
    adjustProductPurchaseCount,
    backfillProductDisplay,
    deleteProduct,
    toggleProductDisplay,
};
