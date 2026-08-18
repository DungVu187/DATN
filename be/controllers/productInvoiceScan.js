const { Brand } = require('../models/chip');
const { Product } = require('../models/product');
const {
    rollbackInvoiceScanFile,
    storeInvoiceScanFile,
} = require('../services/invoiceScanFileLifecycle');
const { extractInvoiceItemsWithGemini } = require('../services/productInvoiceGemini');
const { matchInvoiceItemsToProducts } = require('../services/productInvoiceMatching');
const { INVOICE_SCAN_SYSTEM_PROMPT } = require('../services/productInvoicePrompt');

async function scanProductInvoice(req, res) {
    let storedInvoiceFile = null;
    let invoiceFileHandedOff = false;

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
            return res.status(400).json({
                success: 0,
                message: 'Vui lòng cấu hình GEMINI_API_KEY hợp lệ trong file be/.env trước khi sử dụng tính năng này.',
            });
        }

        if (!req.file) {
            return res.status(400).json({ success: 0, message: 'Không có file ảnh được tải lên.' });
        }

        const activeProducts = await Product.find({ display: true })
            .select('_id name code brand variant vat');
        const base64Image = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        storedInvoiceFile = await storeInvoiceScanFile(req.file);
        const { imageUrl } = storedInvoiceFile;

        const items = await extractInvoiceItemsWithGemini({
            apiKey,
            systemPrompt: INVOICE_SCAN_SYSTEM_PROMPT,
            mimeType,
            base64Image,
        });
        const brandDocs = await Brand.find().select('Brand').lean();
        const matchedItems = matchInvoiceItemsToProducts({
            items,
            activeProducts,
            brandDocs,
        });

        invoiceFileHandedOff = true;
        return res.json({
            success: 1,
            imageUrl,
            total: matchedItems.length,
            items: matchedItems,
        });
    } catch (error) {
        if (storedInvoiceFile && !invoiceFileHandedOff) {
            try {
                await rollbackInvoiceScanFile(storedInvoiceFile);
            } catch (rollbackError) {
                console.error('Lỗi khi rollback ảnh hóa đơn quét:', rollbackError);
            }
        }
        console.error('Lỗi khi quét hóa đơn bằng AI:', error);
        return res.status(500).json({
            success: 0,
            message: `Đã xảy ra lỗi khi phân tích hóa đơn bằng AI: ${"Lỗi server"}`,
            error: 'Lỗi server',
        });
    }
}

module.exports = {
    scanProductInvoice,
};
