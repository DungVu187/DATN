import { apiFetch } from "./httpClient";

const withQuery = (path, queryParams) => {
  const query = new URLSearchParams(queryParams).toString();
  return apiFetch(`${path}?${query}`);
};

export const getStorageHistory = (queryParams) =>
  withQuery("/histories", queryParams);

export const getStorageHistoryFilterOptions = () =>
  apiFetch("/histories/filter-options");

export const getAdminActivityLogs = (queryParams) =>
  withQuery("/activity-logs", queryParams);
