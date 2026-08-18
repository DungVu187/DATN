const {
  ProductPayloadValidationError,
  validateCreateProductPayload,
  validateCreateVariantPayload,
  validateUpdateProductPayload,
  validateUpdateVariantPayload,
} = require('../validators/productPayload');

const clone = (value) => JSON.parse(JSON.stringify(value));

const expectAcceptedWithoutMutation = (validator, payload) => {
  const original = clone(payload);

  expect(() => validator(payload)).not.toThrow();
  expect(payload).toEqual(original);
};

const expectPayloadError = (validator, payload, fieldPath) => {
  let error;

  try {
    validator(payload);
  } catch (caughtError) {
    error = caughtError;
  }

  expect(error).toBeInstanceOf(ProductPayloadValidationError);
  expect(error).toMatchObject({ statusCode: 400 });
  expect(error.message).toContain('"' + fieldPath + '"');
};

const validProductPayload = () => ({
  type: 'PLC',
  name: 'SIMATIC controller',
  code: '',
  brand: 'Siemens',
  section: 'Automation',
  value: 'Controller',
  warranty: '',
  vat: '10',
  solution: '',
  description: 'Compact controller',
  features: '',
  operatingMethod: '',
  advantages: '',
  specifications: '',
  adjusted: false,
  display: true,
  variant: [
    {
      price: '1250000',
      importPrice: '',
      earn: '25',
      imgUrl: '',
      note: '',
      color: 'Gray',
      shape: '',
      buttonCount: '2',
      frame: '',
      quantityForSale: '0',
      quantityInStorage: 4,
      clientOnlyVariantMetadata: false,
    },
  ],
  infoDoc: {
    manual: '',
    dataSheet: 'https://example.test/data-sheet.pdf',
    catalog: '',
    others: '',
    clientOnlyInfoMetadata: null,
  },
  documents: [
    {
      label: 'Catalog',
      url: 'https://example.test/catalog.pdf',
      sourceType: '',
      clientOnlyDocumentMetadata: true,
    },
  ],
  clientOnlyProductMetadata: null,
});

const validVariantPayload = () => ({
  price: '250000',
  importPrice: '',
  earn: '20',
  imgUrl: '',
  note: '',
  color: 'Black',
  shape: '',
  buttonCount: '4',
  frame: '',
  quantityForSale: '0',
  quantityInStorage: 3,
  clientOnlyVariantMetadata: null,
});

describe('product payload validator contract', () => {
  describe.each([
    ['create product', validateCreateProductPayload],
    ['update product', validateUpdateProductPayload],
  ])('%s', (label, validator) => {
    it('accepts the current admin payload without mutating it', () => {
      expectAcceptedWithoutMutation(validator, validProductPayload());
    });

    it('accepts nullable optional structures and unknown fields', () => {
      expectAcceptedWithoutMutation(validator, {
        code: null,
        infoDoc: null,
        documents: [],
        adjusted: false,
        display: true,
        unknownField: null,
      });
    });

    it.each([
      ['an array body', [], 'body'],
      ['a null body', null, 'body'],
      ['an object code', { code: { $ne: null } }, 'code'],
      ['a numeric code', { code: 101 }, 'code'],
      ['an object name', { name: { $regex: 'PLC' } }, 'name'],
      ['a numeric name', { name: 101 }, 'name'],
      ['a non-array variant', { variant: {} }, 'variant'],
      ['a non-object variant item', { variant: ['invalid'] }, 'variant[0]'],
      ['a non-array documents value', { documents: {} }, 'documents'],
      ['too many documents', { documents: Array.from({ length: 6 }, () => ({})) }, 'documents'],
      ['a non-object document item', { documents: ['invalid'] }, 'documents[0]'],
      ['an invalid document label', { documents: [{ label: {} }] }, 'documents[0].label'],
      ['an invalid document URL', { documents: [{ url: [] }] }, 'documents[0].url'],
      ['a non-object infoDoc value', { infoDoc: [] }, 'infoDoc'],
      ['an invalid infoDoc manual', { infoDoc: { manual: {} } }, 'infoDoc.manual'],
      ['an invalid infoDoc data sheet', { infoDoc: { dataSheet: [] } }, 'infoDoc.dataSheet'],
      ['an invalid nested variant number', { variant: [{ earn: 'not-a-number' }] }, 'variant[0].earn'],
    ])('rejects %s with its field path', (caseLabel, payload, fieldPath) => {
      expectPayloadError(validator, payload, fieldPath);
    });
  });

  describe.each([
    ['create variant', validateCreateVariantPayload],
    ['update variant', validateUpdateVariantPayload],
  ])('%s', (label, validator) => {
    it('accepts strings, numeric strings, empty strings, null, and unknown fields without mutation', () => {
      expectAcceptedWithoutMutation(validator, validVariantPayload());
      expectAcceptedWithoutMutation(validator, {
        price: null,
        importPrice: null,
        earn: null,
        note: false,
        unknownField: null,
      });
    });

    it.each([
      ['an array body', [], 'body'],
      ['a null body', null, 'body'],
      ['an invalid price structure', { price: {} }, 'variant.price'],
      ['an invalid import price structure', { importPrice: {} }, 'variant.importPrice'],
      ['an invalid earn value', { earn: 'twenty-five' }, 'variant.earn'],
    ])('rejects %s with its field path', (caseLabel, payload, fieldPath) => {
      expectPayloadError(validator, payload, fieldPath);
    });
  });

  it.each([
    [{ quantityForSale: 'many' }, 'variant.quantityForSale'],
    [{ quantityInStorage: [] }, 'variant.quantityInStorage'],
  ])('rejects invalid create-variant inventory values at %s', (payload, fieldPath) => {
    expectPayloadError(validateCreateVariantPayload, payload, fieldPath);
  });

  it.each([
    [{ variant: [{ quantityForSale: 'many' }] }, 'variant[0].quantityForSale'],
    [{ variant: [{ quantityInStorage: [] }] }, 'variant[0].quantityInStorage'],
  ])('rejects invalid create-product inventory values at %s', (payload, fieldPath) => {
    expectPayloadError(validateCreateProductPayload, payload, fieldPath);
  });
});
