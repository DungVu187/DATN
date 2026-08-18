import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./httpClient", () => ({
  apiFetch: apiFetchMock,
}));

import {
  getAdminActivityLogs,
  getStorageHistory,
  getStorageHistoryFilterOptions,
} from "./adminAuditApi";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

describe("adminAuditApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it("maps storage history direction and filters", async () => {
    await getStorageHistory({
      page: 2,
      limit: 50,
      direction: "export",
      userName: "Lan Anh",
      noteType: "xuat_don",
    });
    await getStorageHistoryFilterOptions();

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/histories?page=2&limit=50&direction=export&userName=Lan+Anh&noteType=xuat_don",
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/histories/filter-options",
    );
  });

  it("maps activity-log filters", async () => {
    await getAdminActivityLogs({
      page: 3,
      limit: 20,
      productName: "PLC S7",
      action: "update_product",
      startDate: "2026-07-01",
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/activity-logs?page=3&limit=20&productName=PLC+S7&action=update_product&startDate=2026-07-01",
    );
  });

  it("keeps active audit pages free of direct transport", () => {
    for (const componentName of ["history.jsx", "activitylog.jsx"]) {
      const source = fs.readFileSync(
        path.join(currentDirectory, "..", "components", componentName),
        "utf8",
      );
      expect(source).toContain("adminAuditApi");
      expect(source).not.toContain("fetch(");
      expect(source).not.toContain("VITE_API_URL");
    }
  });
});
