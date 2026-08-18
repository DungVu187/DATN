import { describe, expect, it, vi } from "vitest";
import { getDashboardData } from "./dashboardApi";

describe("dashboardApi", () => {
  it("calls /dashboard with default path when no dates provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    globalThis.fetch = fetchSpy;

    await getDashboardData();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/dashboard$/),
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("appends startDate and endDate as query params", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    globalThis.fetch = fetchSpy;

    await getDashboardData({ startDate: "2026-08-01", endDate: "2026-08-18" });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/dashboard\?startDate=2026-08-01&endDate=2026-08-18/),
      expect.objectContaining({ credentials: "include" })
    );
  });
});
