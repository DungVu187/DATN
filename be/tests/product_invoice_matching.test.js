const {
  buildCanonicalCode,
  extractCodeSegment,
  extractCoreModelKey,
  matchInvoiceItemsToProducts,
  normalizeRepeatedInvoiceCodePrefix,
  tokenizeSpec,
  tokenizeTypeWords,
} = require('../services/productInvoiceMatching');

const createProduct = (id, overrides = {}) => ({
  _id: { toString: () => id },
  name: 'Thiết bị điện',
  code: '',
  brand: 'Siemens',
  vat: '10%',
  ...overrides,
});

const BRAND_DOCS = [
  { Brand: 'Siemens' },
  { Brand: 'Schneider Electric' },
  { Brand: 'Omron' },
];

const matchItems = (items, activeProducts = []) => matchInvoiceItemsToProducts({
  items,
  activeProducts,
  brandDocs: BRAND_DOCS,
});

describe('Product invoice matching helpers', () => {
  test('extracts a model segment and its following technical specification tokens', () => {
    expect(extractCodeSegment('PO 3RT2026-1BB40 220V 10A ghi-chu')).toBe(
      '3RT2026-1BB40 220V 10A',
    );
  });

  test('keeps a supplier numeric code and rejects text without a model token', () => {
    expect(extractCodeSegment('123456')).toBe('123456');
    expect(extractCodeSegment('Khởi động từ Siemens')).toBe('');
  });

  test('extends a scanned model code with technical specifications found in the name', () => {
    expect(buildCanonicalCode(
      '3RT2026-1BB40',
      'Khởi động từ 3RT2026-1BB40 220V',
    )).toBe('3RT2026-1BB40 220V');
    expect(extractCoreModelKey('3RT2026-1BB40 220V')).toBe('3RT20261BB40');
  });

  test('keeps specification tokens as exact set members', () => {
    const tokens = tokenizeSpec('Relay RXM2AB2BD 220V 1000');
    expect(tokens).toEqual(new Set(['rxm2ab2bd', '220v', '1000']));
    expect(tokens.has('100')).toBe(false);
  });

  test('normalizes Vietnamese and English electrical type synonyms', () => {
    const relayTokens = tokenizeTypeWords('Rơ le bảo vệ');
    expect(relayTokens.has('ro')).toBe(true);
    expect(relayTokens.has('le')).toBe(true);
    expect(relayTokens.has('role')).toBe(true);
    expect(relayTokens.has('relay')).toBe(true);
    const contactorTokens = tokenizeTypeWords('Khởi động từ');
    expect(contactorTokens.has('contactor')).toBe(true);
    const breakerTokens = tokenizeTypeWords('Cầu dao điện');
    expect(breakerTokens.has('mccb')).toBe(true);
  });
});

describe('Repeated invoice code prefix normalization', () => {
  test('removes a repeated long PO prefix from every scanned code', () => {
    const items = [
      { code: 'PO123456 3RT2026-1BB40' },
      { code: 'PO123456 RXM2AB2BD' },
    ];
    jest.spyOn(console, 'log').mockImplementation(() => {});

    expect(normalizeRepeatedInvoiceCodePrefix(items)).toBe(items);
    expect(items).toEqual([
      { code: '3RT2026-1BB40' },
      { code: 'RXM2AB2BD' },
    ]);
  });

  test.each([
    [[{ code: 'PO123456 3RT2026-1BB40' }]],
    [[{ code: 'PO123456 3RT2026-1BB40' }, { code: 'PO654321 RXM2AB2BD' }]],
    [[{ code: 'SHORT 3RT2026-1BB40' }, { code: 'SHORT RXM2AB2BD' }]],
  ])('keeps codes when the repeated-prefix rule does not apply: %j', (items) => {
    const originalCodes = items.map((item) => item.code);
    normalizeRepeatedInvoiceCodePrefix(items);
    expect(items.map((item) => item.code)).toEqual(originalCodes);
  });

  test('keeps the legacy false-positive behavior for any repeated long first token', () => {
    const items = [
      { code: 'SIEMENS 3RT2026-1BB40' },
      { code: 'SIEMENS RXM2AB2BD' },
    ];
    jest.spyOn(console, 'log').mockImplementation(() => {});

    normalizeRepeatedInvoiceCodePrefix(items);

    expect(items.map((item) => item.code)).toEqual([
      '3RT2026-1BB40',
      'RXM2AB2BD',
    ]);
  });
});

