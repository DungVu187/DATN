const { Product } = require('../models/product');
const { mapEpOrderLine } = require('../controllers/epOrderDetailReads');
const { mapIpOrderLine } = require('../controllers/ipOrderDetailReads');
const { enrichInventoryOrderLines } = require('../services/inventoryOrderDetail');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('inventory order detail enrichment', () => {
  it('loads products in line order and delegates response mapping', async () => {
    const products = new Map([
      ['p1', { name: 'First' }],
      ['p2', null],
    ]);
    jest.spyOn(Product, 'findById').mockImplementation((productId) => ({
      lean: jest.fn().mockResolvedValue(products.get(productId)),
    }));
    const mapper = jest.fn((item, product) => ({
      productId: item.productId,
      name: product?.name || '',
    }));

    const result = await enrichInventoryOrderLines([
      { productId: 'p1' },
      { productId: 'p2' },
    ], mapper);

    expect(Product.findById).toHaveBeenNthCalledWith(1, 'p1');
    expect(Product.findById).toHaveBeenNthCalledWith(2, 'p2');
    expect(result).toEqual([
      { productId: 'p1', name: 'First' },
      { productId: 'p2', name: '' },
    ]);
  });

  it('keeps IPOrder detail degradation for missing Product data', () => {
    expect(mapIpOrderLine({ productId: 'missing', quantity: 2 }, null)).toEqual({
      productId: 'missing',
      quantity: 2,
      name: '',
      brand: '',
      image: '',
    });
  });

  it('keeps EPOrder stored pricing snapshots during detail enrichment', () => {
    const line = {
      productId: 'p1',
      importPriceSnapshot: '100',
      profitPercent: 20,
      price: '120',
      quantity: 2,
    };
    const product = {
      name: 'Export Product',
      brand: 'Brand',
      variant: [{ importPrice: '300', earn: 50, imgUrl: '/images/export.webp' }],
    };

    expect(mapEpOrderLine(line, product)).toEqual({
      ...line,
      importPriceSnapshot: '100',
      profitPercent: 20,
      price: '120',
      name: 'Export Product',
      brand: 'Brand',
      image: '/images/export.webp',
    });
  });
});
