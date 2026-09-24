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

const DIACRITIC_GROUPS = Object.freeze({
    a: 'aàáảãạăằắẳẵặâầấẩẫậ',
    e: 'eèéẻẽẹêềếểễệ',
    i: 'iìíỉĩị',
    o: 'oòóỏõọôồốổỗộơờớởỡợ',
    u: 'uùúủũụưừứửữự',
    y: 'yỳýỷỹỵ',
    d: 'dđ',
});

/** Regex bỏ qua dấu: gõ không dấu ("bien tan") vẫn khớp dữ liệu có dấu ("Biến tần"). */
function buildDiacriticPattern(text, maxLength = 100) {
    return removeVietnameseTones(String(text || '').slice(0, maxLength))
        .toLowerCase()
        .split('')
        .map((character) => {
            if (character === ' ') return '[\\s\\-_.]+';
            const group = DIACRITIC_GROUPS[character];
            return group ? '[' + group + ']' : escapeRegex(character);
        })
        .join('');
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

    // Mã quá ngắn sau khi bỏ ký tự đặc biệt (vd "c++" -> "c") sẽ khớp gần như mọi mã, nên dùng nguyên văn
    const cleanCodeLength = limitedToken.replace(/[^a-zA-Z0-9]/g, '').length;
    const fuzzyCodeRegex = cleanCodeLength >= 2 ? generateFuzzyCodeRegex(limitedToken) : null;
    const diacriticPattern = buildDiacriticPattern(limitedToken);
    const clauses = [
        { name: { $regex: fuzzyToken, $options: "i" } },
        { nameUnsigned: { $regex: fuzzyTokenUnsigned, $options: "i" } },
        { code: fuzzyCodeRegex || { $regex: safeToken, $options: "i" } },
        { brand: { $regex: safeToken, $options: "i" } },
    ];
    // Chỉ bỏ qua dấu khi khách gõ không dấu; gõ có dấu thì giữ đúng dấu để "tần" không khớp nhầm "tấn".
    // Không phụ thuộc trường nameUnsigned vì dữ liệu cũ có thể để trống.
    const isUnsignedToken = removeVietnameseTones(limitedToken) === limitedToken;
    if (diacriticPattern && isUnsignedToken) clauses.push({ name: { $regex: diacriticPattern, $options: "i" } });
    // Từ khóa dạng mã (có chữ số) cũng tìm trong tên, vd "s71200" khớp tên "PLC S7-1200"
    if (fuzzyCodeRegex && /\d/.test(limitedToken)) clauses.push({ name: fuzzyCodeRegex });
    return { $or: clauses };
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
    buildDiacriticPattern,
    buildTokenQuery,
    greedyNarrowTokens
};
