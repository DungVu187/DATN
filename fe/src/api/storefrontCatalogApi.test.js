import { apiFetch, resolveApiUrl } from "./httpClient";
import * as storefrontCatalogApi from "./storefrontCatalogApi";

vi.mock("./httpClient", () => ({
  apiFetch: vi.fn(),
  resolveApiUrl: vi.fn(),
}));

const expectedExportNames = [
  "deleteStorefrontProductReview",
  "getPublicStorefrontProductsByIds",
  "getStorefrontBrands",
  "getStorefrontContent",
  "getStorefrontPolicies",
  "getStorefrontProduct",
  "getStorefrontProductReviews",
  "getStorefrontProductsByIds",
  "getStorefrontProductTypes",
  "getStorefrontSectionImages",
  "getStorefrontSections",
  "getStorefrontSectionValues",
  "listPublicStorefrontProducts",
  "listStorefrontProducts",
  "listStorefrontSectionValueProducts",
  "resolveStorefrontAssetUrl",
  "saveStorefrontProductReview",
];

describe("storefrontCatalogApi", () => {
  const originalFetch = global.fetch;
  const response = { ok: true, status: 200 };

  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue(response);
    resolveApiUrl.mockImplementation((path) => "https://api.test" + path);
    global.fetch = vi.fn().mockResolvedValue(response);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test("exports exactly the compact storefront catalog API", () => {
    expect(Object.keys(storefrontCatalogApi).sort()).toEqual(
      expectedExportNames.sort(),
    );
  });

  test("resolves only relative assets against the API base", () => {
    expect(storefrontCatalogApi.resolveStorefrontAssetUrl("")).toBe("");
    expect(storefrontCatalogApi.resolveStorefrontAssetUrl(null)).toBe("");
    expect(
      storefrontCatalogApi.resolveStorefrontAssetUrl(
        "data:image/png;base64,abc",
      ),
    ).toBe("data:image/png;base64,abc");
    expect(
      storefrontCatalogApi.resolveStorefrontAssetUrl(
        "https://cdn.example.com/product.webp",
      ),
    ).toBe("https://cdn.example.com/product.webp");
    expect(
      storefrontCatalogApi.resolveStorefrontAssetUrl("/images/product.webp"),
    ).toBe("https://api.test/images/product.webp");
  });

  test("keeps credentialed product reads and blank query values", async () => {
    await storefrontCatalogApi.getStorefrontProduct("product-1");
    await storefrontCatalogApi.listStorefrontProducts({
      page: 1,
      search: "",
      brand: "A&B",
      section: undefined,
    });
    await storefrontCatalogApi.listStorefrontProducts({
      type: "Valve",
      display: "true",
      limit: "8",
    });
    await storefrontCatalogApi.getStorefrontProductsByIds([
      "product-1",
      "product-2",
    ]);
    await storefrontCatalogApi.getStorefrontProductReviews("product-1");

    expect(apiFetch.mock.calls).toEqual([
      ["/products/product-1"],
      ["/products?page=1&search=&brand=A%26B"],
      ["/products?type=Valve&display=true&limit=8"],
      [
        "/products/fetch-by-ids",
        {
          method: "POST",
          json: { ids: ["product-1", "product-2"] },
        },
      ],
      ["/products/product-1/review"],
    ]);
  });

  test("keeps public product transports credential-free", async () => {
    const publicListResult =
      await storefrontCatalogApi.listPublicStorefrontProducts({
        search: "",
        section: "Pipes",
        value: undefined,
      });
    const publicBatchResult =
      await storefrontCatalogApi.getPublicStorefrontProductsByIds([
        "product-1",
      ]);

    expect(publicListResult).toBe(response);
    expect(publicBatchResult).toBe(response);
    expect(global.fetch.mock.calls).toEqual([
      ["https://api.test/products?search=&section=Pipes"],
      [
        "https://api.test/products/fetch-by-ids",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: ["product-1"] }),
        },
      ],
    ]);
    expect(global.fetch.mock.calls[1][1]).not.toHaveProperty("credentials");
  });

  test("selects review create and update paths without changing payload", async () => {
    const review = { comment: "Good", rating: 5 };

    await storefrontCatalogApi.saveStorefrontProductReview(
      "product-1",
      undefined,
      review,
    );
    await storefrontCatalogApi.saveStorefrontProductReview(
      "product-1",
      "review-1",
      review,
    );
    await storefrontCatalogApi.deleteStorefrontProductReview(
      "product-1",
      "review-1",
    );

    expect(apiFetch.mock.calls).toEqual([
      [
        "/products/product-1/review/create",
        { method: "POST", json: review },
      ],
      [
        "/products/product-1/review/review-1",
        { method: "PUT", json: review },
      ],
      [
        "/products/product-1/review/review-1",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        },
      ],
    ]);
  });

  test("preserves public content, cache and metadata request options", async () => {
    await storefrontCatalogApi.getStorefrontContent({ cache: "no-store" });
    await storefrontCatalogApi.getStorefrontContent({
      headers: { "Content-Type": "application/json" },
    });
    await storefrontCatalogApi.getStorefrontProductTypes();
    await storefrontCatalogApi.getStorefrontProductTypes({
      cache: "no-store",
    });
    await storefrontCatalogApi.getStorefrontPolicies();
    await storefrontCatalogApi.getStorefrontSectionValues("Pipes & Valves");
    await storefrontCatalogApi.getStorefrontBrands();
    await storefrontCatalogApi.getStorefrontSections();
    await storefrontCatalogApi.getStorefrontSectionImages([
      "Pipes",
      "Valves",
    ]);

    expect(global.fetch.mock.calls).toEqual([
      ["https://api.test/manages/", { cache: "no-store" }],
      [
        "https://api.test/manages/",
        { headers: { "Content-Type": "application/json" } },
      ],
      ["https://api.test/products/types"],
      ["https://api.test/products/types", { cache: "no-store" }],
      ["https://api.test/manages/policies"],
      ["https://api.test/chips/Pipes & Valves/value"],
      ["https://api.test/chips/brands"],
      ["https://api.test/chips/section"],
      [
        "https://api.test/chips/sections/images",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: ["Pipes", "Valves"] }),
        },
      ],
    ]);
  });

  test("keeps raw section interpolation and encodes only the value", async () => {
    const sectionName = "Pipes & Valves";
    const value = "High pressure / 10%";

    const result =
      await storefrontCatalogApi.listStorefrontSectionValueProducts(
        sectionName,
        value,
      );

    expect(result).toBe(response);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test/products?section=" +
        sectionName +
        "&value=" +
        encodeURIComponent(value),
    );
  });
});
