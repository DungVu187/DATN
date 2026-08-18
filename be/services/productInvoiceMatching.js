const { normalizeBrandKey, resolveBrand } = require('../utils/brandNormalization');
const { normalizeProductCodeForCompare } = require('../utils/productCodeNormalization');
const { removeVietnameseTones } = require('../utils/textNormalization');

const normalizeRepeatedInvoiceCodePrefix = (items) => {
    if (Array.isArray(items) && items.length > 1) {
        const validCodes = items.map(item => item.code ? String(item.code).trim() : '').filter(Boolean);
        if (validCodes.length > 1) {
            // Lấy từ đầu tiên (phân tách bằng khoảng trắng) của các mã
            const firstWords = validCodes.map(c => c.split(/\s+/)[0]);
            const firstWord = firstWords[0];
            // Nếu từ đầu tiên có độ dài từ 6 ký tự trở lên và xuất hiện ở TẤT CẢ các mã hàng
            if (firstWord && firstWord.length >= 6 && firstWords.every(w => w === firstWord)) {
                console.log(`[scan-invoice] Phát hiện tiền tố chung lặp lại (Mã PO): "${firstWord}". Đang tiến hành loại bỏ...`);
                items.forEach(item => {
                    if (item.code) {
                        let cleanCode = String(item.code).substring(firstWord.length).trim();
                        cleanCode = cleanCode.replace(/^[\s_-]+/, '');
                        item.code = cleanCode;
                    }
                });
            }
        }
    }
    return items;
};

const tokenizeSpec = (text) => {
    if (!text) return new Set();
    const regexModel = /(?=\d+[a-zA-Z]|[a-zA-Z]+\d)[a-zA-Z0-9\-\/]+/gi;
    const regexPureNum = /\b\d{3,}\b/g;

    const tokens = new Set();
    let match;

    regexModel.lastIndex = 0;
    while ((match = regexModel.exec(text)) !== null) {
        tokens.add(match[0].toLowerCase());
    }

    regexPureNum.lastIndex = 0;
    while ((match = regexPureNum.exec(text)) !== null) {
        tokens.add(match[0].toLowerCase());
    }

    return tokens;
};

const tokenizeTypeWords = (text) => {
    if (!text) return new Set();
    const out = new Set();
    const words = removeVietnameseTones(text).toLowerCase().split(/[\s,.\-\/()]+/);
    for (const w of words) {
        // từ chữ: có chữ cái, KHÔNG chứa số, độ dài > 1 (lớn hơn hoặc bằng 2)
        if (w.length > 1 && /[a-z]/.test(w) && !/\d/.test(w)) {
            out.add(w);
        }
    }

    // Đồng bộ nhóm từ đồng nghĩa tiếng Anh <-> tiếng Việt cho thiết bị điện
    // 1. Contactor / Công tắc tơ / Khởi động từ
    if (
        (out.has('cong') && out.has('to')) ||
        (out.has('cong') && out.has('tac') && out.has('to')) ||
        (out.has('cong') && out.has('tac') && out.has('tor')) ||
        (out.has('khoi') && out.has('dong') && out.has('tu'))
    ) {
        out.add('contactor');
    }
    if (out.has('contactor')) {
        out.add('cong');
        out.add('tac');
        out.add('to');
        out.add('contactor');
    }

    // 2. Rơ le / Rơle <-> Relay
    if (out.has('ro') && out.has('le')) {
        out.add('role');
        out.add('relay');
    }
    if (out.has('role') || out.has('relay')) {
        out.add('ro');
        out.add('le');
        out.add('role');
        out.add('relay');
    }

    // 3. Aptomat / Cầu dao / CB <-> Breaker / MCB / MCCB
    if (out.has('aptomat') || (out.has('cau') && out.has('dao'))) {
        out.add('cb');
        out.add('mcb');
        out.add('mccb');
    }
    if (out.has('cb') || out.has('mcb') || out.has('mccb')) {
        out.add('cau');
        out.add('dao');
        out.add('aptomat');
    }

    return out;
};

const codeKind = (code) => {
    if (!code || !code.trim()) return 'none';
    return /^\d+$/.test(code.trim()) ? 'supplier' : 'model';
};

const cleanCode = (code) => {
    return code ? code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
};

// Gate chung: code không xung đột + spec subset (Set) + type-word hit
const passGates = (p, ctx, item) => {
    // R: code conflict - cả 2 là model mà khác mã -> reject
    if (ctx.scanCodeKind === 'model' && codeKind(p.code) === 'model'
        && cleanCode(item.code) !== cleanCode(p.code)) {
        return false;
    }
    // R4: spec subset bằng SET membership (không dùng includes để tránh trượt 100/1000)
    if (ctx.hasScanSpec) {
        const pSpec = tokenizeSpec(`${p.name || ''} ${p.code || ''}`);
        for (const t of ctx.scanSpec) {
            if (!pSpec.has(t)) {
                return false; // thiếu 1 spec -> reject (R2)
            }
        }
    }
    // R5: bắt buộc trùng >= 1 từ loại sản phẩm (chặn Van vs Xy lanh)
    const pType = tokenizeTypeWords(p.name || '');
    let typeHit = false;
    for (const t of ctx.scanType) {
        if (pType.has(t)) {
            typeHit = true;
            break;
        }
    }
    if (!typeHit) {
        return false;
    }
    return true;
};

