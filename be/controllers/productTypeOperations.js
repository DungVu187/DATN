const { Type } = require('../models/producttype');
const { Product } = require('../models/product');
const { ActivityLog } = require('../models/activitylog');
const { applyProductTypeRename } = require('../services/productTypeRename');
const {
    isValidProductTypeIcon,
    normalizeProductTypeIcon,
    normalizeProductTypeName,
    serializeProductType,
} = require('../utils/productType');

async function getProductTypes(req, res) {
    try {
        const types = await Type.find().sort({ Type: 1 });
        res.json(types.map(serializeProductType));
    } catch (error) {
        console.error('Error fetching product types:', error);
        res.status(500).json({ message: 'Lỗi server khi lấy danh sách loại sản phẩm' });
    }
}

async function createProductType(req, res) {
    try {
        const typeName = String(req.body?.Type || '').trim().replace(/\s+/g, ' ');
        const icon = normalizeProductTypeIcon(req.body?.icon, typeName);

        if (!typeName) {
            return res.status(400).json({ message: 'Vui lòng nhập tên loại sản phẩm' });
        }
        if (!isValidProductTypeIcon(icon)) {
            return res.status(400).json({ message: 'Icon loại sản phẩm không hợp lệ' });
        }

        const normalizedName = normalizeProductTypeName(typeName);
        const existingTypes = await Type.find().select('Type').lean();
        const duplicate = existingTypes.find(
            (item) => normalizeProductTypeName(item.Type) === normalizedName
        );
        if (duplicate) {
            return res.status(409).json({
                message: 'Loại sản phẩm đã tồn tại. Hãy chọn loại đó để cập nhật.',
                typeId: duplicate._id,
            });
        }

        const newType = await new Type({ Type: typeName, icon }).save();

        try {
            await new ActivityLog({
                userName: req.user.name,
                action: 'create_type',
                productName: newType.Type,
                details: [
                    { field: 'Type', oldValue: '', newValue: newType.Type },
                    { field: 'icon', oldValue: '', newValue: newType.icon },
                ],
            }).save();
        } catch (logError) {
            console.error('ActivityLog error in create_type:', logError.message);
        }

        res.status(201).json(serializeProductType(newType));
    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        console.error('Error creating product type:', error);
        res.status(500).json({ message: 'Lỗi server khi thêm loại sản phẩm' });
    }
}

async function deleteProductType(req, res) {
    try {
        const currentType = await Type.findById(req.params.id);
        if (!currentType) {
            return res.status(404).json({ message: 'Không tìm thấy loại sản phẩm' });
        }

        const productCount = await Product.countDocuments({ type: currentType.Type });
        if (productCount > 0) {
            return res.status(409).json({
                message: `Không thể xóa vì đang có ${productCount} sản phẩm thuộc loại này`,
            });
        }

        await currentType.deleteOne();
        try {
            await new ActivityLog({
                userName: req.user.name,
                action: 'delete_type',
                productName: currentType.Type,
                details: [{ field: 'Type', oldValue: currentType.Type, newValue: '' }],
            }).save();
        } catch (logError) {
            console.error('ActivityLog error in delete_type:', logError.message);
        }

        res.json({ message: 'Đã xóa loại sản phẩm' });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Mã loại sản phẩm không hợp lệ' });
        }
        console.error('Error deleting product type:', error);
        res.status(500).json({ message: 'Lỗi server khi xóa loại sản phẩm' });
    }
}

async function updateProductType(req, res) {
    try {
        const currentType = await Type.findById(req.params.id);
        if (!currentType) {
            return res.status(404).json({ message: 'Không tìm thấy loại sản phẩm' });
        }

        const nextName = String(req.body?.Type || '').trim().replace(/\s+/g, ' ');
        const nextIcon = normalizeProductTypeIcon(req.body?.icon, nextName);
        if (!nextName) {
            return res.status(400).json({ message: 'Vui lòng nhập tên loại sản phẩm' });
        }
        if (!isValidProductTypeIcon(nextIcon)) {
            return res.status(400).json({ message: 'Icon loại sản phẩm không hợp lệ' });
        }

        const normalizedName = normalizeProductTypeName(nextName);
        const existingTypes = await Type.find({ _id: { $ne: currentType._id } })
            .select('Type')
            .lean();
        const duplicate = existingTypes.find(
            (item) => normalizeProductTypeName(item.Type) === normalizedName
        );
        if (duplicate) {
            return res.status(409).json({ message: 'Tên loại sản phẩm đã tồn tại' });
        }

        const oldName = currentType.Type;
        const oldIconRaw = currentType.get('icon', null, { getters: false });
        const oldIcon = normalizeProductTypeIcon(oldIconRaw, oldName);
        currentType.Type = nextName;
        currentType.icon = nextIcon;

        const { updatedProducts, updatedHomeCategories } = await applyProductTypeRename({
            currentType,
            oldName,
            oldIcon,
            oldIconRaw,
            nextName,
            nextIcon,
        });

        try {
            await new ActivityLog({
                userName: req.user.name,
                action: 'update_type',
                productName: nextName,
                details: [
                    { field: 'Type', oldValue: oldName, newValue: nextName },
                    { field: 'icon', oldValue: oldIcon, newValue: nextIcon },
                ],
            }).save();
        } catch (logError) {
            console.error('ActivityLog error in update_type:', logError.message);
        }

        res.json({
            ...serializeProductType(currentType),
            updatedProducts,
            updatedHomeCategories,
        });
    } catch (error) {
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({ message: error.message });
        }
        console.error('Error updating product type:', error);
        res.status(500).json({ message: 'Lỗi server khi cập nhật loại sản phẩm' });
    }
}

module.exports = {
    createProductType,
    deleteProductType,
    getProductTypes,
    updateProductType,
};
