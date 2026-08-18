import { describe, expect, it } from "vitest";
import { HOME_CATEGORY_ICON_REGISTRY } from "../components/homecategoryiconregistry";
import {
  CATEGORY_ICON_OPTIONS,
  getCategoryIcon,
  PRODUCT_TYPE_ICON_ENTRIES,
} from "./homecategoryicons";

describe("getCategoryIcon", () => {
  it("covers all 30 product types currently returned by the storefront API", () => {
    expect(PRODUCT_TYPE_ICON_ENTRIES).toHaveLength(30);
    expect(new Set(PRODUCT_TYPE_ICON_ENTRIES.map(([, icon]) => icon)).size).toBe(30);
    expect(PRODUCT_TYPE_ICON_ENTRIES.every(([, icon]) => HOME_CATEGORY_ICON_REGISTRY[icon])).toBe(true);
  });

  it.each(PRODUCT_TYPE_ICON_ENTRIES)("maps %s to %s", (type, expectedIcon) => {
    expect(getCategoryIcon(type)).toBe(expectedIcon);
  });

  it("ignores accents, casing and extra whitespace", () => {
    expect(getCategoryIcon("  BAO VE MAT, NGUOC PHA ")).toBe("ri-tb-shield-bolt");
    expect(getCategoryIcon("lọc bụi ")).toBe("ri-gi-dust-cloud");
  });

  it("keeps the supplied fallback for an unknown type", () => {
    expect(getCategoryIcon("Loại tùy chỉnh", "fa-desktop")).toBe("fa-desktop");
  });

  it("registers every icon offered to administrators", () => {
    expect(CATEGORY_ICON_OPTIONS.length).toBeGreaterThan(70);
    expect(CATEGORY_ICON_OPTIONS.every(({ value }) => HOME_CATEGORY_ICON_REGISTRY[value])).toBe(true);
  });
});
