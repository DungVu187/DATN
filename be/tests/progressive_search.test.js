const productFacade = require('../components/product');
const productSearch = require('../utils/productSearch');
const { stripSearchEdgeWords } = require('../utils/productSearchTerms');
const {
    limitRegexInput,
    escapeRegex,
    generateFuzzyCodeRegex,
    buildTokenQuery,
    greedyNarrowTokens
} = productSearch;

describe('product search facade', () => {
    it('re-export helper công khai bằng cùng function reference', () => {
        expect(productFacade.buildTokenQuery).toBe(buildTokenQuery);
        expect(productFacade.greedyNarrowTokens).toBe(greedyNarrowTokens);
    });
});

describe('product search primitives', () => {
    it('giới hạn regex input ở 100 ký tự', () => {
        expect(limitRegexInput(null)).toBe('');
        expect(limitRegexInput('a'.repeat(101))).toBe('a'.repeat(100));
    });

    it('escape ký tự đặc biệt trước khi dựng regex', () => {
        expect(escapeRegex('a.b[c]')).toBe('a\\.b\\[c\\]');
    });

    it('sinh regex mã fuzzy và bỏ input không có ký tự chữ số', () => {
        const regex = generateFuzzyCodeRegex('TT-SM1');
        expect(regex).toBeInstanceOf(RegExp);
        expect('TT SM/1').toMatch(regex);
        expect(generateFuzzyCodeRegex('---')).toBeNull();
    });
});

describe('stripSearchEdgeWords', () => {
    it('bóc động từ ở đầu câu, giữ nguyên chuỗi thực thể', () => {
        expect(stripSearchEdgeWords('Tìm van điện khí TTSM1'))
            .toEqual(['van', 'điện', 'khí', 'TTSM1']);
    });

    it('bóc stopword ở cả đầu và cuối', () => {
        expect(stripSearchEdgeWords('cho tôi xem van điện còn hàng không'))
            .toEqual(['van', 'điện']);
    });

    it('không bóc từ thực thể nằm giữa cụm', () => {
        // "khí" ở giữa không phải stopword nên phải giữ
        expect(stripSearchEdgeWords('van khí nén'))
            .toEqual(['van', 'khí', 'nén']);
    });

    it('trả mảng rỗng khi chuỗi rỗng', () => {
        expect(stripSearchEdgeWords('')).toEqual([]);
        expect(stripSearchEdgeWords('   ')).toEqual([]);
    });

    it('giữ token đơn khi toàn bộ là thực thể', () => {
        expect(stripSearchEdgeWords('van')).toEqual(['van']);
    });
});

describe('buildTokenQuery', () => {
    it('sinh khối $or gồm name/nameUnsigned/code/brand và tên bỏ dấu', () => {
        const q = buildTokenQuery('van');
        expect(q).toHaveProperty('$or');
        const fields = q.$or.map(clause => Object.keys(clause)[0]);
        expect(fields).toEqual(['name', 'nameUnsigned', 'code', 'brand', 'name']);
    });

    it('gõ không dấu vẫn khớp tên có dấu kể cả khi nameUnsigned trống', () => {
        const nameClauses = (token) => buildTokenQuery(token).$or
            .filter(c => c.name)
            .map(c => (c.name instanceof RegExp ? c.name : new RegExp(c.name.$regex, c.name.$options)));
        const matchesName = (token, name) => nameClauses(token).some(regex => regex.test(name));
        expect(matchesName('bien', 'Biến tần Schneider')).toBe(true);
        expect(matchesName('tan', 'Biến tần Schneider')).toBe(true);
        expect(matchesName('BIEN', 'Biến tần Schneider')).toBe(true);
        expect(matchesName('dong', 'Biến dòng')).toBe(true);
        expect(matchesName('bien', 'Bộ lọc khí')).toBe(false);
    });

    it('từ khóa dạng mã có chữ số cũng tìm trong tên', () => {
        const q = buildTokenQuery('s71200');
        const nameRegexes = q.$or.filter(c => c.name instanceof RegExp).map(c => c.name);
        expect(nameRegexes.some(regex => regex.test('PLC S7-1200 CPU 1214C'))).toBe(true);
    });

    it('gõ có dấu thì giữ đúng dấu, "tần" không khớp nhầm "tấn"', () => {
        const nameRegexes = buildTokenQuery('tần').$or
            .filter(c => c.name)
            .map(c => new RegExp(c.name.$regex, c.name.$options));
        expect(nameRegexes.some(regex => regex.test('Biến tần'))).toBe(true);
        expect(nameRegexes.some(regex => regex.test('Cảm biến lực 5 tấn'))).toBe(false);
    });

    it('không dùng regex mã nới lỏng cho từ khóa quá ngắn như "c++"', () => {
        const q = buildTokenQuery('c++');
        const codeClause = q.$or.find(c => c.code);
        expect(codeClause.code).not.toBeInstanceOf(RegExp);
        expect(new RegExp(codeClause.code.$regex, 'i').test('CJX2-1810')).toBe(false);
    });

    it('dùng regex fuzzy cho mã có ký tự ngăn cách', () => {
        const q = buildTokenQuery('TTSM1');
        const codeClause = q.$or.find(c => c.code);
        // code phải là RegExp fuzzy (chấp nhận TT-SM1, TT SM1...)
        expect(codeClause.code).toBeInstanceOf(RegExp);
        expect('TT-SM1').toMatch(codeClause.code);
        expect('TT SM1').toMatch(codeClause.code);
    });
});

describe('greedyNarrowTokens', () => {
    // runFn giả lập DB: chỉ trả kết quả khi tập token là tiền tố hợp lệ.
    // Kho giả có sản phẩm khớp "van", "van điện", "van điện khí" nhưng KHÔNG có
    // "van điện khí TTSM1" (mã sai) và KHÔNG có "van xyz".
    const makeRunFn = (validSubsets) => async (tokens) => {
        const key = tokens.join(' ');
        const total = validSubsets[key] || 0;
        const products = Array.from({ length: total }, (_, i) => ({ id: `${key}-${i}` }));
        return [products, total];
    };

    it('giữ tiền tố dài nhất còn kết quả, bỏ mã đuôi không khớp', async () => {
        const runFn = makeRunFn({
            'van': 40,
            'van điện': 12,
            'van điện khí': 3
            // 'van điện khí TTSM1' -> 0 (không có key = trả 0)
        });
        const result = await greedyNarrowTokens(['van', 'điện', 'khí', 'TTSM1'], runFn);
        expect(result.tokens).toEqual(['van', 'điện', 'khí']);
        expect(result.total).toBe(3);
    });

    it('bỏ từ nhiễu nằm GIỮA câu, vẫn giữ từ tốt phía sau', async () => {
        // "van xyz khí": "xyz" làm rớt về 0 -> bỏ, nhưng "van khí" vẫn có kết quả
        const runFn = makeRunFn({
            'van': 40,
            'van khí': 8
            // 'van xyz' -> 0
        });
        const result = await greedyNarrowTokens(['van', 'xyz', 'khí'], runFn);
        expect(result.tokens).toEqual(['van', 'khí']);
        expect(result.total).toBe(8);
    });

    it('trả rỗng khi không token nào ra kết quả', async () => {
        const runFn = makeRunFn({});
        const result = await greedyNarrowTokens(['aaa', 'bbb'], runFn);
        expect(result.tokens).toEqual([]);
        expect(result.total).toBe(0);
    });
});
