const { removeVietnameseTones } = require('./textNormalization');

function limitRegexInput(value) {
    return String(value || '').slice(0, 100);
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateFuzzyCodeRegex(rawCode) {
    if (!rawCode) return null;
    const cleanCode = String(rawCode).replace(/[^a-zA-Z0-9]/g, '');
    if (!cleanCode) return null;
    const regexPattern = cleanCode.split('').join('[\\s\\-\\/\\.]*');
    return new RegExp(regexPattern, 'i');
}

function buildTokenQuery(token) {
    const limitedToken = limitRegexInput(token);
    const tokenUnsigned = removeVietnameseTones(limitedToken);
    const safeToken = escapeRegex(limitedToken);
    const safeTokenUnsigned = escapeRegex(tokenUnsigned);
    const fuzzyToken = /^(relay|rơ\s+le)$/i.test(limitedToken)
        ? '(relay|rơ\\s+le)'
        : /^(xi|xy)$/i.test(limitedToken)
            ? '(xi|xy)'
            : /^(ki|ky)$/i.test(limitedToken)
                ? '(ki|ky)'
                : safeToken;
    const fuzzyTokenUnsigned = /^(relay|ro\s+le)$/i.test(tokenUnsigned)
        ? '(relay|ro\\s+le)'
        : /^(xi|xy)$/i.test(tokenUnsigned)
            ? '(xi|xy)'
            : /^(ki|ky)$/i.test(tokenUnsigned)
                ? '(ki|ky)'
                : safeTokenUnsigned;

    const fuzzyCodeRegex = generateFuzzyCodeRegex(limitedToken);
    return {
        $or: [
            { name: { $regex: fuzzyToken, $options: "i" } },
            { nameUnsigned: { $regex: fuzzyTokenUnsigned, $options: "i" } },
            { code: fuzzyCodeRegex || { $regex: safeToken, $options: "i" } },
            { brand: { $regex: safeToken, $options: "i" } }
        ]
    };
}

async function greedyNarrowTokens(tokens, runFn) {
    let kept = [];
    let bestProducts = [];
    let bestTotal = 0;
    for (const tk of tokens) {
        const trial = [...kept, tk];
        const [products, total] = await runFn(trial);
        if (total > 0) {
            kept = trial;
            bestProducts = products;
            bestTotal = total;
        }
    }
    return { tokens: kept, products: bestProducts, total: bestTotal };
}

module.exports = {
    limitRegexInput,
    escapeRegex,
    generateFuzzyCodeRegex,
    buildTokenQuery,
    greedyNarrowTokens
};