const normalizeCodeDisplay = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeCodeKey = (value) => normalizeProductCodeForCompare(value);
const sanitizeCodeToken = (value) => String(value || '')
    .trim()
    .replace(/^[,;:()[\]{}]+|[,;:()[\]{}]+$/g, '');

const isTechnicalSpecToken = (value) => {
    const token = sanitizeCodeToken(value).toUpperCase();
    if (!token) return false;
    return /^(?:(?:AC|DC)?\d+(?:[.,]\d+)?(?:V|A|W|KW|MW|HP|HZ|KA|MA|VAC|VDC)|\d+\/\d+(?:A|V)?|\d+(?:P|POLE)|\d+(?:X\d+)+)$/i.test(token);
};

const isModelLikeToken = (value) => {
    const token = sanitizeCodeToken(value);
    const compact = normalizeCodeKey(token);
    return compact.length >= 2
        && /[a-z]/i.test(token)
        && /\d/.test(token)
        && !isTechnicalSpecToken(token);
};

const extractCodeSegment = (value) => {
    const displayValue = normalizeCodeDisplay(value);
    if (!displayValue) return '';
    if (/^\d+$/.test(displayValue)) return displayValue;

    const tokens = displayValue.split(/\s+/).map(sanitizeCodeToken).filter(Boolean);
    const modelIndex = tokens.findIndex(isModelLikeToken);
    if (modelIndex < 0) return '';

    const codeTokens = [tokens[modelIndex]];
    for (let index = modelIndex + 1; index < tokens.length; index += 1) {
        if (!isTechnicalSpecToken(tokens[index])) break;
        codeTokens.push(tokens[index]);
    }
    return normalizeCodeDisplay(codeTokens.join(' '));
};

const extractCoreModelKey = (value) => {
    const segment = extractCodeSegment(value);
    if (!segment) return '';
    if (/^\d+$/.test(segment)) return normalizeCodeKey(segment);
    const modelToken = segment.split(/\s+/).find(isModelLikeToken);
    return normalizeCodeKey(modelToken || '');
};

const buildCanonicalCode = (rawCode, rawName) => {
    const codeSegment = extractCodeSegment(rawCode);
    const nameSegment = extractCodeSegment(rawName);
    if (!codeSegment) return nameSegment;
    if (!nameSegment) return codeSegment;

    const codeCore = extractCoreModelKey(codeSegment);
    const nameCore = extractCoreModelKey(nameSegment);
    const codeKey = normalizeCodeKey(codeSegment);
    const nameKey = normalizeCodeKey(nameSegment);

    if (codeCore && codeCore === nameCore && nameKey.startsWith(codeKey) && nameKey.length > codeKey.length) {
        return nameSegment;
    }
    return codeSegment;
};

const extractTechnicalSpecKeys = (value) => {
    const segment = extractCodeSegment(value);
    if (!segment) return new Set();
    const tokens = segment.split(/\s+/).slice(1).filter(isTechnicalSpecToken);
    return new Set(tokens.map(normalizeCodeKey).filter(Boolean));
};

const hasTypeOverlap = (scanType, productName) => {
    const productType = tokenizeTypeWords(productName || '');
    if (scanType.size === 0 || productType.size === 0) return true;
    for (const token of scanType) {
        if (productType.has(token)) return true;
    }
    return false;
};

const brandsCompatible = (scannedBrand, productBrand) => {
    const scanBrandKey = normalizeBrandKey(scannedBrand);
    const productBrandKey = normalizeBrandKey(productBrand);
    if (!scanBrandKey || !productBrandKey || productBrandKey === 'n/a' || productBrandKey === 'chuaro') {
        return true;
    }
    return scanBrandKey === productBrandKey;
};

