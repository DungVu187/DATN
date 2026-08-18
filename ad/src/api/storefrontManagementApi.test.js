import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
const resolveApiUrlMock = vi.hoisted(() =>
  vi.fn((pathValue) => `https://api.test${pathValue}`),
);

vi.mock("./httpClient", () => ({
  apiFetch: apiFetchMock,
  resolveApiUrl: resolveApiUrlMock,
}));

import {
  deleteStorefrontImage,
  getPublicStorefrontProductTypes,
  getStorefrontManagement,
  getStorefrontPolicies,
  getStorefrontProductTypes,
  getStorefrontProductsByIds,
  resolveStorefrontAssetUrl,
  searchStorefrontProducts,
  toggleStorefrontProductDisplay,
  updateStorefrontHomeCategories,
  updateStorefrontIntroduction,
  updateStorefrontPartnerSettings,
  updateStorefrontPolicies,
  updateStorefrontSection,
  uploadStorefrontImages,
  uploadStorefrontSectionImage,
} from "./storefrontManagementApi";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const originalFetch = globalThis.fetch;

describe("storefrontManagementApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps storefront content, section and policy JSON requests", async () => {
    const response = { ok: true, status: 200 };
    apiFetchMock.mockResolvedValue(response);

    await expect(getStorefrontManagement()).resolves.toBe(response);
    await expect(
      getStorefrontManagement({ includeJsonHeader: true }),
    ).resolves.toBe(response);
    await expect(
      updateStorefrontPartnerSettings({ partners: ["ABB"] }),
    ).resolves.toBe(response);
    await expect(deleteStorefrontImage("/images/banner.webp")).resolves.toBe(
      response,
    );
    await expect(
      updateStorefrontIntroduction("Giới thiệu", {
        vi: "Giới thiệu",
        zh: "介绍",
        en: "Introduction",
      }),
    ).resolves.toBe(response);
    await expect(
      updateStorefrontSection("section11", { display: false, image: "" }),
    ).resolves.toBe(response);
    await expect(
      updateStorefrontHomeCategories({ configured: true, items: [] }),
    ).resolves.toBe(response);
    await expect(getStorefrontPolicies()).resolves.toBe(response);
    await expect(updateStorefrontPolicies([{ key: "purchase" }])).resolves.toBe(
      response,
    );

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/manages/");
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/manages/",
      { headers: { "Content-Type": "application/json" } },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/manages/update-partners-text",
      { method: "PUT", json: { partners: ["ABB"] } },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(4, "/manages/delete-image", {
      method: "DELETE",
      json: { imgUrl: "/images/banner.webp" },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      5,
      "/manages/update-introduction",
      {
        method: "PUT",
        json: {
          introduction: "Giới thiệu",
          translations: {
            vi: "Giới thiệu",
            zh: "介绍",
            en: "Introduction",
          },
        },
      },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      6,
      "/manages/update-section/section11",
      { method: "PUT", json: { display: false, image: "" } },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      7,
      "/manages/update-home-categories",
      { method: "PUT", json: { configured: true, items: [] } },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(8, "/manages/policies");
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      9,
      "/manages/update-policies",
      { method: "PUT", json: { policies: [{ key: "purchase" }] } },
    );
  });

  it("resolves storefront asset URLs without rewriting absolute sources", () => {
    expect(resolveStorefrontAssetUrl("/uploads/category.webp")).toBe(
      "https://api.test/uploads/category.webp",
    );
    expect(resolveStorefrontAssetUrl("https://cdn.test/category.webp")).toBe(
      "https://cdn.test/category.webp",
    );
    expect(resolveStorefrontAssetUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc",
    );
    expect(resolveStorefrontAssetUrl("")).toBe("");
  });

  it.each([
    ["banner", "/manages/update-images", "POST", null],
    ["partners", "/manages/update-partners", "POST", null],
    ["topPurchase", "/manages/update", "PUT", "topPurchaseUrl"],
    ["highestRating", "/manages/update", "PUT", "highestRatingUrl"],
  ])(
    "maps %s media uploads",
    async (type, endpoint, method, marker) => {
      apiFetchMock.mockResolvedValue({ ok: true });
      const firstFile = new File(["one"], "one.webp", { type: "image/webp" });
      const secondFile = new File(["two"], "two.webp", { type: "image/webp" });

      await uploadStorefrontImages(type, [firstFile, secondFile]);

      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const [pathValue, options] = apiFetchMock.mock.calls[0];
      expect(pathValue).toBe(endpoint);
      expect(options.method).toBe(method);
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.getAll("manage")).toEqual([firstFile, secondFile]);
      if (marker) expect(options.body.get(marker)).toBe("true");
    },
  );

  it("maps section image and product catalog request contracts", async () => {
    apiFetchMock.mockResolvedValue({ ok: true });
    globalThis.fetch.mockResolvedValue({ ok: true });
    const file = new File(["image"], "section.webp", { type: "image/webp" });

    await uploadStorefrontSectionImage(file);
    await getStorefrontProductTypes();
    await getPublicStorefrontProductTypes();
    await getStorefrontProductsByIds(["p1", "p2"]);
    await searchStorefrontProducts({ search: "PLC S7", page: 2, limit: 25 });
    await toggleStorefrontProductDisplay("p1");

    const uploadOptions = apiFetchMock.mock.calls[0][1];
    expect(apiFetchMock.mock.calls[0][0]).toBe(
      "/manages/upload-section-image",
    );
    expect(uploadOptions.method).toBe("POST");
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect(uploadOptions.body.get("image")).toBe(file);
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/products/types", {
      headers: { "Content-Type": "application/json" },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.test/products/types",
      { cache: "no-store" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      "/products/fetch-by-ids",
      { method: "POST", json: { ids: ["p1", "p2"] } },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      4,
      "/products/?search=PLC+S7&page=2&limit=25",
      { headers: { "Content-Type": "application/json" } },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      5,
      "/products/p1/toggle-display",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  it("keeps Storefront Administration components free of direct transport", () => {
    for (const componentName of [
      "manage.jsx",
      "sectiondisplay.jsx",
      "homecategorymanager.jsx",
      "policymanagement.jsx",
    ]) {
      const source = fs.readFileSync(
        path.join(currentDirectory, "..", "components", componentName),
        "utf8",
      );
      expect(source).toContain("storefrontManagementApi");
      expect(source).not.toContain("fetch(");
      expect(source).not.toContain("apiFetch");
      expect(source).not.toContain("VITE_API_URL");
      expect(source).not.toContain("new FormData");
    }
  });
});
