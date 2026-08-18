const express = require('express');
const { Manage } = require('../models/manage');
const { authenticateAdmin, checkPermission } = require("../middlewares/auth");
const { ActivityLog } = require("../models/activitylog");
const multer = require('multer');
const path = require('path');
const {
    DEFAULT_POLICIES,
    POLICY_KEYS,
} = require('../config/policydefaults');
const {
    getPolicies,
    updateMainPolicy,
    updatePolicies,
} = require('../controllers/managePolicies');
const {
    legacySectionHandlers,
    updateHomepageSection,
} = require('../controllers/manageHomepageSections');
const {
    deleteManageImage,
    getManage,
    updateHomeCategories,
    updateIntroduction,
    updateFooterContent,
    updateManageImage,
    updateManageImages,
    updatePartnerImages,
    updatePartnerText,
    uploadSectionImage,
} = require('../controllers/manageContent');
require("dotenv").config();
const router = express.Router();

// Cấu hình multer với giới hạn file và kiểm tra loại file
const storage = multer.diskStorage({
    destination: "./upload/images",
    filename: (req, file, cb) => {
        return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Chỉ cho phép upload file ảnh!'));
        }
        cb(null, true);
    }
});

// GET: Lấy dữ liệu Manage
router.get("/", getManage);

router.get("/policies", getPolicies);

const logManageRoute = (action, targetName) => {
    return (req, res, next) => {
        const oldJson = res.json;
        res.json = function (data) {
            res.json = oldJson;
            if (res.statusCode >= 200 && res.statusCode < 300) {
                let details = [];
                if (req.body) {
                    const keys = Object.keys(req.body).filter(k => k !== 'password');
                    if (keys.length > 0) {
                        details.push({
                            field: "Thay đổi",
                            oldValue: "",
                            newValue: `Cập nhật các trường: ${keys.join(", ")}`
                        });
                    }
                }
                new ActivityLog({
                    userName: req.user ? req.user.name : "Admin",
                    action: action,
                    productName: targetName,
                    details: details.length > 0 ? details : [{ field: "Cập nhật", oldValue: "", newValue: "Thành công" }]
                }).save().catch(err => console.error("ActivityLog error in route:", err.message));
            }
            return oldJson.apply(res, arguments);
        };
        next();
    };
};

// PUT: Cập nhật ảnh cho topPurchaseUrl, highestRatingUrl, hoặc newProductUrl
router.put("/update", [authenticateAdmin, checkPermission('storefront.manage')], logManageRoute("update_settings", "Cấu hình chung"), upload.array('manage', 1), updateManageImage);

// POST: Thêm ảnh vào overViewImg
router.post("/update-images", [authenticateAdmin, checkPermission('storefront.manage')], upload.array('manage', 10), updateManageImages);

// POST: Thêm ảnh vào partners
router.post("/update-partners", [authenticateAdmin, checkPermission('storefront.manage')], upload.array('manage', 10), updatePartnerImages);

// PUT: Cập nhật cấu hình đối tác dạng text và ẩn/hiện
router.put("/update-partners-text", [authenticateAdmin, checkPermission('storefront.manage')], updatePartnerText);

// PUT: Cập nhật logo và thông tin liên hệ ở footer
router.put("/update-footer", [authenticateAdmin, checkPermission('storefront.manage')], logManageRoute("update_homepage_section", "Nội dung footer"), updateFooterContent);

// PUT: Cập nhật danh mục hiển thị trên trang chủ
router.put("/update-home-categories", [authenticateAdmin, checkPermission('storefront.manage')], logManageRoute("update_home_categories", "Danh mục trang chủ"), updateHomeCategories);

// POST: Tải lên ảnh highlight cho section
router.post("/upload-section-image", [authenticateAdmin, checkPermission('storefront.manage')], upload.single('image'), uploadSectionImage);

// PUT: Cập nhật section bất kỳ động theo sectionId (section1 -> section11)
router.put("/update-section/:sectionId", [authenticateAdmin, checkPermission('storefront.manage')], updateHomepageSection);

// DELETE: Xóa ảnh
router.delete("/delete-image", [authenticateAdmin, checkPermission('storefront.manage')], deleteManageImage);

// PUT: Cập nhật introduction
router.put("/update-introduction", [authenticateAdmin, checkPermission('storefront.manage')], logManageRoute("update_introduction", "Trang Giới thiệu"), updateIntroduction);

// PUT: Cập nhật mainPolicy
router.put("/update-policy", [authenticateAdmin, checkPermission('storefront.manage')], logManageRoute("update_policy", "Trang Chính sách"), updateMainPolicy);

router.put("/update-policies", [authenticateAdmin, checkPermission('storefront.manage')], logManageRoute("update_policies", "Trang Chính sách"), updatePolicies);

// Legacy section update routes kept for backward compatibility
router.put("/update-section1", [authenticateAdmin, checkPermission('storefront.manage')], legacySectionHandlers.section1);
router.put("/update-section2", [authenticateAdmin, checkPermission('storefront.manage')], legacySectionHandlers.section2);
router.put("/update-section3", [authenticateAdmin, checkPermission('storefront.manage')], legacySectionHandlers.section3);
router.put("/update-section4", [authenticateAdmin, checkPermission('storefront.manage')], legacySectionHandlers.section4);
router.put("/update-section5", [authenticateAdmin, checkPermission('storefront.manage')], legacySectionHandlers.section5);
router.put("/update-section6", [authenticateAdmin, checkPermission('storefront.manage')], legacySectionHandlers.section6);
router.put("/update-section7", [authenticateAdmin, checkPermission('storefront.manage')], legacySectionHandlers.section7);
router.put("/update-section8", [authenticateAdmin, checkPermission('storefront.manage')], legacySectionHandlers.section8);
router.put("/update-section9", [authenticateAdmin, checkPermission('storefront.manage')], legacySectionHandlers.section9);
router.put("/update-section10", [authenticateAdmin, checkPermission('storefront.manage')], legacySectionHandlers.section10);

module.exports = {
    Manage,
    DEFAULT_POLICIES,
    POLICY_KEYS,
    router,
};
