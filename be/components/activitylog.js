const express = require('express');
const { ActivityLog } = require("../models/activitylog");
const { Product } = require("../models/product");
const { authenticateAdmin, checkPermission } = require("../middlewares/auth");

const checkActivityLogPermission = checkPermission("activitylog.view");

const router = express.Router();

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Nhãn hiển thị tiếng Việt cho các action
const ACTION_LABELS = {
    create_product: 'Tạo sản phẩm',
    update_product: 'Sửa sản phẩm',
    delete_product: 'Xóa sản phẩm',
    update_variant: 'Sửa biến thể',
    update_earn: 'Sửa % lợi nhuận',
    update_import_price: 'Sửa giá nhập',
    toggle_display: 'Ẩn/Hiện sản phẩm',
    add_variant: 'Thêm biến thể',
    delete_variant: 'Xóa biến thể',
    
    // User management
    create_user: 'Tạo tài khoản',
    update_user: 'Sửa tài khoản',
    delete_user: 'Xóa tài khoản',
    update_user_permissions: 'Sửa quyền tài khoản',
    // Chips & attributes
    add_chip_attr: 'Thêm thuộc tính sản phẩm',
    remove_chip_attr: 'Xóa thuộc tính sản phẩm',
    create_brand: 'Thêm thương hiệu',
    delete_brand: 'Xóa thương hiệu',
    create_type: 'Thêm loại sản phẩm',
    update_type: 'Cập nhật loại sản phẩm',
    delete_type: 'Xóa loại sản phẩm',
    create_section: 'Thêm phân loại',
    update_section: 'Sửa phân loại',
    delete_section: 'Xóa phân loại',
    create_section_value: 'Thêm giá trị phân loại',
    update_section_value: 'Sửa giá trị phân loại',
    delete_section_value: 'Xóa giá trị phân loại',
    
    // Homepage & config updates
    update_settings: 'Cập nhật cấu hình chung',
    update_introduction: 'Sửa trang giới thiệu',
    update_policy: 'Sửa trang chính sách',
    update_policies: 'Cập nhật trang chính sách',
    update_homepage_section: 'Sửa phần trang chủ',
    update_home_categories: 'Cập nhật danh mục trang chủ',
    
};

const OBJECT_ID_PATTERN = /\b[0-9a-f]{24}\b/gi;

const collectDetailIds = (logs, fieldName) => {
    const ids = new Set();

    logs.forEach((log) => {
        (log.details || []).forEach((detail) => {
            if (String(detail.field || "").toLowerCase() !== fieldName.toLowerCase()) return;

            [detail.oldValue, detail.newValue].forEach((value) => {
                const matches = String(value || "").match(OBJECT_ID_PATTERN) || [];
                matches.forEach((id) => ids.add(id.toLowerCase()));
            });
        });
    });

    return Array.from(ids);
};

const buildReferenceLabels = async (logs) => {
    const productIds = collectDetailIds(logs, "productId");
    const products = await (
        productIds.length > 0
            ? Product.find({ _id: { $in: productIds } }).select("_id code name").lean()
            : []
    );

    return {
        products: Object.fromEntries(products.map((product) => [
            String(product._id),
            product.code || product.name || String(product._id)
        ]))
    };
};

// API lấy danh sách lịch sử hoạt động
router.get("/", authenticateAdmin, checkActivityLogPermission, async (req, res) => {
    try {
        let { page = 1, limit = 20, startDate, endDate, userName, productName, action } = req.query;

        page = Math.max(1, parseInt(page));
        limit = [20, 50, 100].includes(parseInt(limit)) ? parseInt(limit) : 20;

        const skip = (page - 1) * limit;

        const filter = {};
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) {
                const start = new Date(startDate);
                start.setUTCHours(0 - 7, 0, 0, 0);
                filter.createdAt.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setUTCHours(23 - 7, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        if (userName) {
            filter.userName = { $regex: escapeRegex(userName), $options: "i" };
        }

        if (productName) {
            filter.productName = { $regex: escapeRegex(productName), $options: "i" };
        }

        if (action) {
            filter.action = action;
        }

        const [logs, total] = await Promise.all([
            ActivityLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ActivityLog.countDocuments(filter)
        ]);
        const references = await buildReferenceLabels(logs);

        res.status(200).json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            logs,
            actionLabels: ACTION_LABELS,
            references
        });
    } catch (error) {
        console.error("Error fetching activity logs:", error);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = { ActivityLog, router, ACTION_LABELS };
