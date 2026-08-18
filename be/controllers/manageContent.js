const mongoose = require("mongoose");
const { Manage } = require("../models/manage");
const fs = require("fs").promises;
const path = require("path");
const { normalizeLocalizedText } = require("../utils/manageLocalization");

const isImageAssetPath = (value) => typeof value === "string" && (
    /^data:image\//i.test(value)
    || /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value)
);

async function getManage(req, res) {
    try {
        const manageData = await Manage.findOne();
        if (!manageData) {
            return res.status(404).json({
                success: 0,
                message: "Chưa có dữ liệu Manage"
            });
        }
        res.json({
            success: 1,
            data: manageData
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: 0,
            message: "Lỗi server khi lấy dữ liệu",
            error: "Lỗi server"
        });
    }
}

async function updateManageImage(req, res) {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: 0,
                message: "Vui lòng upload một file ảnh"
            });
        }

        let manage = await Manage.findOne();
        const updateData = {};
        const imgUrl = `${process.env.ADDRESS}/images/${req.files[0].filename}`;

        if (req.body.topPurchaseUrl && req.body.highestRatingUrl) {
            return res.status(400).json({
                success: 0,
                message: "Chỉ được cập nhật một trường: topPurchaseUrl hoặc highestRatingUrl"
            });
        }

        // Xóa ảnh cũ nếu có
        if (manage) {
            if (req.body.topPurchaseUrl && manage.topPurchaseUrl) {
                const oldFilePath = path.join(__dirname, '../upload/images', path.basename(manage.topPurchaseUrl));
                try {
                    await fs.unlink(oldFilePath);
                } catch (e) {
                    console.log('Không xóa được ảnh cũ:', e);
                }
                updateData.topPurchaseUrl = imgUrl;
            } else if (req.body.highestRatingUrl && manage.highestRatingUrl) {
                const oldFilePath = path.join(__dirname, '../upload/images', path.basename(manage.highestRatingUrl));
                try {
                    await fs.unlink(oldFilePath);
                } catch (e) {
                    console.log('Không xóa được ảnh cũ:', e);
                }
                updateData.highestRatingUrl = imgUrl;
            }
        } else {
            if (req.body.topPurchaseUrl) updateData.topPurchaseUrl = imgUrl;
            if (req.body.highestRatingUrl) updateData.highestRatingUrl = imgUrl;
        }

        let updatedManage;
        if (manage) {
            updatedManage = await Manage.findOneAndUpdate({}, { $set: updateData }, { new: true });
        } else {
            updatedManage = await new Manage(updateData).save();
        }

        res.json({
            success: 1,
            message: "Cập nhật thành công",
            data: updatedManage
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: 0,
            message: "Lỗi server khi cập nhật",
            error: "Lỗi server"
        });
    }
}

async function updateManageImages(req, res) {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: 0,
                message: "Vui lòng upload ít nhất một file ảnh"
            });
        }

        let manage = await Manage.findOne();
        if (!manage) {
            manage = new Manage({ overViewImg: [] });
        }

        const newImgUrls = req.files.map(file => `${process.env.ADDRESS}/images/${file.filename}`);
        manage.overViewImg = [...manage.overViewImg, ...newImgUrls];

        await manage.save();
        res.json({
            success: 1,
            message: "Cập nhật mảng ảnh thành công",
            data: manage
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: 0,
            message: "Lỗi server khi cập nhật mảng ảnh",
            error: "Lỗi server"
        });
    }
}

async function updatePartnerImages(req, res) {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: 0,
                message: "Vui lòng upload ít nhất một file ảnh"
            });
        }

        let manage = await Manage.findOne();
        if (!manage) {
            manage = new Manage({ partners: [] });
        }

        const newImgUrls = req.files.map(file => `${process.env.ADDRESS}/images/${file.filename}`);
        const currentPartnerImages = Array.isArray(manage.partners)
            ? manage.partners.filter(isImageAssetPath)
            : [];
        manage.partners = [...currentPartnerImages, ...newImgUrls];

        await manage.save();
        res.json({
            success: 1,
            message: "Cập nhật ảnh đối tác thành công",
            data: manage
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: 0,
            message: "Lỗi server khi cập nhật ảnh đối tác",
            error: "Lỗi server"
        });
    }
}

