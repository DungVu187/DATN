import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "./permissioncontext";
import { usePermissions } from "./usepermissions";

const mockFetchProfile = (profileData, ok = true) => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => profileData,
  });
};

const mockFetchNetworkError = () => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));
};

const wrapper = ({ children }) => (
  <PermissionProvider>{children}</PermissionProvider>
);

describe("PermissionContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Superadmin", () => {
    it("grants all permissions regardless of permissions array", async () => {
      mockFetchProfile({ role: "superadmin", permissions: [] });

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.profile).toEqual({
        role: "superadmin",
        permissions: [],
      });
      expect(result.current.role).toBe("superadmin");
      expect(result.current.isSuperadmin).toBe(true);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isAdminOrSuperadmin).toBe(true);
      expect(result.current.can("product.delete")).toBe(true);
      expect(result.current.canAny(["missing.any", "order.scan_ai"])).toBe(
        true,
      );
      expect(
        result.current.canAll(["anything.one", "anything.two"]),
      ).toBe(true);
    });
  });

  describe("Admin", () => {
    it("temporarily grants all permissions (F1 ADMIN_FULL_ACCESS sync)", async () => {
      mockFetchProfile({ role: "admin", permissions: [] });

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.role).toBe("admin");
      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isSuperadmin).toBe(false);
      expect(result.current.isAdminOrSuperadmin).toBe(true);
      expect(result.current.can("storefront.manage")).toBe(true);
    });
  });

  describe("Staff", () => {
    it("only allows explicitly granted permissions", async () => {
      mockFetchProfile({
        role: "staff",
        permissions: ["product.view", "order.edit"],
      });

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.role).toBe("staff");
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isSuperadmin).toBe(false);
      expect(result.current.isAdminOrSuperadmin).toBe(false);
      expect(result.current.can("product.view")).toBe(true);
      expect(result.current.can("product.delete")).toBe(false);
      expect(result.current.canAny(["product.delete", "order.edit"])).toBe(
        true,
      );
      expect(
        result.current.canAll(["product.view", "order.edit"]),
      ).toBe(true);
      expect(
        result.current.canAll(["product.view", "product.delete"]),
      ).toBe(false);
    });
  });

  describe("Unauthenticated", () => {
    it("sets profile null and isLoading false when 401", async () => {
      mockFetchProfile(null, false);

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.profile).toBeNull();
      expect(result.current.can("product.view")).toBe(false);
      expect(result.current.role).toBe("");
      expect(result.current.permissions).toEqual([]);
    });

    it("handles network error gracefully", async () => {
      mockFetchNetworkError();

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.profile).toBeNull();
      expect(result.current.can("product.view")).toBe(false);
    });
  });

  describe("canAny edge cases", () => {
    it("returns false for empty array", async () => {
      mockFetchProfile({ role: "superadmin", permissions: [] });

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.canAny([])).toBe(false);
    });

    it("accepts a single string", async () => {
      mockFetchProfile({
        role: "staff",
        permissions: ["product.view"],
      });

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.canAny("product.view")).toBe(true);
      expect(result.current.canAny("product.delete")).toBe(false);
    });

    it("returns false for invalid input", async () => {
      mockFetchProfile({ role: "staff", permissions: ["product.view"] });

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.canAny(null)).toBe(false);
      expect(result.current.canAny(undefined)).toBe(false);
      expect(result.current.canAny(123)).toBe(false);
    });
  });

  describe("canAll edge cases", () => {
    it("returns false for empty array", async () => {
      mockFetchProfile({ role: "superadmin", permissions: [] });

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.canAll([])).toBe(false);
    });

    it("accepts a single string", async () => {
      mockFetchProfile({
        role: "staff",
        permissions: ["product.view"],
      });

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.canAll("product.view")).toBe(true);
      expect(result.current.canAll("product.delete")).toBe(false);
    });
  });

  describe("refreshProfile", () => {
    it("updates helpers after a second fetch", async () => {
      mockFetchProfile({ role: "staff", permissions: ["product.view"] });

      const { result } = renderHook(() => usePermissions(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.can("order.edit")).toBe(false);

      mockFetchProfile({
        role: "staff",
        permissions: ["product.view", "order.edit"],
      });

      await act(async () => {
        await result.current.refreshProfile();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.can("order.edit")).toBe(true);
      expect(result.current.can("product.view")).toBe(true);
    });
  });

  describe("Hook safety", () => {
    it("throws when used outside PermissionProvider", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        expect(() => {
          renderHook(() => usePermissions());
        }).toThrow("usePermissions must be used within PermissionProvider");
      } finally {
        consoleError.mockRestore();
      }
    });
  });
});
