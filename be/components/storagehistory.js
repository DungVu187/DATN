const express = require('express');
const { StorageHistory } = require('../models/storagehistory');
const { authenticateAdmin, checkPermission, checkAnyPermission } = require('../middlewares/auth');

const router = express.Router();

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sortTextOptions = (items) =>
    items
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
        .sort((a, b) => a.localeCompare(b, "vi", { sensitivity: "base" }));

const checkImportHistoryPermission = checkPermission("history_import.view");
const checkExportHistoryPermission = checkPermission("history_export.view");
const checkEitherHistoryPermission = checkAnyPermission([
    "history_import.view",
    "history_export.view",
]);

const checkHistoryPermission = (req, res, next) => {
    const permissionMiddleware = req.query.direction === "export"
        ? checkExportHistoryPermission
        : checkImportHistoryPermission;

    return permissionMiddleware(req, res, next);
};

router.get("/", authenticateAdmin, checkHistoryPermission, async (req, res) => {
    try {
        let { page = 1, limit = 20, startDate, endDate, orderName, userName, noteType, direction } = req.query;

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

        if (orderName) {
            filter.orderName = { $regex: escapeRegex(orderName), $options: "i" };
        }

        if (userName) {
            filter.userName = { $regex: escapeRegex(userName), $options: "i" };
        }

        if (noteType) {
            if (noteType === 'nhap_don') {
                filter.quantity = { $gt: 0 };
                filter.orderName = { $nin: [null, ""] };
                filter.isAIScan = { $ne: true };
                filter.source = { $exists: false };
                filter.note = { $nin: ["Đơn hàng bán online", "Hoàn tác đơn bán online"] };
            } else if (noteType === 'xuat_don') {
                filter.quantity = { $lt: 0 };
                filter.orderName = { $nin: [null, ""] };
                filter.isAIScan = { $ne: true };
                filter.source = { $exists: false };
                filter.note = { $nin: ["Đơn hàng bán online", "Hoàn tác đơn bán online"] };
            } else if (noteType === 'nhap_thu_cong') {
                filter.quantity = { $gt: 0 };
                filter.orderName = { $in: [null, ""] };
                filter.isAIScan = { $ne: true };
                // Kho thủ công trên trang SP: gồm dòng cũ (chưa có source) và dòng mới (source=product_manual).
                filter.$or = [{ source: { $exists: false } }, { source: "product_manual" }];
            } else if (noteType === 'xuat_thu_cong') {
                filter.quantity = { $lt: 0 };
                filter.orderName = { $in: [null, ""] };
                filter.isAIScan = { $ne: true };
                filter.$or = [{ source: { $exists: false } }, { source: "product_manual" }];
            } else if (noteType === 'nhap_ai') {
                filter.quantity = { $gt: 0 };
                filter.isAIScan = true;
            } else if (noteType === 'xuat_ai') {
                filter.quantity = { $lt: 0 };
                filter.isAIScan = true;
            } else if (noteType === 'order_line_manual') {
                filter.source = 'order_line_manual';
            } else if (noteType === 'order_line_complete') {
                filter.source = 'order_line_complete';
            } else if (noteType === 'order_bulk_complete') {
                filter.source = 'order_bulk_complete';
            } else if (noteType === 'product_manual') {
                filter.source = 'product_manual';
            } else if (noteType === 'ban_online') {
                filter.$or = [
                    { source: { $in: ['online_sale', 'online_sale_revert'] } },
                    {
                        source: { $exists: false },
                        note: { $in: ["Đơn hàng bán online", "Hoàn tác đơn bán online"] }
                    }
                ];
            }
        }

        if (direction === "import") {
            filter.quantity = { $gt: 0 };
        } else if (direction === "export") {
            filter.quantity = { $lt: 0 };
        }

        const [history, total] = await Promise.all([
            StorageHistory.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            StorageHistory.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            history
        });
    } catch (error) {
        console.error("Error fetching storage history:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/filter-options", authenticateAdmin, checkEitherHistoryPermission, async (req, res) => {
    try {
        const [userNames, orderNames] = await Promise.all([
            StorageHistory.distinct("userName", { userName: { $nin: [null, ""] } }),
            StorageHistory.distinct("orderName", { orderName: { $nin: [null, ""] } })
        ]);

        res.status(200).json({
            success: true,
            userNames: sortTextOptions(userNames),
            orderNames: sortTextOptions(orderNames)
        });
    } catch (error) {
        console.error("Error fetching storage history filter options:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/:id", [authenticateAdmin, checkEitherHistoryPermission], async (req, res) => {
    try {
        const { id } = req.params;
        let { page = 1, limit = 20, startDate, endDate } = req.query;

        page = Math.max(1, parseInt(page));
        limit = [20, 50, 100].includes(parseInt(limit)) ? parseInt(limit) : 20;

        const skip = (page - 1) * limit;

        const filter = { productId: id };
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

        const [history, total] = await Promise.all([
            StorageHistory.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            StorageHistory.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            history
        });
    } catch (error) {
        console.error("Error fetching storage history by product:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.put("/update-ordername", authenticateAdmin, checkEitherHistoryPermission, async (req, res) => {
    try {
        const { orderId, newOrderName } = req.body;

        if (!orderId || !newOrderName) {
            return res.status(400).json({ success: false, message: "Thiếu orderId hoặc newOrderName" });
        }

        const result = await StorageHistory.updateMany(
            { orderId },
            { $set: { orderName: newOrderName } }
        );

        res.status(200).json({
            success: true,
            message: `Đã cập nhật ${result.modifiedCount} lịch sử với orderId = ${orderId}`,
        });
    } catch (error) {
        console.error("Error updating orderName:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = { StorageHistory, router };