describe('Invoice items to Product matching', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns an exact match, canonical brand, and inherited VAT', () => {
    const product = createProduct('product-exact', {
      name: 'Contactor Siemens 3RT2026-1BB40',
      code: '3RT2026-1BB40',
      vat: '8%',
    });

    const [result] = matchItems([{
      rawScannedName: 'Contactor 3RT2026-1BB40',
      code: '3RT2026-1BB40',
      brand: '  siemens ',
      quantity: 2,
    }], [product]);

    expect(result).toEqual(expect.objectContaining({
      code: '3RT2026-1BB40',
      rawScannedCode: '3RT2026-1BB40',
      canonicalCode: '3RT2026-1BB40',
      normalizedCodeKey: '3RT20261BB40',
      coreModelKey: '3RT20261BB40',
      brand: 'Siemens',
      brandIsNew: false,
      vat: '8%',
      matchStatus: 'MATCHED',
      matchedProductId: 'product-exact',
      candidateProductIds: [],
      autoSelected: false,
      requiresReview: false,
      confidence: 'high',
    }));
  });

  test('preserves scanned VAT instead of replacing it from the matched Product', () => {
    const [result] = matchItems([{
      rawScannedName: 'Relay RXM2AB2BD',
      code: 'RXM2AB2BD',
      vat: '5%',
    }], [createProduct('relay', { code: 'RXM2AB2BD', vat: '10%' })]);

    expect(result.vat).toBe('5%');
  });

  test('returns all duplicate exact-code candidates without auto selection', () => {
    const products = [
      createProduct('duplicate-1', { code: 'RXM2AB2BD' }),
      createProduct('duplicate-2', { code: 'RXM 2AB2BD' }),
    ];

    const [result] = matchItems([{
      rawScannedName: 'Relay RXM2AB2BD',
      code: 'RXM2AB2BD',
      confidence: 'high',
    }], products);

    expect(result).toEqual(expect.objectContaining({
      matchStatus: 'POSSIBLE_MATCH',
      matchedProductId: null,
      candidateProductIds: ['duplicate-1', 'duplicate-2'],
      autoSelected: false,
      requiresReview: false,
      confidence: 'low',
    }));
  });

  test('auto-selects one safe short-code Product but still requires review', () => {
    const product = createProduct('short-code', {
      name: 'Khởi động từ 3RT2026-1BB40 220V',
      code: '3RT2026-1BB40',
      brand: 'Siemens',
    });

    const [result] = matchItems([{
      rawScannedName: 'Khởi động từ 3RT2026-1BB40 220V',
      code: '3RT2026-1BB40 220V',
      brand: 'Siemens',
      confidence: 'high',
    }], [product]);

    expect(result).toEqual(expect.objectContaining({
      matchStatus: 'POSSIBLE_MATCH',
      matchedProductId: 'short-code',
      candidateProductIds: ['short-code'],
      autoSelected: true,
      requiresReview: true,
      confidence: 'medium',
    }));
    expect(result.matchReason).toContain('Khớp duy nhất model');
  });

  test.each([
    ['low confidence', { confidence: 'low', brand: 'Siemens' }],
    ['brand conflict', { confidence: 'high', brand: 'Schneider Electric' }],
  ])('does not auto-select a core candidate with %s', (_label, itemOverrides) => {
    const product = createProduct('review-only', {
      name: 'Khởi động từ 3RT2026-1BB40 220V',
      code: '3RT2026-1BB40',
      brand: 'Siemens',
    });

    const [result] = matchItems([{
      rawScannedName: 'Khởi động từ 3RT2026-1BB40 220V',
      code: '3RT2026-1BB40 220V',
      ...itemOverrides,
    }], [product]);

    expect(result.matchStatus).toBe('POSSIBLE_MATCH');
    expect(result.matchedProductId).toBeNull();
    expect(result.candidateProductIds).toEqual(['review-only']);
    expect(result.autoSelected).toBe(false);
    expect(result.requiresReview).toBe(false);
    expect(result.confidence).toBe('low');
  });

  test('explains conflicting technical specifications for a single core model', () => {
    const product = createProduct('wrong-voltage', {
      name: 'Khởi động từ 3RT2026-1BB40 110V',
      code: '3RT2026-1BB40',
    });

    const [result] = matchItems([{
      rawScannedName: 'Khởi động từ 3RT2026-1BB40 220V',
      code: '3RT2026-1BB40 220V',
      brand: 'Siemens',
      confidence: 'high',
    }], [product]);

    expect(result.matchedProductId).toBeNull();
    expect(result.candidateProductIds).toEqual(['wrong-voltage']);
    expect(result.matchReason).toContain('thông số DB khác');
  });

  test('returns every Product sharing the same core model', () => {
    const products = [
      createProduct('core-1', { name: 'Relay RXM2AB2BD 24V', code: 'RXM2AB2BD' }),
      createProduct('core-2', { name: 'Relay RXM2AB2BD 220V', code: 'RXM2AB2BD' }),
    ];

    const [result] = matchItems([{
      rawScannedName: 'Relay RXM2AB2BD 110V',
      code: 'RXM2AB2BD 110V',
    }], products);

    expect(result.matchStatus).toBe('POSSIBLE_MATCH');
    expect(result.matchedProductId).toBeNull();
    expect(result.candidateProductIds).toEqual(['core-1', 'core-2']);
    expect(result.matchReason).toContain('Có 2 sản phẩm cùng model');
  });

  test('uses type synonyms and exact specification sets for fallback candidates', () => {
    const products = [
      createProduct('relay-220', { name: 'Relay bảo vệ 220V', code: '' }),
      createProduct('relay-24', { name: 'Relay bảo vệ 24V', code: '' }),
      createProduct('valve-220', { name: 'Van điện từ 220V', code: '' }),
    ];

    const [result] = matchItems([{
      rawScannedName: 'Rơ le bảo vệ 220V',
      code: '',
    }], products);

    expect(result.matchStatus).toBe('POSSIBLE_MATCH');
    expect(result.matchedProductId).toBeNull();
    expect(result.candidateProductIds).toEqual(['relay-220']);
    expect(result.confidence).toBe('low');
  });

  test('returns a new Product when no exact, core, or gated fallback candidate exists', () => {
    const [result] = matchItems([{
      rawScannedName: 'Van khí nén',
      code: '',
      brand: '  New Brand  ',
      confidence: 'high',
    }], [createProduct('relay', { name: 'Relay bảo vệ 220V', code: '' })]);

    expect(result).toEqual(expect.objectContaining({
      code: '',
      rawScannedCode: '',
      canonicalCode: '',
      normalizedCodeKey: '',
      coreModelKey: '',
      brand: 'New Brand',
      brandIsNew: true,
      matchStatus: 'NEW_PRODUCT',
      matchedProductId: 'NEW_PRODUCT',
      candidateProductIds: [],
      confidence: 'low',
    }));
  });

  test('defaults confidence to medium when a canonical code exists but has no match', () => {
    const [result] = matchItems([{
      rawScannedName: 'Biến tần ABC123',
      code: 'ABC123',
    }]);

    expect(result.matchStatus).toBe('NEW_PRODUCT');
    expect(result.matchedProductId).toBe('NEW_PRODUCT');
    expect(result.canonicalCode).toBe('ABC123');
    expect(result.confidence).toBe('medium');
  });

  test('normalizes a repeated PO prefix before exposing raw and canonical codes', () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const results = matchItems([
      { rawScannedName: 'Relay RXM2AB2BD', code: 'PO123456 RXM2AB2BD' },
      { rawScannedName: 'Contactor 3RT2026-1BB40', code: 'PO123456 3RT2026-1BB40' },
    ]);

    expect(results.map((item) => item.rawScannedCode)).toEqual([
      'RXM2AB2BD',
      '3RT2026-1BB40',
    ]);
  });

  test('keeps the legacy TypeError behavior when Gemini returns a non-array JSON value', () => {
    expect(() => matchItems({ invalid: true })).toThrow(TypeError);
  });
});
