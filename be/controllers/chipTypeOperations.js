const { Type } = require('../models/producttype');
const { ActivityLog } = require('../models/activitylog');

async function getChipTypes(req, res) {
    try {
        const types = await Type.find();
        res.status(200).json(types);
    } catch (error) {
        console.error('Error fetching types:', error);
        res.status(500).json({ message: 'Lỗi server khi lấy danh sách loại sản phẩm' });
    }
}

async function createChipType(req, res) {
    const type = new Type({
        Type: req.body.Type,
    });

    try {
        const newType = await type.save();

        try {
            await new ActivityLog({
                userName: req.user.name,
                action: 'create_type',
                productName: newType.Type,
                details: [{ field: 'Type', oldValue: '', newValue: newType.Type }],
            }).save();
        } catch (logError) {
            console.error('ActivityLog error in create_type:', logError.message);
        }

        res.status(201).json(newType);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

async function deleteChipType(req, res) {
    try {
        const type = await Type.findByIdAndDelete(req.params.id);
        if (!type) return res.status(404).json({ message: 'Type not found' });

        try {
            await new ActivityLog({
                userName: req.user.name,
                action: 'delete_type',
                productName: type.Type,
                details: [{ field: 'Type', oldValue: type.Type, newValue: '' }],
            }).save();
        } catch (logError) {
            console.error('ActivityLog error in delete_type:', logError.message);
        }

        res.status(200).json({ message: 'Type deleted' });
    } catch (error) {
        console.error('Error deleting type:', error);
        res.status(500).json({ message: 'Lỗi server khi xóa loại sản phẩm' });
    }
}

module.exports = {
    createChipType,
    deleteChipType,
    getChipTypes,
};
