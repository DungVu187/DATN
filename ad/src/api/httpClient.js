const getApiBaseUrl = () => (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export const resolveApiUrl = (path) => {
  if (typeof path !== "string" || path.length === 0) {
    throw new TypeError("HTTP client path must be a non-empty string");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
};

export const getAuthFailure = (response) => {
  if (response?.status === 401) return "unauthorized";
  if (response?.status === 403) return "forbidden";
  return null;
};

export const apiFetch = async (path, options = {}) => {
  const { json, headers: providedHeaders, ...requestOptions } = options;
  const headers = new Headers(providedHeaders);
  let body = requestOptions.body;

  if (json !== undefined) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    body = JSON.stringify(json);
  }

  return fetch(resolveApiUrl(path), {
    ...requestOptions,
    headers,
    body,
    credentials: "include",
  });
};
