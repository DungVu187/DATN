const mongoose = require('mongoose');
const { Product } = require('../models/product');
const {
  buildOrderStockAdjustments,
  computeOrderTotal,
  createReservationAdjustments,
  parseOrderPrice,
  prepareOrderItemsForCreation,
  validateOrderItemInput,
} = require('../services/orderItemWorkflows');

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await Product.deleteMany({});
});

async function createProduct({
  display = true,
  price = '100.000',
  importPrice,
  earn,
  quantityForSale = 5,
} = {}) {
  return Product.create({
    type: 'PLC',
    name: 'Workflow Product',
    code: 'ORDER-WORKFLOW-' + Date.now() + '-' + Math.random(),
    brand: 'Workflow Brand',
    section: 'Thiết bị tự động hóa',
    value: 'PLC',
    warranty: '12 tháng',
    display,
    variant: [{
      price,
      importPrice,
      earn,
      color: 'Xám',
      quantityForSale,
      quantityInStorage: 10,
    }],
  });
}

describe('Order item workflows', () => {
  it('preserves price coercion and item validation', () => {
    const productId = new mongoose.Types.ObjectId().toString();

    expect(parseOrderPrice(123.5)).toBe(123.5);
    expect(parseOrderPrice('1.234,5')).toBe(1234.5);
    expect(parseOrderPrice('invalid')).toBe(0);
    expect(validateOrderItemInput({ productId: 'bad', variantIndex: 0, quantity: 1 }))
      .toEqual({ message: 'Sản phẩm không hợp lệ' });
    expect(validateOrderItemInput({ productId, variantIndex: -1, quantity: 1 }))
      .toEqual({ message: 'Phiên bản sản phẩm không hợp lệ' });
    expect(validateOrderItemInput({ productId, variantIndex: 0, quantity: 0 }))
      .toEqual({ message: 'Số lượng không hợp lệ' });
    expect(validateOrderItemInput({ productId, variantIndex: '2', quantity: '3' }))
      .toEqual({ value: { productId, variantIndex: 2, quantity: 3 } });
  });

  it('preserves empty, missing-product and missing-variant errors', async () => {
    expect(await prepareOrderItemsForCreation([])).toEqual({
      error: { status: 400, message: 'Danh sách sản phẩm không hợp lệ' },
    });

    const missingProductId = new mongoose.Types.ObjectId().toString();
    expect(await prepareOrderItemsForCreation([{
      productId: missingProductId,
      variantIndex: 0,
      quantity: 1,
    }])).toEqual({
      error: {
        status: 404,
        message: 'Sản phẩm với ID ' + missingProductId + ' không tồn tại.',
      },
    });

    const product = await createProduct();
    expect(await prepareOrderItemsForCreation([{
      productId: product._id.toString(),
      variantIndex: 9,
      quantity: 1,
    }])).toEqual({
      error: {
        status: 400,
        message: 'Phiên bản sản phẩm không hợp lệ cho sản phẩm ' + product._id + '.',
      },
    });
  });

  it('preserves public visibility and contact-only guards', async () => {
    const hiddenProduct = await createProduct({ display: false });
    const hidden = await prepareOrderItemsForCreation([{
      productId: hiddenProduct._id.toString(),
      variantIndex: 0,
      quantity: 1,
    }], { enforcePublicProducts: true });
    expect(hidden.error).toEqual({
      status: 403,
      message: 'Sản phẩm hiện không được phép bán.',
    });

    const contactProduct = await createProduct({
      price: '5.480.000',
      importPrice: '5.480.000',
      earn: 0,
    });
    const contactOnly = await prepareOrderItemsForCreation([{
      productId: contactProduct._id.toString(),
      variantIndex: 0,
      quantity: 1,
    }], { enforcePublicProducts: true });
    expect(contactOnly.error.status).toBe(409);
    expect(contactOnly.error.message).toBe('Sản phẩm Workflow Product hiện chỉ nhận liên hệ.');
  });

  it('reserves duplicate lines cumulatively and computes totals from DB prices', async () => {
    const product = await createProduct({ quantityForSale: 3, price: '100.000' });
    const productId = product._id.toString();
    const items = [
      { productId, variantIndex: 0, quantity: 1 },
      { productId, variantIndex: 0, quantity: 2 },
    ];

    const prepared = await prepareOrderItemsForCreation(items);
    expect(prepared.cartItems).toEqual(items);
    expect(prepared.total).toBe(300000);
    expect(prepared.preparedItems).toHaveLength(2);
    expect(await computeOrderTotal(items)).toBe(300000);

    const overReserved = await prepareOrderItemsForCreation([
      { productId, variantIndex: 0, quantity: 2 },
      { productId, variantIndex: 0, quantity: 2 },
    ]);
    expect(overReserved.error).toEqual({
      status: 400,
      message: 'Không đủ hàng cho sản phẩm Workflow Product, variant Xám.',
    });

    const unchanged = await Product.findById(product._id);
    expect(unchanged.variant[0].quantityForSale).toBe(3);
  });

  it('creates exact reservation adjustments', async () => {
    const product = await createProduct();
    const prepared = await prepareOrderItemsForCreation([{
      productId: product._id.toString(),
      variantIndex: 0,
      quantity: 2,
    }]);

    const adjustments = createReservationAdjustments(prepared.preparedItems);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      variantIndex: 0,
      quantityForSaleDelta: -2,
    });
    expect(adjustments[0].productId.toString()).toBe(product._id.toString());
    expect(adjustments[0].expectedVariantId.toString())
      .toBe(product.variant[0]._id.toString());
  });

  it('maps stock adjustments and preserves missing-product policy', async () => {
    const product = await createProduct();
    const item = {
      productId: product._id.toString(),
      variantIndex: 0,
      quantity: 2,
    };
    const result = await buildOrderStockAdjustments(
      [item],
      (orderItem) => ({ quantityForSaleDelta: -orderItem.quantity })
    );

    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]).toMatchObject({
      variantIndex: 0,
      quantityForSaleDelta: -2,
    });
    expect(result.adjustments[0].productId.toString()).toBe(product._id.toString());
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].item).toBe(item);
    expect(result.entries[0].product._id.toString()).toBe(product._id.toString());

    const missingItem = {
      productId: new mongoose.Types.ObjectId().toString(),
      variantIndex: 0,
      quantity: 1,
    };
    await expect(buildOrderStockAdjustments([missingItem], () => ({})))
      .rejects.toMatchObject({
        message: 'Không tìm thấy sản phẩm trong đơn hàng.',
        statusCode: 404,
        code: 'PRODUCT_NOT_FOUND',
      });
    await expect(buildOrderStockAdjustments(
      [missingItem],
      () => ({}),
      { skipMissing: true }
    )).resolves.toEqual({ adjustments: [], entries: [] });
  });
});
