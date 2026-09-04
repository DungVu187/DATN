import { describe, expect, test, vi } from "vitest";
import { apiFetch } from "./httpClient";
import {
  clearChatHistory,
  sendChatMessage,
  sendCustomerBehaviorEvents,
} from "./chatApi";

vi.mock("./httpClient", () => ({
  apiFetch: vi.fn(),
}));

describe("chatApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  test("sends the chat payload through the credentialed client", async () => {
    const response = { ok: true, status: 200 };
    apiFetch.mockResolvedValue(response);

    const payload = { message: "Tìm PLC", sessionId: "session-1" };
    await expect(sendChatMessage(payload)).resolves.toBe(response);

    expect(apiFetch).toHaveBeenCalledWith("/chat/send", {
      method: "POST",
      json: payload,
    });
  });

  test("maps clear and behavior batch endpoints", async () => {
    const response = { ok: true, status: 200 };
    apiFetch.mockResolvedValue(response);
    const events = [{
      visitorId: "visitor-1",
      sessionId: "session-1",
      eventType: "search_product",
      query: "PLC",
    }];

    await clearChatHistory("session-1");
    await sendCustomerBehaviorEvents(events);

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/chat/clear", {
      method: "DELETE",
      json: { sessionId: "session-1" },
    });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/chat/events", {
      method: "POST",
      json: { events },
    });
  });
});
