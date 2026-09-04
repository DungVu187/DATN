import { beforeEach, describe, expect, test, vi } from "vitest";
import { sendCustomerBehaviorEvents } from "../api/chatApi";
import {
  flushCustomerBehavior,
  getCustomerSessionId,
  getCustomerVisitorId,
  resetCustomerBehaviorTracker,
  trackCustomerBehavior,
} from "./customerBehaviorTracker";

vi.mock("../api/chatApi", () => ({
  sendCustomerBehaviorEvents: vi.fn(),
}));

describe("customerBehaviorTracker", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetCustomerBehaviorTracker();
    vi.useFakeTimers();
    sendCustomerBehaviorEvents.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    resetCustomerBehaviorTracker();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test("persists visitor and session identifiers in the intended storage scopes", () => {
    const visitorId = getCustomerVisitorId();
    const sessionId = getCustomerSessionId();

    expect(visitorId).toBe(localStorage.getItem("NOVA:chatVisitorId"));
    expect(sessionId).toBe(sessionStorage.getItem("NOVA:behaviorSessionId"));
    expect(visitorId).not.toBe(sessionId);
  });

  test("batches events and suppresses duplicate events in a short window", async () => {
    trackCustomerBehavior({ eventType: "search_product", query: "PLC", path: "/product" });
    trackCustomerBehavior({ eventType: "search_product", query: "PLC", path: "/product" });
    trackCustomerBehavior({ eventType: "view_product", productId: "507f1f77bcf86cd799439011" });

    await vi.advanceTimersByTimeAsync(700);

    expect(sendCustomerBehaviorEvents).toHaveBeenCalledTimes(1);
    const [events] = sendCustomerBehaviorEvents.mock.calls[0];
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(expect.objectContaining({
      eventType: "search_product",
      query: "PLC",
    }));
    expect(events[1]).toEqual(expect.objectContaining({
      eventType: "view_product",
      productId: "507f1f77bcf86cd799439011",
    }));
    expect(events[0].visitorId).toBe(getCustomerVisitorId());
    expect(events[0].sessionId).toBe(getCustomerSessionId());
  });

  test("allows a manual flush before the debounce timer fires", async () => {
    trackCustomerBehavior({ eventType: "start_checkout", path: "/cart" });
    await flushCustomerBehavior();

    expect(sendCustomerBehaviorEvents).toHaveBeenCalledTimes(1);
    expect(sendCustomerBehaviorEvents.mock.calls[0][0][0]).toEqual(expect.objectContaining({
      eventType: "start_checkout",
      path: "/cart",
    }));
  });
});
