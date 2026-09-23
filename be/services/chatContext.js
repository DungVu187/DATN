const mongoose = require('mongoose');
const { Product } = require('../models/product');
const { Manage } = require('../models/manage');
const { CustomerBehavior } = require('../models/customerbehavior');
const { createDefaultPolicies } = require('../config/policydefaults');
const { isContactOnlyVariant } = require('./productPricing');
const { removeVietnameseTones } = require('../utils/textNormalization');
const { PRODUCT_SELECT, RELEVANCE, retrieveProducts } = require('./chatRetrieval');

const MAX_MAIN_PRODUCTS = 5;
const MAX_SIMILAR_PRODUCTS = 3;
const MAX_RECENT_BEHAVIORS = 8;
const MAX_POLICY_CONTENT_LENGTH = 2500;
const MAX_QUESTION_LENGTH = 2000;

const POLICY_KEYWORDS = {
    purchase: ['mua hang', 'dat hang', 'huy don', 'thanh toan', 'don hang'],
    warranty: ['bao hanh', 'doi tra', 'sua chua', 'tem bao hanh', 'serial'],
    shipping: ['giao hang', 'giao nhan', 'van chuyen', 'phi ship', 'thoi gian giao', 'ship'],
    privacy: ['bao mat', 'thong tin ca nhan', 'du lieu ca nhan'],
};

const normalizeText = (value, maxLength = 500) => String(value || '').trim().slice(0, maxLength);

const toObjectId = (value) => {
    const normalized = normalizeText(value, 24);
    return mongoose.Types.ObjectId.isValid(normalized)
        ? new mongoose.Types.ObjectId(normalized)
        : null;
};

function getVariantAvailability(variant) {
    const quantityForSale = Number(variant?.quantityForSale || 0);
    const canBuyDirectly = quantityForSale > 0 && !isContactOnlyVariant(variant);

    return {
        price: canBuyDirectly ? String(variant.price || '') : '',
        quantityForSale,
        contactForPrice: !canBuyDirectly,
        canBuyDirectly,
    };
}

function getProductAvailability(variants) {
    const normalizedVariants = Array.isArray(variants) ? variants.map(getVariantAvailability) : [];
    if (normalizedVariants.some((variant) => variant.canBuyDirectly)) return 'available';
    if (normalizedVariants.some((variant) => variant.quantityForSale > 0)) return 'contact_for_price';
    return 'out_of_stock';
}

/**
 * Allowlist công khai duy nhất trước khi dữ liệu đi vào context, prompt hay API.
 * Giữ nguyên thứ tự biến thể gốc để frontend không thêm nhầm hàng.
 */
function toPublicProduct(product) {
    if (!product) return null;

    const source = product?.toObject ? product.toObject() : product;
    const variants = Array.isArray(source.variant)
        ? source.variant.map((variant) => {
            const availability = getVariantAvailability(variant);
            return {
                variantId: variant?._id ? String(variant._id) : undefined,
                price: availability.price,
                quantityForSale: availability.quantityForSale,
                contactForPrice: availability.contactForPrice,
                canBuyDirectly: availability.canBuyDirectly,
                imgUrl: normalizeText(variant?.imgUrl, 1000),
                color: normalizeText(variant?.color, 100),
                shape: normalizeText(variant?.shape, 100),
                buttonCount: normalizeText(variant?.buttonCount, 100),
                frame: normalizeText(variant?.frame, 100),
            };
        })
        : [];

    return {
        productId: source._id ? String(source._id) : undefined,
        name: normalizeText(source.name, 300),
        code: normalizeText(source.code, 100),
        brand: normalizeText(source.brand, 150),
        type: normalizeText(source.type, 150),
        section: normalizeText(source.section, 150),
        value: normalizeText(source.value, 150),
        description: normalizeText(source.description, 1800),
        features: normalizeText(source.features, 1200),
        specifications: normalizeText(source.specifications, 2500),
        warranty: normalizeText(source.warranty, 500),
        availability: getProductAvailability(source.variant),
        averageReviews: Number(source.averageReviews || 0),
        reviewCount: Number(source.reviewCount || 0),
        variants,
    };
}