async function updatePartnerText(req, res) {
    try {
        const { partners, displayPartners } = req.body;

        if (partners && !Array.isArray(partners)) {
            return res.status(400).json({
                success: 0,
                message: "partners phải là một mảng chuỗi text"
            });
        }
        if (displayPartners !== undefined && typeof displayPartners !== 'boolean') {
            return res.status(400).json({
                success: 0,
                message: "displayPartners phải là giá trị boolean"
            });
        }

        let manage = await Manage.findOne();
        let updatedManage;

        const updateData = {};
        if (partners !== undefined) updateData.partners = partners;
        if (displayPartners !== undefined) updateData.displayPartners = displayPartners;

        if (manage) {
            updatedManage = await Manage.findOneAndUpdate(
                {},
                { $set: updateData },
                { new: true }
            );
        } else {
            updatedManage = await new Manage({
                partners: partners || [],
                displayPartners: displayPartners !== undefined ? displayPartners : true
            }).save();
        }

        res.json({
            success: 1,
            message: "Cập nhật cấu hình đối tác thành công",
            data: updatedManage
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: 0,
            message: "Lỗi server khi cập nhật cấu hình đối tác",
            error: "Lỗi server"
        });
    }
}

async function updateFooterContent(req, res) {
    try {
        const footerContent = req.body?.footerContent || req.body || {};
        const fieldLimits = {
            logo: 1000,
            description: 1000,
            address: 500,
            phone: 50,
            email: 254
        };
        const updateData = {};

        for (const [field, maxLength] of Object.entries(fieldLimits)) {
            if (footerContent[field] === undefined) continue;
            if (typeof footerContent[field] !== "string") {
                return res.status(400).json({
                    success: 0,
                    message: `${field} phải là chuỗi`
                });
            }

            const normalizedValue = footerContent[field].trim();
            if (normalizedValue.length > maxLength) {
                return res.status(400).json({
                    success: 0,
                    message: `${field} vượt quá độ dài cho phép`
                });
            }
            updateData[`footerContent.${field}`] = normalizedValue;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: 0,
                message: "Vui lòng cung cấp nội dung footer cần cập nhật"
            });
        }

        const normalizedEmail = updateData["footerContent.email"];
        if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({
                success: 0,
                message: "Email footer không hợp lệ"
            });
        }

        const updatedManage = await Manage.findOneAndUpdate(
            {},
            { $set: updateData },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json({
            success: 1,
            message: "Cập nhật nội dung footer thành công",
            data: updatedManage
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: 0,
            message: "Lỗi server khi cập nhật nội dung footer"
        });
    }
}

