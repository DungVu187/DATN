const STOREFRONT_LOCALES = ['vi', 'zh', 'en'];

const normalizeLocalizedText = (value, fallback = '', maxLength = 5000) => {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const normalized = {};
    for (const locale of STOREFRONT_LOCALES) {
        const rawValue = typeof source[locale] === 'string'
            ? source[locale]
            : locale === 'vi' && typeof fallback === 'string' ? fallback : '';
        const text = rawValue.trim();
        if (text.length > maxLength) return { error: `Nội dung ${locale} vượt quá độ dài cho phép` };
        normalized[locale] = text;
    }
    return { value: normalized };
};

module.exports = {
    STOREFRONT_LOCALES,
    normalizeLocalizedText,
};
