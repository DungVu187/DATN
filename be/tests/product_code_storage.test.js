const { Product } = require("../components/product");

describe("product code storage normalization", () => {
  test.each([undefined, null, "", "   "])(
    "stores an absent value for an empty product code: %p",
    (code) => {
      const product = new Product({ code });

      expect(product.code).toBeUndefined();
    }
  );

  test("trims a non-empty product code", () => {
    const product = new Product({ code: "  S7-1200  " });

    expect(product.code).toBe("S7-1200");
  });
});
