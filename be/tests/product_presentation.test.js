const {
  hasAdjustedRequiredValue,
  calculateProductAdjustedStatus,
  stripPrivateVariantFields,
} = require('../services/productPresentation');

describe('product presentation helpers', () => {
  it('strips private variant fields without mutating the source product', () => {
    const product = {
      name: 'PLC',
      variant: [{
        price: '100000',
        importPrice: '70000',
        earn: 25,
        quantityForSale: 5,
        color: 'Gray',
      }],
    };
    const original = JSON.parse(JSON.stringify(product));

    const presented = stripPrivateVariantFields(product);

    expect(product).toEqual(original);
    expect(presented).not.toBe(product);
    expect(presented.variant).not.toBe(product.variant);
    expect(presented.variant[0]).not.toBe(product.variant[0]);
    expect(presented.variant[0]).toEqual({
      price: '100000',
      quantityForSale: 5,
      color: 'Gray',
      contactForPrice: false,
    });
  });

  it.each([
    ['zero earn', { price: '100000', importPrice: '70000', earn: 0, quantityForSale: 5 }],
    ['missing price', { price: '', importPrice: '70000', earn: 25, quantityForSale: 5 }],
    ['no sale stock', { price: '100000', importPrice: '70000', earn: 25, quantityForSale: 0 }],
  ])('marks %s variants contact-only and hides their price', (label, variant) => {
    const presented = stripPrivateVariantFields({ variant: [variant] });

    expect(presented.variant[0]).toEqual(expect.objectContaining({
      price: '',
      contactForPrice: true,
    }));
    expect(presented.variant[0]).not.toHaveProperty('importPrice');
    expect(presented.variant[0]).not.toHaveProperty('earn');
  });

  it('uses document serialization without mutating its returned variants', () => {
    const serializedVariant = {
      price: '250000',
      importPrice: '200000',
      earn: 25,
      quantityForSale: 2,
    };
    const product = {
      toJSON: jest.fn(() => ({ name: 'Document Product', variant: [serializedVariant] })),
    };

    const presented = stripPrivateVariantFields(product);

    expect(product.toJSON).toHaveBeenCalledTimes(1);
    expect(serializedVariant).toEqual({
      price: '250000',
      importPrice: '200000',
      earn: 25,
      quantityForSale: 2,
    });
    expect(presented.variant[0]).toEqual({
      price: '250000',
      quantityForSale: 2,
      contactForPrice: false,
    });
  });

  it.each([
    '',
    'N/A',
    'NA',
    'chua ro',
    'CHUA CO',
    'Ch\u01B0a ph\u00E2n lo\u1EA1i',
    null,
    undefined,
  ])('treats %p as an unadjusted required value', (value) => {
    expect(hasAdjustedRequiredValue(value)).toBe(false);
  });

  it('calculates adjusted status from type, brand, and section only', () => {
    expect(calculateProductAdjustedStatus({
      type: 'PLC',
      brand: 'Siemens',
      section: 'Automation',
      value: '',
      adjusted: false,
    })).toBe(true);

    expect(calculateProductAdjustedStatus({
      type: 'PLC',
      brand: 'Siemens',
      section: 'Ch\u01B0a r\u00F5',
    })).toBe(false);
  });
});
