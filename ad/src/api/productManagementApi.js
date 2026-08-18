import { apiFetch, resolveApiUrl } from "./httpClient";

const publicFetch = (path, options) => {
  const url = resolveApiUrl(path);
  return options === undefined ? fetch(url) : fetch(url, options);
};

const throwProductError = async (response, fallbackMessage) => {
  if (response.ok) return;
  const errorData = await response.json();
  throw new Error(errorData.message || fallbackMessage);
};

export const getProductDetail = async (productId, { admin = false } = {}) => {
  const suffix = admin ? '/admin-detail' : '';
  const response = await apiFetch(`/products/${productId}${suffix}`);
  if (!response.ok) return null;
  return response.json();
};

export const deleteProductVariantImage = async (productId, variantIndex) => {
  const response = await apiFetch(`/products/${productId}/${variantIndex}/image`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete old image');
};

export const uploadProductDetailImage = async (file) => {
  const formData = new FormData();
  formData.append('product', file);
  const response = await apiFetch('/products/upload/image', {
    method: 'POST',
    body: formData,
  });
  return response.json();
};

export const updateProduct = async (productId, product) => {
  const response = await apiFetch(`/products/${productId}`, {
    method: 'PUT',
    json: product,
  });
  await throwProductError(response, 'Failed to update product');
};

export const deleteProduct = async (productId) => {
  const response = await apiFetch(`/products/${productId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  await throwProductError(response, 'Failed to delete product');
};

export const addProductQuantity = async (productId, variantIndex, quantity) => {
  const response = await apiFetch(`/products/${productId}/${variantIndex}`, {
    method: 'POST',
    json: { quantity, orderId: '', orderName: '' },
  });
  await throwProductError(response, 'Failed to update quantity');
};

export const updateProductVat = async (productId, vat) => {
  const response = await apiFetch(`/products/${productId}`, {
    method: 'PUT',
    json: { vat },
  });
  await throwProductError(response, 'Failed to update VAT');
};

export const updateProductEarn = async (productId, variantIndex, earn) => {
  const response = await apiFetch(
    `/products/${productId}/${variantIndex}/update-earn`,
    {
      method: 'PUT',
      json: { earn },
    },
  );
  await throwProductError(response, 'Failed to update earn');
};

export const updateProductImportPrice = async (
  productId,
  variantIndex,
  importPrice,
) => {
  const response = await apiFetch(
    `/products/${productId}/${variantIndex}/update-import-price`,
    {
      method: 'PUT',
      json: { importPrice },
    },
  );
  await throwProductError(response, 'Failed to update import price');
};

export const getProductDisplayTaxonomy = async () => {
  const [brandsResponse, typesResponse, sectionsResponse] = await Promise.all([
    publicFetch('/chips/brands'),
    publicFetch('/products/types', { cache: 'no-store' }),
    publicFetch('/chips/section'),
  ]);
  const [brands, types, sections] = await Promise.all([
    brandsResponse.ok ? brandsResponse.json() : null,
    typesResponse.ok ? typesResponse.json() : null,
    sectionsResponse.ok ? sectionsResponse.json() : null,
  ]);
  return { brands, types, sections };
};

export const getProductDisplaySectionValues = async (sectionName) => {
  const response = await publicFetch(`/chips/${sectionName}/value`);
  if (!response.ok) return null;
  return response.json();
};

export const getChipValues = async () => {
  const response = await publicFetch('/chips/getValues');
  return response.json();
};

export const getProductSectionDevices = async (sectionName) => {
  const sectionsResponse = await publicFetch('/chips/section');
  const sections = await sectionsResponse.json();
  let image;

  if (sections.find((section) => section === sectionName)) {
    const sectionDocumentResponse = await publicFetch('/chips/section-doc');
    const sectionDocument = await sectionDocumentResponse.json();
    const sectionDetail = sectionDocument.Section.find(
      (section) => section.name === sectionName,
    );
    const imgUrl = sectionDetail?.imgUrl || null;
    image = {
      imgUrl,
      filename: imgUrl ? imgUrl.split('/').pop() : null,
    };
  }

  const devicesResponse = await publicFetch(`/chips/${sectionName}/value`);
  return { devices: await devicesResponse.json(), image };
};

export const updateProductSectionValue = async (
  sectionName,
  oldValue,
  newValue,
) => {
  const response = await apiFetch(`/chips/${sectionName}/value`, {
    method: 'PUT',
    json: { oldValue, newValue },
  });
  return {
    ok: response.ok,
    data: response.ok ? null : await response.json(),
  };
};

export const deleteProductSectionValue = async (sectionName, value) => {
  const response = await apiFetch(`/chips/${sectionName}/value`, {
    method: 'DELETE',
    json: { value },
  });
  return {
    ok: response.ok,
    data: response.ok ? null : await response.json(),
  };
};

export const addChipValue = async (type, value) => {
  const response = await apiFetch('/chips/addValue', {
    method: 'POST',
    json: { type, value },
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
};

export const removeChipValue = async (type, value) => {
  const response = await apiFetch('/chips/removeValue', {
    method: 'POST',
    json: { type, value },
  });
  return response.ok;
};

export const addProductSectionValue = async (sectionName, value) => {
  const response = await apiFetch(`/chips/${sectionName}/value`, {
    method: 'POST',
    json: { value },
  });
  return { ok: response.ok, data: await response.json() };
};

export const uploadProductSectionImage = async (file) => {
  const formData = new FormData();
  formData.append('sectionImage', file);
  const response = await apiFetch('/chips/upload-section-image', {
    method: 'POST',
    body: formData,
  });
  return {
    ok: response.ok,
    data: response.ok ? await response.json() : null,
  };
};

export const deleteProductSectionImage = (filename) =>
  apiFetch(`/chips/delete-section-image/${filename}`, {
    method: 'DELETE',
  });

export const updateProductSectionImage = (sectionName, value, imgUrl) =>
  apiFetch(`/chips/${sectionName}/value`, {
    method: 'PUT',
    json: {
      oldValue: value,
      newValue: value,
      imgUrl,
    },
  });

export const bulkDeleteProducts = async (ids) => {
  const response = await apiFetch("/products/bulk-delete", {
    method: "POST",
    json: { ids },
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Failed to bulk delete products");
  }
};

export const getProducts = async ({ page, limit, filters }) => {
  const query = new URLSearchParams({
    page,
    limit,
    ...filters,
  }).toString();
  const response = await apiFetch(`/products?${query}`);
  return response.json();
};

export const getProductTaxonomy = async () => {
  const [brandsResponse, typesResponse, sectionResponse] = await Promise.all([
    publicFetch("/chips/brands"),
    publicFetch("/products/types", { cache: "no-store" }),
    publicFetch("/chips/section"),
  ]);
  const [brands, types, sections] = await Promise.all([
    brandsResponse.json(),
    typesResponse.json(),
    sectionResponse.json(),
  ]);
  return { brands, types, sections };
};

export const getProductSections = async () => {
  const response = await publicFetch("/chips/section");
  if (!response.ok) {
    throw new Error(`Lỗi: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Dữ liệu không hợp lệ");
  return data;
};

export const getProductSectionValues = async (sectionName) => {
  const response = await publicFetch(`/chips/${sectionName}/value`);
  if (!response.ok) throw new Error("Không tìm thấy dữ liệu");
  return response.json();
};

export const toggleProductDisplay = async (productId) => {
  const response = await apiFetch(`/products/${productId}/toggle-display`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Không thể thay đổi trạng thái hiển thị");
  }
  return response.json();
};

export const uploadProductImage = async (file) => {
  const formData = new FormData();
  formData.append("product", file);
  const response = await apiFetch("/products/upload/image", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Upload ảnh thất bại");
  }
  return data.imgUrl;
};

export const uploadProductDocument = async (file) => {
  const formData = new FormData();
  formData.append("document", file);
  const response = await apiFetch("/products/upload/document", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Không thể upload file PDF");
  }
  return data;
};

export const createProduct = async (product) => {
  const response = await apiFetch("/products/create", {
    method: "POST",
    json: product,
  });
  return { status: response.status, data: await response.json() };
};

export const createProductBrand = async (brandName) => {
  const response = await apiFetch("/chips/brands", {
    method: "POST",
    json: { Brand: brandName },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Unknown error occurred");
  }
};

export const saveProductType = async ({ typeId, typeName, icon }) => {
  const response = await apiFetch(
    typeId ? `/products/types/${typeId}` : "/products/types",
    {
      method: typeId ? "PUT" : "POST",
      json: { Type: typeName, icon },
    },
  );
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "Không thể lưu loại sản phẩm");
  }
  return result;
};

export const deleteProductBrand = async (brandId) => {
  const response = await apiFetch(`/chips/brands/${brandId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to delete brand");
  }
};

export const deleteProductType = async (typeId) => {
  const response = await apiFetch(`/products/types/${typeId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "Không thể xóa loại sản phẩm");
  }
  return result;
};

export const createProductSection = async (name) => {
  const response = await apiFetch("/chips/section", {
    method: "POST",
    json: { name },
  });
  if (!response.ok) throw new Error("Lỗi khi thêm mục!");
};

export const deleteProductSection = async (sectionName) => {
  const response = await apiFetch(`/chips/section/${sectionName}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Xóa không thành công");
  return data;
};

export const updateProductSection = async (sectionName, name) => {
  const response = await apiFetch(`/chips/section/${sectionName}`, {
    method: "PUT",
    json: { name },
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Cập nhật thất bại");
  }
};
