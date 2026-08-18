import { describe, expect, it } from "vitest";
import {
  ALL_ORDER_FILTER,
  createInitialOrderFilters,
  getOrderNavigationFilterPatch,
} from "./orderFilters";

describe("order navigation filters", () => {
  it("maps active dashboard statuses to the order status filter", () => {
    expect(getOrderNavigationFilterPatch({ statusFilter: "Delivering" })).toEqual({
      id: "",
      status: "Delivering",
      state: "Processing",
    });
  });

  it("maps cancelled dashboard status to the order state filter", () => {
    expect(getOrderNavigationFilterPatch({ statusFilter: "Cancelled" })).toEqual({
      id: "",
      status: ALL_ORDER_FILTER,
      state: "Cancelled",
    });
  });

  it("preserves order detail navigation and ignores unknown statuses", () => {
    expect(createInitialOrderFilters({ orderId: "order-123" }).id).toBe("order-123");
    expect(getOrderNavigationFilterPatch({ statusFilter: "Unknown" })).toBeNull();
  });
});