const matchInvoiceItemsToProducts = ({ items, activeProducts, brandDocs }) => {
    normalizeRepeatedInvoiceCodePrefix(items);
    return items.map(item => {
        const resolvedBrand = resolveBrand(item.brand, brandDocs);
        const scanName = normalizeCodeDisplay(item.rawScannedName);
        const rawScannedCode = normalizeCodeDisplay(item.code);
        const canonicalCode = buildCanonicalCode(rawScannedCode, scanName);
        const normalizedCodeKey = normalizeCodeKey(canonicalCode);
        const coreModelKey = extractCoreModelKey(canonicalCode);
        const scanType = tokenizeTypeWords(scanName);
        const sourceConfidence = String(item.confidence || 'medium').toLowerCase();
        const isLowConfidence = sourceConfidence === 'low';

        let matchStatus = 'NEW_PRODUCT';
        let matchedProductId = 'NEW_PRODUCT';
        let candidateProductIds = [];
        let autoSelected = false;
        let requiresReview = false;
        let matchReason = 'Không tìm thấy sản phẩm có cùng model trong DB.';
        let confidence = canonicalCode ? sourceConfidence : 'low';

        const exactMatches = normalizedCodeKey
            ? activeProducts.filter(product => normalizeCodeKey(product.code) === normalizedCodeKey)
            : [];

        if (exactMatches.length === 1) {
            matchedProductId = exactMatches[0]._id.toString();
            matchStatus = 'MATCHED';
            matchReason = 'Khớp chính xác mã sản phẩm đầy đủ.';
            confidence = 'high';
        } else if (exactMatches.length > 1) {
            matchedProductId = null;
            matchStatus = 'POSSIBLE_MATCH';
            candidateProductIds = exactMatches.map(product => product._id.toString());
            matchReason = 'Có nhiều sản phẩm có mã chuẩn tương đương; cần người dùng xác nhận.';
            confidence = 'low';
        } else if (coreModelKey) {
            const coreCandidates = activeProducts.filter(product => {
                const productCore = extractCoreModelKey(product.code) || extractCoreModelKey(product.name);
                return productCore === coreModelKey;
            });

            if (coreCandidates.length > 0) {
                matchStatus = 'POSSIBLE_MATCH';
                matchedProductId = null;
                candidateProductIds = coreCandidates.map(product => product._id.toString());
                confidence = 'low';

                const safeAutoCandidates = coreCandidates.filter(product => {
                    if (isLowConfidence) return false;
                    if (!brandsCompatible(resolvedBrand.brand, product.brand)) return false;
                    if (!hasTypeOverlap(scanType, product.name)) return false;

                    const derivedProductCode = buildCanonicalCode(product.code, product.name);
                    const derivedProductKey = normalizeCodeKey(derivedProductCode);
                    const productNameKey = normalizeCodeKey(product.name);
                    return derivedProductKey === normalizedCodeKey
                        || (normalizedCodeKey && productNameKey.includes(normalizedCodeKey));
                });

                if (coreCandidates.length === 1 && safeAutoCandidates.length === 1) {
                    const candidate = safeAutoCandidates[0];
                    matchedProductId = candidate._id.toString();
                    autoSelected = true;
                    requiresReview = true;
                    confidence = 'medium';
                    matchReason = `Khớp duy nhất model ${canonicalCode || rawScannedCode}; tên DB chứa đủ mã chuẩn nhưng DB đang dùng mã ngắn.`;
                } else if (coreCandidates.length === 1) {
                    const candidate = coreCandidates[0];
                    const candidateCode = buildCanonicalCode(candidate.code, candidate.name);
                    const scanSpecs = extractTechnicalSpecKeys(canonicalCode);
                    const candidateSpecs = extractTechnicalSpecKeys(candidateCode);
                    const hasConflictingSpecs = scanSpecs.size > 0
                        && candidateSpecs.size > 0
                        && [...scanSpecs].some(spec => !candidateSpecs.has(spec));
                    matchReason = hasConflictingSpecs
                        ? `Khớp model ${coreModelKey} nhưng thông số DB khác; cần chọn đúng phiên bản.`
                        : `Khớp model ${coreModelKey} nhưng DB đang dùng mã ngắn hoặc thiếu thông số; cần người dùng xác nhận.`;
                } else {
                    matchReason = `Có ${coreCandidates.length} sản phẩm cùng model ${coreModelKey}; cần chọn đúng phiên bản.`;
                }
            }
        }

        if (!coreModelKey && exactMatches.length === 0) {
            const scanCodeKind = codeKind(canonicalCode);
            const scanSpec = tokenizeSpec(`${scanName} ${canonicalCode}`);
            const ctx = {
                scanCodeKind,
                scanSpec,
                scanType,
                hasScanSpec: scanSpec.size > 0
            };
            const fallbackCandidates = activeProducts.filter(product => passGates(product, ctx, { ...item, code: canonicalCode }));
            if (fallbackCandidates.length > 0) {
                matchStatus = 'POSSIBLE_MATCH';
                matchedProductId = null;
                candidateProductIds = fallbackCandidates.map(product => product._id.toString());
                matchReason = 'Không đọc chắc chắn model; đã tìm thấy sản phẩm gần giống để người dùng chọn.';
                confidence = 'low';
            }
        }

        if (matchedProductId && matchedProductId !== 'NEW_PRODUCT' && !item.vat) {
            const selectedProduct = activeProducts.find(product => product._id.toString() === matchedProductId);
            if (selectedProduct?.vat) item.vat = selectedProduct.vat;
        }

        return {
            ...item,
            code: canonicalCode || rawScannedCode,
            rawScannedCode,
            canonicalCode: canonicalCode || rawScannedCode,
            normalizedCodeKey,
            coreModelKey,
            brand: resolvedBrand.brand,
            brandIsNew: resolvedBrand.brandIsNew,
            matchStatus,
            matchedProductId,
            candidateProductIds,
            autoSelected,
            requiresReview,
            matchReason,
            confidence
        };
    });
};

module.exports = {
    buildCanonicalCode,
    extractCodeSegment,
    extractCoreModelKey,
    matchInvoiceItemsToProducts,
    normalizeRepeatedInvoiceCodePrefix,
    tokenizeSpec,
    tokenizeTypeWords,
};
