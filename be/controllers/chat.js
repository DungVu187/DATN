const mongoose = require('mongoose');
const { Order } = require('../models/order');
const { CustomerBehavior } = require('../models/customerbehavior');
const { buildChatContext } = require('../services/chatContext');
const { classifyChatIntent, isGeminiRequired } = require('../services/chatIntent');
const { generateChatResponse, GeminiChatError } = require('../services/geminiChat');
const {
    CustomerBehaviorValidationError,
    validateCustomerBehaviorPayload,
} = require('../validators/customerBehavior');
const {
    ChatValidationError,
    validateChatClearPayload,
    validateChatSendPayload,
} = require('../validators/chat');

function isValidationError(error) {
    return error instanceof CustomerBehaviorValidationError
        || error instanceof mongoose.Error.ValidationError
        || error instanceof mongoose.Error.CastError;
}

const LOCAL_REPLIES = {
    greeting: 'Chào bạn 👋 Mình là trợ lý NOVA. Bạn đang muốn tìm sản phẩm, hỏi giá, kiểm tra tồn kho hay cần tư vấn kỹ thuật?',
    nonsense_query: 'Mình chưa hiểu câu hỏi. Bạn thử hỏi về sản phẩm, giá, tồn kho, thông số, giao hàng hoặc bảo hành nhé.',
    out_of_scope: 'Mình chỉ hỗ trợ sản phẩm, chính sách mua hàng, giao hàng, bảo hành và đơn hàng của NOVA.',
};

function formatPrice(value) {
    const numeric = Number(String(value || '').replace(/\./g, ''));
    return Number.isFinite(numeric) && numeric > 0
        ? new Intl.NumberFormat('vi-VN').format(numeric) + ' đ'
        : 'liên hệ báo giá';
}

function getFallbackProducts(context) {
    return [...(context.products || []), ...(context.similarProducts || [])]
        .filter((product, index, products) => products.findIndex((item) => item.productId === product.productId) === index)
        .slice(0, 5);
}

function buildLocalProductReply(intent, context) {
    const products = getFallbackProducts(context);
    if (products.length === 0) {
        return {
            reply: 'Mình chưa tìm thấy sản phẩm phù hợp trong dữ liệu hiện tại. Bạn thử gửi tên, mã hoặc nhu cầu sử dụng cụ thể hơn nhé.',
            products: [],
        };
    }

    const first = products[0];
    if (intent === 'price_query') {
        const variant = first.variants?.[0];
        return {
            reply: first.availability === 'out_of_stock'
                ? `Sản phẩm ${first.name} hiện đã hết hàng.`
                : `Sản phẩm ${first.name} hiện có giá ${formatPrice(variant?.price)}.`,
            products: [first],
        };
    }
    if (intent === 'stock_query') {
        const quantity = first.variants?.reduce((sum, variant) => sum + Number(variant.quantityForSale || 0), 0) || 0;
        return {
            reply: first.availability === 'out_of_stock'
                ? `Sản phẩm ${first.name} hiện đã hết hàng.`
                : first.availability === 'contact_for_price'
                    ? `${first.name} hiện còn khoảng ${quantity} sản phẩm, nhưng cần liên hệ để báo giá.`
                    : `${first.name} hiện còn khoảng ${quantity} sản phẩm và có thể đặt mua trực tiếp.`,
            products: [first],
        };
    }
    if (intent === 'specification_query') {
        return {
            reply: `${first.name}: ${first.specifications || first.description || 'Hiện chưa có thông số phù hợp để hiển thị.'}`,
            products: [first],
        };
    }
    if (intent === 'similar_product') {
        const alternatives = (context.similarProducts || []).slice(0, 3);
        return {
            reply: alternatives.length > 0
                ? `Mình tìm được ${alternatives.length} sản phẩm tương tự để bạn tham khảo.`
                : 'Mình chưa tìm thấy sản phẩm tương tự còn phù hợp trong dữ liệu hiện tại.',
            products: alternatives,
        };
    }

    return {
        reply: `Mình tìm thấy ${products.length} sản phẩm phù hợp để bạn tham khảo.`,
        products,
    };
}

