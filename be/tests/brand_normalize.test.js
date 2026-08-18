const { normalizeBrandKey, resolveBrand } = require('../components/product');

describe('scan-invoice brand normalization', () => {
    test('returns the canonical DB brand for an exact normalized match', () => {
        expect(resolveBrand('siemens', [{ Brand: 'Siemens' }])).toEqual({
            brand: 'Siemens',
            brandIsNew: false
        });
    });

    test('normalizes Vietnamese tones and whitespace before matching', () => {
        expect(normalizeBrandKey('  Ơ   Rôn  ')).toBe('oron');
        expect(resolveBrand('  Ơ   Rôn  ', [{ Brand: 'Oron' }])).toEqual({
            brand: 'Oron',
            brandIsNew: false
        });
    });

    test.each([null, undefined, '', '   '])('treats an empty brand as not new: %p', (brand) => {
        expect(resolveBrand(brand, [{ Brand: 'Siemens' }])).toEqual({
            brand: '',
            brandIsNew: false
        });
    });

    test('keeps and trims a brand that is not in the DB list', () => {
        expect(resolveBrand('  Mitsubishi Electric  ', [{ Brand: 'Siemens' }])).toEqual({
            brand: 'Mitsubishi Electric',
            brandIsNew: true
        });
    });

    test('does not match a brand by substring', () => {
        expect(resolveBrand('Sieme', [{ Brand: 'Siemens' }])).toEqual({
            brand: 'Sieme',
            brandIsNew: true
        });
    });
});
