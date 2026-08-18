import { formatVariantPrice, isContactOnlyVariant } from "./productpricing";

describe("product pricing", () => {
  test.each([
    [{ price: "100000", quantityForSale: 10, contactForPrice: true }],
    [{ price: "5480000", earn: 0, quantityForSale: 18 }],
    [{ price: "", quantityForSale: 10 }],
    [{ price: "100000", quantityForSale: 0 }],
  ])("shows contact for non-purchasable variants", (variant) => {
    expect(isContactOnlyVariant(variant)).toBe(true);
    expect(formatVariantPrice(variant)).toBe("Liên hệ");
  });

  test("formats a purchasable localized price", () => {
    const variant = { price: "5.480.000", quantityForSale: 18 };
    expect(isContactOnlyVariant(variant)).toBe(false);
    expect(formatVariantPrice(variant)).toBe("5.480.000 VNĐ");
  });
});