async function updateHomeCategories(req, res) {
    try {
        const {
            configured = true,
            sidebarTitle = "Danh mục sản phẩm",
            sidebarTitleTranslations,
            showSidebar = true,
            showQuickCategories = true,
            items = []
        } = req.body || {};

        if (typeof configured !== 'boolean') {
            return res.status(400).json({ success: 0, message: "configured phải là giá trị boolean" });
        }
        if (typeof sidebarTitle !== 'string' || sidebarTitle.trim().length > 80) {
            return res.status(400).json({ success: 0, message: "Tiêu đề danh mục không hợp lệ" });
        }
        const normalizedSidebarTitle = normalizeLocalizedText(sidebarTitleTranslations, sidebarTitle, 80);
        if (normalizedSidebarTitle.error) {
            return res.status(400).json({ success: 0, message: normalizedSidebarTitle.error });
        }
        if (typeof showSidebar !== 'boolean' || typeof showQuickCategories !== 'boolean') {
            return res.status(400).json({ success: 0, message: "Trạng thái hiển thị không hợp lệ" });
        }
        if (!Array.isArray(items) || items.length > 30) {
            return res.status(400).json({ success: 0, message: "Danh sách danh mục phải là mảng và không vượt quá 30 mục" });
        }

        const normalizedItems = [];
        const usedIds = new Set();

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return res.status(400).json({ success: 0, message: `Danh mục thứ ${index + 1} không hợp lệ` });
            }

            const label = typeof item.label === 'string' ? item.label.trim() : '';
            const normalizedLabel = normalizeLocalizedText(item.labelTranslations, label, 80);
            if (normalizedLabel.error) {
                return res.status(400).json({ success: 0, message: normalizedLabel.error });
            }
            const type = typeof item.type === 'string' ? item.type.trim() : '';
            const link = typeof item.link === 'string' ? item.link.trim() : '';
            const icon = typeof item.icon === 'string' ? item.icon.trim() : 'ri-tb-box-multiple';
            const image = typeof item.image === 'string' ? item.image.trim() : '';

            if (!label || label.length > 80) {
                return res.status(400).json({ success: 0, message: `Tên hiển thị của danh mục thứ ${index + 1} không hợp lệ` });
            }
            if (!type && !link) {
                return res.status(400).json({ success: 0, message: `Danh mục "${label}" cần có loại sản phẩm hoặc liên kết tùy chỉnh` });
            }
            if (type.length > 100 || link.length > 500 || image.length > 1000) {
                return res.status(400).json({ success: 0, message: `Dữ liệu của danh mục "${label}" vượt quá độ dài cho phép` });
            }
            if (!/^(fa-[a-z0-9-]+|ri-[a-z0-9-]+)$/.test(icon)) {
                return res.status(400).json({ success: 0, message: `Icon của danh mục "${label}" không hợp lệ` });
            }
            if (item.showSidebar !== undefined && typeof item.showSidebar !== 'boolean') {
                return res.status(400).json({ success: 0, message: `Trạng thái menu trái của danh mục "${label}" không hợp lệ` });
            }
            if (item.showQuick !== undefined && typeof item.showQuick !== 'boolean') {
                return res.status(400).json({ success: 0, message: `Trạng thái danh mục ngang của danh mục "${label}" không hợp lệ` });
            }

            let id = typeof item.id === 'string' ? item.id.trim().slice(0, 100) : '';
            if (!id || usedIds.has(id)) {
                id = new mongoose.Types.ObjectId().toString();
            }
            usedIds.add(id);

            normalizedItems.push({
                id,
                label,
                labelTranslations: normalizedLabel.value,
                type,
                link,
                icon,
                image,
                showSidebar: item.showSidebar !== false,
                showQuick: item.showQuick !== false
            });
        }

        const homeCategoryConfig = {
            configured,
            sidebarTitle: sidebarTitle.trim() || "Danh mục sản phẩm",
            sidebarTitleTranslations: normalizedSidebarTitle.value,
            showSidebar,
            showQuickCategories,
            items: normalizedItems
        };

        const updatedManage = await Manage.findOneAndUpdate(
            {},
            { $set: { homeCategoryConfig } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json({
            success: 1,
            message: "Cập nhật danh mục trang chủ thành công",
            data: updatedManage
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: 0,
            message: "Lỗi server khi cập nhật danh mục trang chủ",
            error: "Lỗi server"
        });
    }
}

async function uploadSectionImage(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: 0,
                message: "Vui lòng tải lên một file ảnh"
            });
        }
        const imgUrl = `${process.env.ADDRESS}/images/${req.file.filename}`;
        res.json({
            success: 1,
            message: "Tải ảnh lên thành công",
            imgUrl
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: 0,
            message: "Lỗi server khi tải ảnh lên"
        });
    }
}

