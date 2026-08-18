const mongoose = require("mongoose");
const { Product } = require("../components/product");
const {
  InventoryError,
  adjustVariantStock,
  applyStockAdjustments,
} = require("../services/inventory");

const createProduct = ({
  name = "Atomic Inventory Product",
  quantityForSale,
  quantityInStorage = quantityForSale,
}) => Product.create({
  type: "PLC",
  name,
  brand: "Test Brand",
  section: "Thiết bị tự động hóa",
  value: "PLC",
  warranty: "12 tháng",
  variant: [{
    price: "100000",
    color: "Xám",
    quantityForSale,
    quantityInStorage,
  }],
});

const readStock = async (productId) => {
  const product = await Product.findById(productId);
  return {
    quantityForSale: product.variant[0].quantityForSale,
    quantityInStorage: product.variant[0].quantityInStorage,
  };
};

beforeAll(async () => {
  await mongoose.connect("mongodb://localhost:27017/EcomTest");
});

afterEach(async () => {
  await Product.deleteMany({});
});

afterAll(async () => {
  await Product.deleteMany({});
  await mongoose.disconnect();
});

describe("Atomic inventory service", () => {
  it("allows only one concurrent export of the final unit", async () => {
    const product = await createProduct({
      quantityForSale: 1,
      quantityInStorage: 1,
    });
    const expectedVariantId = product.variant[0]._id;

    const results = await Promise.allSettled([
      adjustVariantStock({
        productId: product._id,
        variantIndex: 0,
        expectedVariantId,
        quantityForSaleDelta: -1,
        quantityInStorageDelta: -1,
      }),
      adjustVariantStock({
        productId: product._id,
        variantIndex: 0,
        expectedVariantId,
        quantityForSaleDelta: -1,
        quantityInStorageDelta: -1,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected.reason).toBeInstanceOf(InventoryError);
    expect(rejected.reason.code).toBe("INSUFFICIENT_SALE_STOCK");
    await expect(readStock(product._id)).resolves.toEqual({
      quantityForSale: 0,
      quantityInStorage: 0,
    });
  });

  it("rolls back earlier products when a later adjustment cannot be applied", async () => {
    const firstProduct = await createProduct({
      name: "Rollback First Product",
      quantityForSale: 2,
      quantityInStorage: 2,
    });
    const secondProduct = await createProduct({
      name: "Rollback Second Product",
      quantityForSale: 1,
      quantityInStorage: 1,
    });

    await expect(applyStockAdjustments([
      {
        productId: firstProduct._id,
        variantIndex: 0,
        expectedVariantId: firstProduct.variant[0]._id,
        quantityForSaleDelta: -2,
      },
      {
        productId: secondProduct._id,
        variantIndex: 0,
        expectedVariantId: secondProduct.variant[0]._id,
        quantityForSaleDelta: -2,
      },
    ])).rejects.toMatchObject({ code: "INSUFFICIENT_SALE_STOCK" });

    await expect(readStock(firstProduct._id)).resolves.toEqual({
      quantityForSale: 2,
      quantityInStorage: 2,
    });
    await expect(readStock(secondProduct._id)).resolves.toEqual({
      quantityForSale: 1,
      quantityInStorage: 1,
    });
  });

  it("does not lose concurrent positive stock adjustments", async () => {
    const product = await createProduct({
      quantityForSale: 0,
      quantityInStorage: 0,
    });
    const expectedVariantId = product.variant[0]._id;

    await Promise.all(Array.from({ length: 20 }, () => adjustVariantStock({
      productId: product._id,
      variantIndex: 0,
      expectedVariantId,
      quantityForSaleDelta: 1,
      quantityInStorageDelta: 1,
    })));

    await expect(readStock(product._id)).resolves.toEqual({
      quantityForSale: 20,
      quantityInStorage: 20,
    });
  });

  it("rejects invalid stock deltas without changing inventory", async () => {
    const product = await createProduct({
      quantityForSale: 3,
      quantityInStorage: 3,
    });

    await expect(adjustVariantStock({
      productId: product._id,
      variantIndex: 0,
      quantityForSaleDelta: "not-a-number",
    })).rejects.toMatchObject({ code: "INVALID_STOCK_DELTA" });

    await expect(readStock(product._id)).resolves.toEqual({
      quantityForSale: 3,
      quantityInStorage: 3,
    });
  });

  it("refuses to update corrupted products with duplicate embedded variant ids", async () => {
    const productId = new mongoose.Types.ObjectId();
    const duplicateVariantId = new mongoose.Types.ObjectId();
    await Product.collection.insertOne({
      _id: productId,
      type: "PLC",
      name: "Corrupted duplicate variant product",
      brand: "Test Brand",
      section: "Thiết bị tự động hóa",
      value: "PLC",
      warranty: "12 tháng",
      purchaseCount: 0,
      variant: [
        {
          _id: duplicateVariantId,
          price: "100000",
          quantityForSale: 5,
          quantityInStorage: 5,
        },
        {
          _id: duplicateVariantId,
          price: "200000",
          quantityForSale: 0,
          quantityInStorage: 0,
        },
      ],
    });

    await expect(adjustVariantStock({
      productId,
      variantIndex: 0,
      expectedVariantId: duplicateVariantId,
      quantityForSaleDelta: -1,
      quantityInStorageDelta: -1,
    })).rejects.toMatchObject({ code: "DUPLICATE_VARIANT_ID" });

    const persistedProduct = await Product.findById(productId).lean();
    expect(persistedProduct.variant.map((item) => ({
      quantityForSale: item.quantityForSale,
      quantityInStorage: item.quantityInStorage,
    }))).toEqual([
      { quantityForSale: 5, quantityInStorage: 5 },
      { quantityForSale: 0, quantityInStorage: 0 },
    ]);
  });
});
