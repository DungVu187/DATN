const {
    ProductMediaError,
    cleanTemporaryInvoiceImage,
    deleteVariantImage,
} = require('../services/productMedia');

function respondProductImageUpload(req, res) {
    if (!req.file) {
        return res.status(400).json({ success: 0, message: 'Không có file được upload' });
    }
    const imgUrl = process.env.ADDRESS + '/images/' + req.file.filename;
    return res.json({
        success: 1,
        imgUrl,
    });
}

function respondProductDocumentUpload(req, res) {
    if (!req.file) {
        return res.status(400).json({ success: 0, message: 'Không có file được upload' });
    }
    const url = process.env.ADDRESS + '/documents/' + req.file.filename;
    return res.json({
        success: 1,
        url,
        fileName: req.file.originalname,
    });
}

async function deleteProductVariantImage(req, res) {
    try {
        const product = await deleteVariantImage({
            productId: req.params.id,
            variantIndex: req.params.variantIndex,
        });
        return res.status(200).json({ message: 'Image deleted successfully', product });
    } catch (error) {
        if (error instanceof ProductMediaError) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
}

async function cleanProductTemporaryImage(req, res) {
    try {
        const { imageUrl } = req.query;
        if (!imageUrl) {
            return res.status(400).json({
                success: 0,
                message: 'Thiếu thông tin imageUrl.',
            });
        }

        const message = await cleanTemporaryInvoiceImage(imageUrl);
        return res.json({ success: 1, message });
    } catch (error) {
        if (error instanceof ProductMediaError) {
            return res.status(error.statusCode).json({
                success: 0,
                message: error.message,
            });
        }

        console.error('Lỗi khi xóa ảnh tạm:', error);
        return res.status(500).json({
            success: 0,
            message: 'Lỗi server khi xóa ảnh tạm.',
        });
    }
}

module.exports = {
    cleanProductTemporaryImage,
    deleteProductVariantImage,
    respondProductDocumentUpload,
    respondProductImageUpload,
};