async function deleteManageImage(req, res) {
    try {
        const { imgUrl } = req.body;

        if (!imgUrl || typeof imgUrl !== 'string') {
            return res.status(400).json({
                success: 0,
                message: "Vui lòng cung cấp imgUrl hợp lệ để xóa ảnh"
            });
        }

        const manage = await Manage.findOne();
        if (!manage) {
            return res.status(404).json({
                success: 0,
                message: "Không tìm thấy dữ liệu Manage"
            });
        }

        let updated = false;

        // Xóa ảnh khỏi overViewImg nếu có
        if (manage.overViewImg.includes(imgUrl)) {
            const filename = path.basename(imgUrl);
            const filePath = path.join(__dirname, '../upload/images', filename);
            try {
                await fs.unlink(filePath);
            } catch (e) {
                console.log('Không xóa được file:', e);
            }
            manage.overViewImg = manage.overViewImg.filter(url => url !== imgUrl);
            updated = true;
        }
        // Xóa ảnh khỏi partners nếu có
        else if (manage.partners.includes(imgUrl)) {
            const filename = path.basename(imgUrl);
            const filePath = path.join(__dirname, '../upload/images', filename);
            try {
                await fs.unlink(filePath);
            } catch (e) {
                console.log('Không xóa được file:', e);
            }
            manage.partners = manage.partners.filter(url => url !== imgUrl);
            updated = true;
        }
        // Xóa ảnh khỏi các trường khác nếu trùng
        else if (manage.topPurchaseUrl === imgUrl) {
            const filename = path.basename(imgUrl);
            const filePath = path.join(__dirname, '../upload/images', filename);
            try {
                await fs.unlink(filePath);
            } catch (e) {
                console.log('Không xóa được file:', e);
            }
            manage.topPurchaseUrl = '';
            updated = true;
        } else if (manage.highestRatingUrl === imgUrl) {
            const filename = path.basename(imgUrl);
            const filePath = path.join(__dirname, '../upload/images', filename);
            try {
                await fs.unlink(filePath);
            } catch (e) {
                console.log('Không xóa được file:', e);
            }
            manage.highestRatingUrl = '';
            updated = true;
        } else if (manage.newProductUrl === imgUrl) {
            const filename = path.basename(imgUrl);
            const filePath = path.join(__dirname, '../upload/images', filename);
            try {
                await fs.unlink(filePath);
            } catch (e) {
                console.log('Không xóa được file:', e);
            }
            manage.newProductUrl = '';
            updated = true;
        }

        if (!updated) {
            return res.status(404).json({
                success: 0,
                message: "Ảnh không tồn tại trong dữ liệu"
            });
        }

        await manage.save();
        res.json({
            success: 1,
            message: "Xóa ảnh thành công",
            data: manage
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: 0,
            message: "Lỗi server khi xóa ảnh",
            error: "Lỗi server"
        });
    }
}

async function updateIntroduction(req, res) {
    try {
        const { introduction = '', translations } = req.body;

        if (typeof introduction !== 'string') {
            return res.status(400).json({
                success: 0,
                message: "Vui lòng cung cấp giá trị hợp lệ cho introduction"
            });
        }

        const normalizedTranslations = normalizeLocalizedText(translations, introduction, 20000);
        if (normalizedTranslations.error) {
            return res.status(400).json({ success: 0, message: normalizedTranslations.error });
        }
        const introductionValue = normalizedTranslations.value.vi;

        let manage = await Manage.findOne();
        let updatedManage;

        if (manage) {
            updatedManage = await Manage.findOneAndUpdate(
                {},
                { $set: { introduction: introductionValue, introductionTranslations: normalizedTranslations.value } },
                { new: true }
            );
        } else {
            updatedManage = await new Manage({
                introduction: introductionValue,
                introductionTranslations: normalizedTranslations.value
            }).save();
        }

        res.json({
            success: 1,
            message: "Cập nhật introduction thành công",
            data: updatedManage
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: 0,
            message: "Lỗi server khi cập nhật introduction",
            error: "Lỗi server"
        });
    }
}

module.exports = {
  getManage,
  updateManageImage,
  updateManageImages,
  updatePartnerImages,
  updatePartnerText,
  updateFooterContent,
  updateHomeCategories,
  uploadSectionImage,
  deleteManageImage,
  updateIntroduction,
};
