import { apiFetch, resolveApiUrl } from "./httpClient";

const jsonHeaders = { "Content-Type": "application/json" };

const publicFetch = (path, options) => {
  const url = resolveApiUrl(path);
  return options === undefined ? fetch(url) : fetch(url, options);
};

const publicJsonFetch = (path, method, payload) =>
  publicFetch(path, {
    method,
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });

const buildQuery = (queryParams = {}) =>
  new URLSearchParams(
    Object.entries(queryParams).filter(([, value]) => value !== undefined),
  ).toString();

export const resolveStorefrontAssetUrl = (assetUrl) => {
  if (!assetUrl) return "";
  if (/^https?:\/\//i.test(assetUrl) || assetUrl.startsWith("data:")) {
    return assetUrl;
  }
  return resolveApiUrl(assetUrl);
};

export const getStorefrontProduct = (productId) =>
  apiFetch("/products/" + productId);

export const listStorefrontProducts = (queryParams = {}) =>
  apiFetch("/products?" + buildQuery(queryParams));

export const listPublicStorefrontProducts = (queryParams = {}) =>
  publicFetch("/products?" + buildQuery(queryParams));

export const getStorefrontProductsByIds = (ids) =>
  apiFetch("/products/fetch-by-ids", {
    method: "POST",
    json: { ids },
  });

export const getPublicStorefrontProductsByIds = (ids) =>
  publicJsonFetch("/products/fetch-by-ids", "POST", { ids });

export const getStorefrontProductReviews = (productId) =>
  apiFetch("/products/" + productId + "/review");

export const saveStorefrontProductReview = (productId, reviewId, review) =>
  apiFetch(
    reviewId
      ? "/products/" + productId + "/review/" + reviewId
      : "/products/" + productId + "/review/create",
    {
      method: reviewId ? "PUT" : "POST",
      json: review,
    },
  );

export const deleteStorefrontProductReview = (productId, reviewId) =>
  apiFetch("/products/" + productId + "/review/" + reviewId, {
    method: "DELETE",
    headers: jsonHeaders,
  });

export const getStorefrontContent = (options) =>
  publicFetch("/manages/", options);

export const getStorefrontProductTypes = (options) =>
  publicFetch("/products/types", options);

export const getStorefrontSectionDocument = () =>
  publicFetch("/chips/section-doc");

export const getStorefrontPolicies = () => publicFetch("/manages/policies");

export const getStorefrontSectionValues = (sectionName) =>
  publicFetch("/chips/" + sectionName + "/value");

export const getStorefrontBrands = () => publicFetch("/chips/brands");

export const getStorefrontSections = () => publicFetch("/chips/section");

export const getStorefrontSectionImages = (names) =>
  publicJsonFetch("/chips/sections/images", "POST", { names });

export const listStorefrontSectionValueProducts = (sectionName, value) =>
  publicFetch(
    "/products?section=" +
      sectionName +
      "&value=" +
      encodeURIComponent(value),
  );
