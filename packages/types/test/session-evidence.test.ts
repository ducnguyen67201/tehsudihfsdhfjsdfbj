import { SESSION_EVENT_TYPE, type SessionTimelineEvent, buildSupportEvidence } from "@shared/types";
import { describe, expect, it } from "vitest";

function event(input: {
  id: string;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
  url?: string | null;
}): SessionTimelineEvent {
  return {
    id: input.id,
    eventType: input.eventType,
    timestamp: input.timestamp,
    url: input.url ?? null,
    payload: input.payload,
  };
}

describe("buildSupportEvidence", () => {
  it("prioritizes exceptions over failed fetches and console errors", () => {
    const evidence = buildSupportEvidence({
      totalEventCount: 4,
      events: [
        event({
          id: "route",
          eventType: SESSION_EVENT_TYPE.route,
          timestamp: "2026-04-23T14:22:00.000Z",
          payload: { to: "/dashboard/api-keys?token=secret" },
        }),
        event({
          id: "network",
          eventType: SESSION_EVENT_TYPE.networkError,
          timestamp: "2026-04-23T14:22:10.000Z",
          payload: {
            method: "GET",
            url: "/api/keys/list?api_key=abc",
            status: 500,
            durationMs: 8412,
          },
        }),
        event({
          id: "console",
          eventType: SESSION_EVENT_TYPE.consoleError,
          timestamp: "2026-04-23T14:22:11.000Z",
          payload: { level: "ERROR", message: "keys.map failed for marcus@northwind.io" },
        }),
        event({
          id: "exception",
          eventType: SESSION_EVENT_TYPE.exception,
          timestamp: "2026-04-23T14:22:12.000Z",
          payload: { name: "TypeError", message: "keys.map failed for marcus@northwind.io" },
        }),
      ],
    });

    expect(evidence.primaryFailure?.eventId).toBe("exception");
    expect(evidence.failedRequests[0]?.url).toBe("/api/keys/list");
    expect(evidence.copy.repro).not.toContain("api_key");
    expect(evidence.copy.repro).not.toContain("marcus@northwind.io");
    expect(evidence.copy.repro).toContain("[email]");
  });

  it("prioritizes 5xx failed fetches over 4xx failed fetches", () => {
    const evidence = buildSupportEvidence({
      totalEventCount: 2,
      events: [
        event({
          id: "four-oh-four",
          eventType: SESSION_EVENT_TYPE.networkError,
          timestamp: "2026-04-23T14:22:10.000Z",
          payload: { method: "GET", url: "/api/missing", status: 404, durationMs: 200 },
        }),
        event({
          id: "five-hundred",
          eventType: SESSION_EVENT_TYPE.networkError,
          timestamp: "2026-04-23T14:22:09.000Z",
          payload: { method: "GET", url: "/api/list", status: 500, durationMs: 8000 },
        }),
      ],
    });

    expect(evidence.primaryFailure?.eventId).toBe("five-hundred");
  });

  it("falls back to latest route context when no failure was captured", () => {
    const evidence = buildSupportEvidence({
      totalEventCount: 10,
      events: [
        event({
          id: "route-1",
          eventType: SESSION_EVENT_TYPE.route,
          timestamp: "2026-04-23T14:22:00.000Z",
          payload: { to: "/dashboard" },
        }),
        event({
          id: "route-2",
          eventType: SESSION_EVENT_TYPE.route,
          timestamp: "2026-04-23T14:23:00.000Z",
          payload: { to: "/dashboard/api-keys?customer=marcus@northwind.io" },
        }),
      ],
    });

    expect(evidence.primaryFailure?.title).toBe("No captured failure");
    expect(evidence.primaryFailure?.eventId).toBe("route-2");
    expect(evidence.lastRoute).toBe("/dashboard/api-keys");
    expect(evidence.eventsWindow.isTruncated).toBe(true);
  });
});