function buildPolicyReply(context) {
    if (!context.policies || context.policies.length === 0) {
        return 'Bạn vui lòng nói rõ muốn hỏi chính sách mua hàng, giao hàng hay bảo hành để mình hỗ trợ chính xác hơn nhé.';
    }
    const policy = context.policies[0];
    const content = policy.sections?.slice(0, 3).map((section) => `${section.title}: ${section.content}`).join(' \n') || policy.summary;
    return `${policy.title}:\n${content}`.slice(0, 3000);
}

async function getOwnOrderStatuses(user) {
    if (!user?.phone) return [];
    return Order.find({ userPhone: user.phone })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('orderCode status state paymentStatus createdAt total')
        .lean();
}

function buildOrderReply(orders) {
    if (orders.length === 0) return 'Mình chưa tìm thấy đơn hàng nào gắn với tài khoản của bạn.';
    return orders.map((order) => {
        const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString('vi-VN') : '';
        return `Đơn ${order.orderCode || 'chưa có mã'}: trạng thái ${order.status || order.state || 'đang xử lý'}, thanh toán ${order.paymentStatus || 'chưa cập nhật'}${date ? `, ngày ${date}` : ''}.`;
    }).join('\n');
}

function filterGeminiProducts(result, context) {
    const allowed = new Map([...context.products, ...context.similarProducts].map((product) => [product.productId, product]));
    const selected = (result.products || [])
        .map((item) => ({ ...item, product: allowed.get(item.productId) }))
        .filter((item) => item.product);
    return selected.map((item) => ({
        ...item.product,
        reason: normalizeProductReason(item.reason, item.product),
    }));
}

function normalizeProductReason(reason, product) {
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    const technicalReasons = new Set([
        'available', 'contact_for_price', 'out_of_stock', 'same_type',
        'same_brand', 'same_section', 'in_stock',
    ]);
    if (normalizedReason && !technicalReasons.has(normalizedReason.toLowerCase())) {
        return normalizedReason.slice(0, 300);
    }
    if (product.availability === 'available') return 'Đang còn hàng và có thể đặt mua trực tiếp.';
    if (product.availability === 'contact_for_price') return 'Đang còn hàng, cần liên hệ để được báo giá.';
    return 'Sản phẩm phù hợp để tham khảo, hiện đã hết hàng.';
}

function shouldCompactGeminiReply(reply, context) {
    const normalizedReply = String(reply || '').trim();
    if (!normalizedReply || normalizedReply.length > 360) return true;
    if (normalizedReply.split(/\n+/).filter(Boolean).length > 3) return true;

    const mentionedNames = (context.products || [])
        .filter((product) => product.name && normalizedReply.includes(product.name)).length;
    const mentionedCodes = (context.products || [])
        .filter((product) => product.code && normalizedReply.includes(product.code)).length;
    return mentionedNames >= 2 || mentionedCodes >= 2;
}

function buildCompactProductReply(intent, context) {
    const products = [...(context.products || []), ...(context.similarProducts || [])]
        .filter((product, index, all) => all.findIndex((item) => item.productId === product.productId) === index);
    const count = products.length;
    const availableCount = products.filter((product) => product.availability === 'available').length;
    const contactCount = products.filter((product) => product.availability === 'contact_for_price').length;

    if (count === 0) return 'Mình chưa tìm thấy sản phẩm phù hợp trong dữ liệu hiện tại. Bạn thử gửi tên, mã hoặc nhu cầu cụ thể hơn nhé.';
    if (intent === 'similar_product') return 'Mình tìm thấy ' + count + ' lựa chọn tương tự. Mình ưu tiên các sản phẩm cùng nhóm và đang còn hàng để bạn tham khảo.';
    if (intent === 'price_query') return 'Mình đã kiểm tra giá sản phẩm phù hợp. Bạn xem mức giá hiện tại ngay trên các thẻ sản phẩm bên dưới nhé.';
    if (intent === 'stock_query') return 'Mình đã kiểm tra tồn kho. Có ' + availableCount + ' sản phẩm có thể mua trực tiếp' + (contactCount ? ' và ' + contactCount + ' sản phẩm cần liên hệ báo giá' : '') + '; số lượng chi tiết nằm trên từng thẻ.';
    if (intent === 'specification_query') return 'Mình tìm thấy ' + count + ' sản phẩm có thông tin kỹ thuật phù hợp. Bạn mở thẻ sản phẩm để xem chi tiết nhé.';
    return 'NOVA tìm thấy ' + count + ' sản phẩm phù hợp' + (availableCount ? ', trong đó ' + availableCount + ' sản phẩm có thể mua trực tiếp' : '') + '. Bạn xem tên, mã, giá và tồn kho ở các thẻ bên dưới nhé.';
}

