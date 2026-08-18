import { describe, expect, it } from "vitest";
import { formatVariantPrice, isContactOnlyVariant } from "./productpricing";

describe("product pricing", () => {
  it.each([
    { price: "5480000", earn: 0, quantityForSale: 18 },
    { price: "", earn: 25, quantityForSale: 18 },
    { price: "5480000", earn: 25, quantityForSale: 0 },
  ])("shows contact when the variant is contact-only", (variant) => {
    expect(isContactOnlyVariant(variant)).toBe(true);
    expect(formatVariantPrice(variant)).toBe("Liên hệ");
  });

  it("formats a normal selling price", () => {
    const variant = { price: "5480000", earn: 25, quantityForSale: 18 };
    expect(isContactOnlyVariant(variant)).toBe(false);
    expect(formatVariantPrice(variant)).toBe("5.480.000 VND");
  });
});
