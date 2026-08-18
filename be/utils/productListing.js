const {
    buildTokenQuery,
    escapeRegex,
    generateFuzzyCodeRegex,
    limitRegexInput,
} = require('./productSearch');
const { removeVietnameseTones } = require('./textNormalization');

function parseProductListingQuery(query) {
    const {
        page = 1,
        limit = 100,
        search = '',
        code = '',
        type,
        brand,
        section,
        value,
        sortBy = 'purchaseCount',
        sortOrder = 'desc',
        display,
        adjusted,
    } = query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 100);

    return {
        pageNum,
        limitNum,
        skip: (pageNum - 1) * limitNum,
        adjustedFilter: adjusted !== undefined && adjusted !== ''
            ? adjusted === 'true'
            : null,
        search,
        code,
        type,
        brand,
        section,
        value,
        sortBy,
        sortOrder,
        display,
    };
}

function buildProductListingFilter({ search, code, type, brand, section, value }) {
    const filter = {};
    const searchAndQueries = [];
    const codeAndQueries = [];
    const boundedSearch = limitRegexInput(search);
    const boundedCode = limitRegexInput(code);

    if (boundedSearch && boundedSearch.trim() !== '') {
        const tokens = boundedSearch.split(/\s+/).filter(token => token.length > 0);
        tokens.forEach(token => {
            searchAndQueries.push(buildTokenQuery(token));
        });
    }

    if (boundedCode && boundedCode !== '') {
        const fuzzyCodeRegex = generateFuzzyCodeRegex(boundedCode);
        const safeCode = escapeRegex(boundedCode);
        const codeQuery = [
            { code: fuzzyCodeRegex || { $regex: safeCode, $options: 'i' } },
            { name: { $regex: safeCode, $options: 'i' } },
        ];
        codeAndQueries.push({ $or: codeQuery });
    }

    const andQueries = [...searchAndQueries, ...codeAndQueries];
    if (andQueries.length > 0) {
        filter.$and = andQueries;
    }
    if (type && type !== '') filter.type = type;
    if (brand && brand !== '') filter.brand = brand;
    if (section && section !== '') filter.section = section;
    if (value && value !== '') filter.value = value;

    return { filter, codeAndQueries };
}

function buildProductListingSortCriteria(sortBy, sortOrder) {
    const validSortFields = ['purchaseCount', 'averageReviews', 'createdAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'purchaseCount';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    return {
        [sortField]: sortDirection,
        createdAt: -1,
    };
}

function rankProductsBySearch(products, search) {
    const tokens = removeVietnameseTones(search)
        .toLowerCase()
        .split(/\s+/)
        .filter(token => token.length > 0);

    if (tokens.length === 0) return products;

    products.sort((firstProduct, secondProduct) => {
        const score = (product) => {
            const nameLower = removeVietnameseTones(product.name || '').toLowerCase();
            const codeLower = removeVietnameseTones(product.code || '').toLowerCase();
            let matchCount = 0;
            tokens.forEach(token => {
                if (nameLower.includes(token) || codeLower.includes(token)) {
                    matchCount++;
                }
            });
            const fullSearch = removeVietnameseTones(search).toLowerCase();
            if (nameLower.includes(fullSearch) || codeLower.includes(fullSearch)) {
                matchCount += 10;
            }
            return matchCount;
        };
        return score(secondProduct) - score(firstProduct);
    });

    return products;
}

module.exports = {
    buildProductListingFilter,
    buildProductListingSortCriteria,
    parseProductListingQuery,
    rankProductsBySearch,
};
