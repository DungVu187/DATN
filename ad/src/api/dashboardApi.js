import { apiFetch } from "./httpClient";

/**
 * Fetch dashboard aggregated data with optional start and end date filters.
 *
 * @param {Object} [params]
 * @param {string} [params.startDate] - YYYY-MM-DD
 * @param {string} [params.endDate] - YYYY-MM-DD
 * @returns {Promise<Response>}
 */
export const getDashboardData = ({ startDate, endDate } = {}) => {
  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);

  const queryString = queryParams.toString();
  const path = queryString ? `/dashboard?${queryString}` : "/dashboard";

  return apiFetch(path);
};
