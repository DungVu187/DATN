import { apiFetch, resolveApiUrl } from "./httpClient";

const publicFetch = (path, options) => {
  const url = resolveApiUrl(path);
  return options === undefined ? fetch(url) : fetch(url, options);
};

const jsonHeaders = { "Content-Type": "application/json" };

export const resolveStorefrontAssetUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  return resolveApiUrl(url);
};

export const getStorefrontManagement = ({ includeJsonHeader = false } = {}) =>
  includeJsonHeader
    ? apiFetch("/manages/", { headers: jsonHeaders })
    : apiFetch("/manages/");

export const updateStorefrontPartnerSettings = (settings) =>
  apiFetch("/manages/update-partners-text", {
    method: "PUT",
    json: settings,
  });

export const updateStorefrontFooterContent = (footerContent) =>
  apiFetch("/manages/update-footer", {
    method: "PUT",
    json: { footerContent },
  });

export const uploadStorefrontImages = (type, files) => {
  const formData = new FormData();
  for (const file of files) formData.append("manage", file);
  if (type === "topPurchase") formData.append("topPurchaseUrl", "true");
  if (type === "highestRating") formData.append("highestRatingUrl", "true");

  const path = type === "banner"
    ? "/manages/update-images"
    : type === "partners"
      ? "/manages/update-partners"
      : "/manages/update";

  return apiFetch(path, {
    method: type === "banner" || type === "partners" ? "POST" : "PUT",
    body: formData,
  });
};

export const deleteStorefrontImage = (imgUrl) =>
  apiFetch("/manages/delete-image", {
    method: "DELETE",
    json: { imgUrl },
  });

export const updateStorefrontIntroduction = (introduction, translations) =>
  apiFetch("/manages/update-introduction", {
    method: "PUT",
    json: { introduction, translations },
  });

export const updateStorefrontSection = (section, update) =>
  apiFetch(`/manages/update-section/${section}`, {
    method: "PUT",
    json: update,
  });

export const uploadStorefrontSectionImage = (file) => {
  const formData = new FormData();
  formData.append("image", file);
  return apiFetch("/manages/upload-section-image", {
    method: "POST",
    body: formData,
  });
};

export const getStorefrontProductTypes = () =>
  apiFetch("/products/types", { headers: jsonHeaders });

export const getPublicStorefrontProductTypes = () =>
  publicFetch("/products/types", { cache: "no-store" });

export const getStorefrontProductsByIds = (ids) =>
  apiFetch("/products/fetch-by-ids", {
    method: "POST",
    json: { ids },
  });

export const searchStorefrontProducts = ({ search, page, limit }) => {
  const query = new URLSearchParams({ search, page, limit }).toString();
  return apiFetch(`/products/?${query}`, { headers: jsonHeaders });
};

export const toggleStorefrontProductDisplay = (productId) =>
  apiFetch(`/products/${productId}/toggle-display`, {
    method: "PUT",
    headers: jsonHeaders,
  });

export const updateStorefrontHomeCategories = (config) =>
  apiFetch("/manages/update-home-categories", {
    method: "PUT",
    json: config,
  });

export const getStorefrontPolicies = () => apiFetch("/manages/policies");

export const updateStorefrontPolicies = (policies) =>
  apiFetch("/manages/update-policies", {
    method: "PUT",
    json: { policies },
  });
