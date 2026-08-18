const {
  PRODUCT_UPDATE_ALLOWED_FIELDS,
  VARIANT_METADATA_FIELDS,
  pickAllowedProductUpdateFields,
  pickVariantMetadata,
} = require('../utils/productUpdatePolicy');

describe('product update policy', () => {
  it('exports the current whole-product update whitelist', () => {
    expect(PRODUCT_UPDATE_ALLOWED_FIELDS).toEqual([
      'type',
      'name',
      'code',
      'brand',
      'section',
      'value',
      'warranty',
      'waranty',
      'vat',
      'solution',
      'description',
      'features',
      'operatingMethod',
      'advantages',
      'specifications',
      'infoDoc',
      'documents',
      'adjusted',
      'display',
      'nameUnsigned',
    ]);
  });

  it('keeps false, zero, and empty strings while blocking non-whitelisted fields', () => {
    const body = {
      type: '',
      name: undefined,
      vat: 0,
      adjusted: false,
      display: false,
      purchaseCount: 999,
      variant: [{ price: '999999' }],
      reviews: [{ rating: 5 }],
      _id: 'client-controlled-id',
    };
    const original = JSON.parse(JSON.stringify(body));

    const update = pickAllowedProductUpdateFields(body);

    expect(body).toEqual({ ...original, name: undefined });
    expect(update).toEqual({
      type: '',
      vat: 0,
      adjusted: false,
      display: false,
    });
  });

  it('exports the current variant metadata whitelist', () => {
    expect(VARIANT_METADATA_FIELDS).toEqual([
      'price',
      'importPrice',
      'earn',
      'imgUrl',
      'note',
      'color',
      'shape',
      'buttonCount',
      'frame',
    ]);
  });

  it('keeps metadata false, zero, and empty strings while blocking stock and ids', () => {
    const body = {
      price: '',
      importPrice: '',
      earn: 0,
      note: false,
      color: 'Gray',
      quantityForSale: 1,
      quantityInStorage: 2,
      contactForPrice: true,
      _id: 'client-controlled-id',
    };
    const original = { ...body };

    const update = pickVariantMetadata(body);

    expect(body).toEqual(original);
    expect(update).toEqual({
      price: '',
      importPrice: '',
      earn: 0,
      note: false,
      color: 'Gray',
    });
  });

  it('returns no variant metadata for a missing body', () => {
    expect(pickVariantMetadata()).toEqual({});
    expect(pickVariantMetadata(null)).toEqual({});
  });
});