async function sendChatMessage(req, res) {
    try {
        const payload = validateChatSendPayload(req.body);
        const userId = req.user?.userId || req.user?._id;
        const intent = classifyChatIntent(payload.message);

        if (intent === 'warranty_query' || intent === 'shipping_query') {
            const context = await buildChatContext({ ...payload, userId });
            return res.json({ success: 1, reply: buildPolicyReply(context), intent, products: [], needsHuman: false });
        }

        if (intent === 'order_status_query') {
            if (!req.user) {
                return res.status(401).json({ success: 0, message: 'Vui lòng đăng nhập để xem trạng thái đơn hàng của bạn.' });
            }
            const orders = await getOwnOrderStatuses(req.user);
            return res.json({ success: 1, reply: buildOrderReply(orders), intent, products: [], needsHuman: false });
        }

        if (!isGeminiRequired(intent)) {
            return res.json({ success: 1, reply: LOCAL_REPLIES[intent], intent, products: [], needsHuman: false });
        }

        const context = await buildChatContext({ ...payload, userId });
        try {
            const result = await generateChatResponse({
                intent,
                context,
                history: payload.history,
            });
            const products = filterGeminiProducts(result, context);
            const reply = shouldCompactGeminiReply(result.reply, context)
                ? buildCompactProductReply(intent, context)
                : result.reply;
            return res.json({
                success: 1,
                reply,
                intent,
                products,
                needsHuman: result.needsHuman,
            });
        } catch (error) {
            if (!(error instanceof GeminiChatError)) throw error;
            const fallback = buildLocalProductReply(intent, context);
            return res.json({
                success: 1,
                reply: fallback.reply,
                intent,
                products: fallback.products,
                needsHuman: true,
                fallback: true,
            });
        }
    } catch (error) {
        if (error instanceof ChatValidationError || isValidationError(error)) {
            return res.status(400).json({ success: 0, message: error.message });
        }
        console.error('Error processing chat message:', error);
        return res.status(500).json({ success: 0, message: 'Trợ lý đang tạm thời không phản hồi. Vui lòng thử lại sau.' });
    }
}

async function clearChat(req, res) {
    try {
        validateChatClearPayload(req.body);
        return res.json({ success: 1, message: 'Đã xóa lịch sử phiên chat.' });
    } catch (error) {
        if (error instanceof ChatValidationError) {
            return res.status(400).json({ success: 0, message: error.message });
        }
        return res.status(500).json({ success: 0, message: 'Không thể xóa lịch sử chat lúc này.' });
    }
}

async function recordCustomerBehavior(req, res) {
    try {
        const { events } = validateCustomerBehaviorPayload(req.body);

        // userId luôn lấy từ cookie đã xác thực, không tin giá trị frontend gửi lên.
        const authenticatedUserId = req.user?.userId || req.user?._id;
        const documents = events.map((event) => ({
            ...event,
            ...(authenticatedUserId ? { userId: authenticatedUserId } : {}),
        }));

        const createdEvents = await CustomerBehavior.insertMany(documents, { ordered: true });

        return res.status(201).json({
            success: 1,
            accepted: createdEvents.length,
        });
    } catch (error) {
        if (isValidationError(error)) {
            return res.status(400).json({
                success: 0,
                message: error.message,
            });
        }

        console.error('Error recording customer behavior:', error);
        return res.status(500).json({
            success: 0,
            message: 'Không thể lưu hành vi khách hàng lúc này.',
        });
    }
}

module.exports = {
    clearChat,
    recordCustomerBehavior,
    sendChatMessage,
};