function dedupeProducts(products) {
    const seen = new Set();
    return products.filter((product) => {
        const id = String(product?.productId || '');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function getPolicyKeysForMessage(message) {
    const normalizedMessage = removeVietnameseTones(String(message || '')).toLowerCase();
    return Object.entries(POLICY_KEYWORDS)
        .filter(([, keywords]) => keywords.some((keyword) => normalizedMessage.includes(keyword)))
        .map(([key]) => key);
}

function normalizePolicy(policy) {
    return {
        key: policy.key,
        title: normalizeText(policy.title, 150),
        summary: normalizeText(policy.summary, 500),
        sections: (policy.sections || []).slice(0, 20).map((section) => ({
            title: normalizeText(section.title, 150),
            content: normalizeText(section.content, MAX_POLICY_CONTENT_LENGTH),
        })),
    };
}

async function loadStorePolicies() {
    const manageData = await Manage.findOne().select('policies').lean();
    return manageData?.policies?.length === 4
        ? manageData.policies
        : createDefaultPolicies();
}

async function getRelevantPolicies(message) {
    const requestedKeys = getPolicyKeysForMessage(message);
    if (requestedKeys.length === 0) return [];

    const policies = await loadStorePolicies();
    return requestedKeys
        .map((key) => policies.find((policy) => policy.key === key))
        .filter(Boolean)
        .map(normalizePolicy);
}

/**
 * Chính sách cho chế độ hỏi đáp chung: đúng nhóm nếu nhận ra được, còn không thì đưa cả bốn.
 * "Có xuất hóa đơn VAT không" không chứa từ khóa chính sách nào, nhưng câu trả lời nằm ở đó.
 */
async function getSupportPolicies(message) {
    const relevant = await getRelevantPolicies(message);
    if (relevant.length > 0) return relevant;
    return (await loadStorePolicies()).map(normalizePolicy);
}

/** Thông tin liên hệ đang hiện công khai ở chân trang; không đọc thêm trường nội bộ nào. */
async function getStoreInfo() {
    const manageData = await Manage.findOne().select('footerContent').lean();
    const footer = manageData?.footerContent || {};
    const info = {
        name: 'NOVA',
        address: normalizeText(footer.address, 300),
        phone: normalizeText(footer.phone, 50),
        email: normalizeText(footer.email, 150),
    };
    return Object.fromEntries(Object.entries(info).filter(([, value]) => value));
}

/** Mỗi lượt đều nạp lại sản phẩm với display:true, giá và tồn kho mới nhất. */
async function hydrateProductsByIds(productIds = []) {
    const objectIds = productIds.map(toObjectId).filter(Boolean);
    if (objectIds.length === 0) return { products: [], missingIds: [] };

    const found = await Product.find({ _id: { $in: objectIds }, display: true })
        .select(PRODUCT_SELECT)
        .lean();
    const byId = new Map(found.map((product) => [String(product._id), product]));
    const ordered = productIds.map((id) => byId.get(String(id))).filter(Boolean);
    const missingIds = productIds.filter((id) => !byId.has(String(id)));
    return { products: ordered, missingIds };
}

async function getCurrentProduct(currentProductId) {
    const objectId = toObjectId(currentProductId);
    if (!objectId) return null;
    return Product.findOne({ _id: objectId, display: true }).select(PRODUCT_SELECT).lean();
}

/**
 * Điểm gợi ý sản phẩm liên quan.
 * Đọc availability đã tính trên biến thể công khai, không đọc lại candidate.variant sau khi map.
 */
function scoreSimilarProduct(anchor, candidate) {
    let score = 0;
    if (anchor.type && candidate.type === anchor.type) score += 5;
    if (anchor.section && candidate.section === anchor.section) score += 2;
    // Cùng hãng chỉ là tín hiệu phụ, không chứng minh thay thế được.
    if (anchor.brand && candidate.brand === anchor.brand) score += 1;

    const anchorTokens = new Set(removeVietnameseTones(anchor.name || '').toLowerCase().split(/\s+/).filter(Boolean));
    const candidateTokens = removeVietnameseTones(candidate.name || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (candidateTokens.some((token) => token.length > 2 && anchorTokens.has(token))) score += 2;
    // Tồn kho là tiêu chí phụ, xét sau khi đã cùng nhóm.
    if (candidate.availability === 'available') score += 1;

    return score;
}

/** Ưu tiên đúng nhóm; chỉ mở sang section khi sản phẩm gốc không có type. */
async function findSimilarProducts(anchor, excludedIds = new Set()) {
    if (!anchor) return [];

    const conditions = [
        anchor.type ? { type: anchor.type } : null,
        !anchor.type && anchor.section ? { section: anchor.section } : null,
    ].filter(Boolean);
    if (conditions.length === 0) return [];

    const filter = {
        display: true,
        _id: { $nin: Array.from(excludedIds).map(toObjectId).filter(Boolean) },
        $or: conditions,
    };
    const candidates = await Product.find(filter).select(PRODUCT_SELECT).limit(60).lean();

    return candidates
        .map(toPublicProduct)
        .sort((first, second) => scoreSimilarProduct(anchor, second) - scoreSimilarProduct(anchor, first))
        .slice(0, MAX_SIMILAR_PRODUCTS);
}

async function getRecentBehavior({ userId, visitorId, sessionId }) {
    const filter = {};
    const authenticatedUserId = toObjectId(userId);

    if (authenticatedUserId) {
        filter.userId = authenticatedUserId;
    } else if (visitorId || sessionId) {
        filter.$or = [
            visitorId ? { visitorId: normalizeText(visitorId, 128) } : null,
            sessionId ? { sessionId: normalizeText(sessionId, 128) } : null,
        ].filter(Boolean);
    } else {
        return [];
    }

    const behaviors = await CustomerBehavior.find(filter)
        .sort({ createdAt: -1 })
        .limit(MAX_RECENT_BEHAVIORS)
        .select('eventType productId query path createdAt')
        .lean();

    const productIds = behaviors
        .map((behavior) => toObjectId(behavior.productId))
        .filter(Boolean);
    const products = productIds.length > 0
        ? await Product.find({ _id: { $in: productIds }, display: true })
            .select('name code brand type section')
            .lean()
        : [];
    const productMap = new Map(products.map((product) => [String(product._id), product]));

    return behaviors.map((behavior) => {
        const product = productMap.get(String(behavior.productId || ''));
        return {
            eventType: behavior.eventType,
            productId: behavior.productId ? String(behavior.productId) : undefined,
            productName: product?.name || undefined,
            productCode: product?.code || undefined,
            productBrand: product?.brand || undefined,
            productType: product?.type || undefined,
            query: normalizeText(behavior.query, 300),
            path: normalizeText(behavior.path, 500),
            createdAt: behavior.createdAt,
        };
    });
}

/**
 * Dựng ngữ cảnh cho một lượt chat.
 * Sản phẩm khách đang hỏi luôn thắng dữ liệu tìm kiếm; hành vi xem hàng không tham gia tư vấn.
 */
async function buildChatContext({
    message = '',
    analysis = null,
    catalog = null,
    referencedProductIds = [],
    currentProductId,
    currentPath,
    includeSimilar = true,
} = {}) {
    const normalizedMessage = normalizeText(message, MAX_QUESTION_LENGTH);

    const [referenced, currentProduct, policies] = await Promise.all([
        hydrateProductsByIds(referencedProductIds),
        getCurrentProduct(currentProductId),
        getRelevantPolicies(normalizedMessage),
    ]);

    let retrieval = null;
    let retrievalError = null;
    const needsSearch = referenced.products.length === 0
        && analysis
        && ['search', 'advice', 'compare', 'details'].includes(analysis.task);

    if (needsSearch) {
        try {
            retrieval = await retrieveProducts({ message: normalizedMessage, catalog, limit: MAX_MAIN_PRODUCTS });
        } catch (error) {
            // Lỗi tra cứu không được suy ra là hết hàng hay ngoài phạm vi.
            console.error('Error retrieving chat products:', error);
            retrievalError = error;
        }
    }

    const publicCurrentProduct = toPublicProduct(currentProduct);
    const referencedPublic = referenced.products.map(toPublicProduct);
    const retrievedPublic = (retrieval?.products || []).map(toPublicProduct);

    const mainProducts = dedupeProducts(
        referencedPublic.length > 0 ? referencedPublic : retrievedPublic
    ).slice(0, MAX_MAIN_PRODUCTS);

    const anchor = mainProducts[0] || publicCurrentProduct || null;
    const excludedIds = new Set(mainProducts.map((product) => product.productId));
    if (publicCurrentProduct) excludedIds.add(publicCurrentProduct.productId);
    const similarProducts = includeSimilar && anchor
        ? await findSimilarProducts(anchor, excludedIds)
        : [];

    return {
        question: normalizedMessage,
        currentPath: normalizeText(currentPath, 500),
        currentProduct: publicCurrentProduct,
        products: mainProducts,
        similarProducts,
        policies,
        retrieval: retrieval
            ? {
                relevance: retrieval.relevance,
                relaxed: retrieval.relaxed,
                queried: retrieval.queried,
                missingCodes: retrieval.missingCodes,
                unverifiedPhrases: retrieval.unverifiedPhrases,
                weakMatch: retrieval.weakMatch === true,
                nearCodeProducts: retrieval.nearCodeProducts.map((item) => ({
                    requestedCode: item.requestedCode,
                    product: toPublicProduct(item.product),
                })),
            }
            : null,
        retrievalFailed: Boolean(retrievalError),
        missingReferencedIds: referenced.missingIds,
        catalogStale: catalog?.stale === true,
    };
}

module.exports = {
    MAX_MAIN_PRODUCTS,
    MAX_RECENT_BEHAVIORS,
    MAX_SIMILAR_PRODUCTS,
    RELEVANCE,
    buildChatContext,
    findSimilarProducts,
    getProductAvailability,
    getRecentBehavior,
    getRelevantPolicies,
    getStoreInfo,
    getSupportPolicies,
    hydrateProductsByIds,
    scoreSimilarProduct,
    toPublicProduct,
};
