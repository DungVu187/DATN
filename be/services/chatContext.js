const mongoose = require('mongoose');
const { Product } = require('../models/product');
const { Manage } = require('../models/manage');
const { CustomerBehavior } = require('../models/customerbehavior');
const { createDefaultPolicies } = require('../config/policydefaults');
const { listProducts } = require('./productListing');
const { isContactOnlyVariant } = require('./productPricing');
const { removeVietnameseTones } = require('../utils/textNormalization');

const MAX_MAIN_PRODUCTS = 5;
const MAX_SIMILAR_PRODUCTS = 3;
const MAX_RECENT_BEHAVIORS = 8;
const MAX_POLICY_CONTENT_LENGTH = 2500;

const POLICY_KEYWORDS = {
    purchase: ['mua hang', 'dat hang', 'huy don', 'thanh toan', 'don hang'],
    warranty: ['bao hanh', 'doi tra', 'sua chua', 'tem bao hanh', 'serial'],
    shipping: ['giao hang', 'giao nhan', 'van chuyen', 'phi ship', 'thoi gian giao', 'ship'],
    privacy: ['bao mat', 'thong tin ca nhan', 'du lieu ca nhan'],
};

const normalizeText = (value, maxLength = 500) => String(value || '').trim().slice(0, maxLength);

const SEARCH_FILLER_WORDS = new Set([
    'toi', 'can', 'muon', 'tim', 'cho', 'hoi', 'biet', 'xem', 'giup',
    'minh', 'mot', 'loai', 'san', 'pham', 'hang', 'nao', 'co', 'khong',
    'con', 'het', 'gia', 'bao', 'nhieu', 'ton', 'kho', 'thong', 'so',
    'ky', 'thuat', 'tuong', 'tu', 'thay', 'the', 'giao', 'nhan',
    'van', 'chuyen', 'bao', 'hanh', 'doi', 'tra', 'cua', 'toi',
]);

function getSearchEntity(message) {
    const normalized = removeVietnameseTones(String(message || ''))
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => !SEARCH_FILLER_WORDS.has(token));
    return normalized.join(' ').slice(0, 300);
}

const toObjectId = (value) => {
    const normalized = normalizeText(value, 24);
    return mongoose.Types.ObjectId.isValid(normalized)
        ? new mongoose.Types.ObjectId(normalized)
        : null;
};

const hasMeaningfulValue = (value) => typeof value === 'string' && value.trim() !== '';

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

async function getRelevantPolicies(message) {
    const requestedKeys = getPolicyKeysForMessage(message);
    if (requestedKeys.length === 0) return [];

    const manageData = await Manage.findOne().select('policies').lean();
    const policies = manageData?.policies?.length === 4
        ? manageData.policies
        : createDefaultPolicies();

    return requestedKeys
        .map((key) => policies.find((policy) => policy.key === key))
        .filter(Boolean)
        .map(normalizePolicy);
}

async function getCurrentProduct(currentProductId) {
    const objectId = toObjectId(currentProductId);
    if (!objectId) return null;

    return Product.findOne({ _id: objectId, display: true })
        .select('name code brand type section value description features specifications warranty averageReviews reviewCount variant')
        .lean();
}

async function searchProducts(message, userId) {
    if (!hasMeaningfulValue(message)) return [];
    const searchEntity = getSearchEntity(message);

    const result = await listProducts({
        query: {
            search: searchEntity || normalizeText(message, 300),
            limit: MAX_MAIN_PRODUCTS,
            sortBy: 'purchaseCount',
            sortOrder: 'desc',
        },
        userId: userId || null,
    });

    return result.products || [];
}

function scoreSimilarProduct(anchor, candidate, recentProductIds = new Set()) {
    let score = 0;
    if (anchor.type && candidate.type === anchor.type) score += 3;
    if (anchor.brand && candidate.brand === anchor.brand) score += 2;
    if (anchor.section && candidate.section === anchor.section) score += 2;

    const anchorTokens = new Set(removeVietnameseTones(anchor.name || '').toLowerCase().split(/\s+/).filter(Boolean));
    const candidateTokens = removeVietnameseTones(candidate.name || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (candidateTokens.some((token) => anchorTokens.has(token))) score += 2;
    if (recentProductIds.has(String(candidate.productId || candidate._id || ''))) score += 1;
    if (getProductAvailability(candidate.variant) === 'available') score += 4;

    return score;
}

async function findSimilarProducts(anchor, excludedIds, recentProductIds) {
    if (!anchor) return [];

    const conditions = [
        anchor.type ? { type: anchor.type } : null,
        anchor.brand ? { brand: anchor.brand } : null,
        anchor.section ? { section: anchor.section } : null,
    ].filter(Boolean);
    if (conditions.length === 0) return [];

    const filter = {
        display: true,
        _id: { $nin: Array.from(excludedIds).map(toObjectId).filter(Boolean) },
        $or: conditions,
    };
    const candidates = await Product.find(filter)
        .select('name code brand type section value description features specifications warranty averageReviews reviewCount variant')
        .limit(60)
        .lean();

    return candidates
        .map(toPublicProduct)
        .sort((first, second) => scoreSimilarProduct(anchor, second, recentProductIds) - scoreSimilarProduct(anchor, first, recentProductIds))
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

async function buildChatContext({
    message = '',
    userId,
    visitorId,
    sessionId,
    currentProductId,
    currentPath,
} = {}) {
    const normalizedMessage = normalizeText(message, 1000);
    const [currentProduct, searchResult, policies, recentBehavior] = await Promise.all([
        getCurrentProduct(currentProductId),
        searchProducts(normalizedMessage, userId),
        getRelevantPolicies(normalizedMessage),
        getRecentBehavior({ userId, visitorId, sessionId }),
    ]);

    const publicCurrentProduct = toPublicProduct(currentProduct);
    const mainProducts = dedupeProducts([
        publicCurrentProduct,
        ...searchResult.map(toPublicProduct),
    ]).slice(0, MAX_MAIN_PRODUCTS);
    const anchor = publicCurrentProduct || mainProducts[0] || null;
    const excludedIds = new Set(mainProducts.map((product) => product.productId));
    const recentProductIds = new Set(recentBehavior.map((behavior) => behavior.productId).filter(Boolean));
    const similarProducts = await findSimilarProducts(anchor, excludedIds, recentProductIds);

    return {
        question: normalizedMessage,
        currentPath: normalizeText(currentPath, 500),
        currentProduct: publicCurrentProduct,
        products: mainProducts,
        similarProducts,
        policies,
        recentBehavior,
    };
}

module.exports = {
    MAX_MAIN_PRODUCTS,
    MAX_SIMILAR_PRODUCTS,
    MAX_RECENT_BEHAVIORS,
    buildChatContext,
    findSimilarProducts,
    getProductAvailability,
    getSearchEntity,
    getRelevantPolicies,
    getRecentBehavior,
    toPublicProduct,
};
