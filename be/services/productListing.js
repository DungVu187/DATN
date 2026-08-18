const { Product } = require('../models/product');
const {
    buildProductVisibilityFilter,
    loadProductViewer,
} = require('./productAccess');
const {
    calculateProductAdjustedStatus,
    stripPrivateVariantFields,
} = require('./productPresentation');
const {
    buildTokenQuery,
    greedyNarrowTokens,
} = require('../utils/productSearch');
const {
    buildProductListingFilter,
    buildProductListingSortCriteria,
    parseProductListingQuery,
    rankProductsBySearch,
} = require('../utils/productListing');
const { stripSearchEdgeWords } = require('../utils/productSearchTerms');

async function listProducts({ query, userId }) {
    const {
        pageNum,
        limitNum,
        skip,
        adjustedFilter,
        search,
        code,
        type,
        brand,
        section,
        value,
        sortBy,
        sortOrder,
        display,
    } = parseProductListingQuery(query);
    const { filter, codeAndQueries } = buildProductListingFilter({
        search,
        code,
        type,
        brand,
        section,
        value,
    });

    const viewer = await loadProductViewer(userId);
    const requesterRole = viewer?.role || 'guest';
    const { filter: visibilityFilter } = await buildProductVisibilityFilter(viewer);
    Object.assign(filter, visibilityFilter);

    if (['superadmin', 'admin', 'staff'].includes(requesterRole) && display !== undefined) {
        filter.display = display === 'true';
    }

    const sortCriteria = buildProductListingSortCriteria(sortBy, sortOrder);

    const runQuery = async (queryFilter) => {
        let localProducts;
        let localTotal;
        if (adjustedFilter === null) {
            if (search && search.trim() !== '') {
                const allMatched = await Product.find(queryFilter).sort(sortCriteria);
                rankProductsBySearch(allMatched, search);
                localTotal = allMatched.length;
                localProducts = allMatched.slice(skip, skip + limitNum);
            } else {
                [localProducts, localTotal] = await Promise.all([
                    Product.find(queryFilter)
                        .sort(sortCriteria)
                        .skip(skip)
                        .limit(limitNum),
                    Product.countDocuments(queryFilter),
                ]);
            }
        } else {
            const matchedProducts = await Product.find(queryFilter).sort(sortCriteria);
            const adjustedProducts = matchedProducts.filter(product =>
                calculateProductAdjustedStatus(product) === adjustedFilter
            );

            if (search && search.trim() !== '') {
                rankProductsBySearch(adjustedProducts, search);
            }
            localTotal = adjustedProducts.length;
            localProducts = adjustedProducts.slice(skip, skip + limitNum);
        }
        return [localProducts, localTotal];
    };

    let [products, total] = await runQuery(filter);

    if (total === 0 && ((type && type !== '') || (brand && brand !== ''))) {
        const relaxedFilter = { ...filter };
        delete relaxedFilter.type;
        delete relaxedFilter.brand;
        [products, total] = await runQuery(relaxedFilter);
    }

    if (total === 0 && search && search.trim() !== '') {
        const entityTokens = stripSearchEdgeWords(search);
        if (entityTokens.length >= 2) {
            const runWithTokens = async (subsetTokens) => {
                const subFilter = { ...filter };
                const combined = [...subsetTokens.map(buildTokenQuery), ...codeAndQueries];
                if (combined.length > 0) {
                    subFilter.$and = combined;
                } else {
                    delete subFilter.$and;
                }
                return runQuery(subFilter);
            };
            const narrowed = await greedyNarrowTokens(entityTokens, runWithTokens);
            if (narrowed.total > 0) {
                products = narrowed.products;
                total = narrowed.total;
            }
        }
    }

    const processedProducts = products.map(product => {
        const productObj = requesterRole === 'customer' || requesterRole === 'guest'
            ? stripPrivateVariantFields(product)
            : product.toJSON();
        return {
            ...productObj,
            adjusted: calculateProductAdjustedStatus(productObj),
            purchaseCount: productObj.purchaseCount || 0,
            averageReviews: productObj.averageReviews || 0,
        };
    });

    return {
        total,
        page: pageNum,
        limit: limitNum,
        products: processedProducts,
    };
}

module.exports = {
    listProducts,
};
