import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for resolveDeliveryThreadTs — the burst-sensitive Slack thread
 * picker invoked by every operator reply.
 *
 * Rules under test:
 *   1. Explicit replyToEventId  → that event's messageTs
 *   2. New burst since last reply → latest customer messageTs
 *   3. No new customer activity  → sticky to last delivery's threadTs
 *   4. Legacy fallback          → latest customer or conversation root
 *
 * We mock @shared/database so each test can shape the findFirst/findUnique
 * return values without a real Prisma connection.
 */

const mockEventFindUnique = vi.fn();
const mockEventFindFirst = vi.fn();

vi.mock("@shared/database", () => ({
  prisma: {
    supportConversationEvent: {
      findUnique: (...args: unknown[]) => mockEventFindUnique(...args),
      findFirst: (...args: unknown[]) => mockEventFindFirst(...args),
    },
  },
}));

const { resolveDeliveryThreadTs } = await import(
  "@shared/rest/services/support/support-command/reply"
);

const CONV_ID = "conv-123";
const CONV_ROOT = "1700000000.000000";
const LATEST_CUSTOMER_TS = "1700000500.111111";
const LAST_DELIVERY_TS = "1700000300.222222";
const EXPLICIT_TARGET_TS = "1700000800.333333";

describe("resolveDeliveryThreadTs", () => {
  beforeEach(() => {
    mockEventFindUnique.mockReset();
    mockEventFindFirst.mockReset();
  });

  describe("Rule 1: explicit replyToEventId", () => {
    it("returns the targeted event's messageTs when replyToEventId is provided", async () => {
      mockEventFindUnique.mockResolvedValue({
        detailsJson: { messageTs: EXPLICIT_TARGET_TS },
      });

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: "evt-xyz",
      });

      expect(result).toBe(EXPLICIT_TARGET_TS);
      expect(mockEventFindUnique).toHaveBeenCalledOnce();
      expect(mockEventFindFirst).not.toHaveBeenCalled();
    });

    it("falls through to rules 2-4 when the targeted event has no messageTs", async () => {
      mockEventFindUnique.mockResolvedValue({ detailsJson: {} });
      mockEventFindFirst
        .mockResolvedValueOnce(null) // no lastDelivery
        .mockResolvedValueOnce(null); // no latestCustomer

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: "evt-xyz",
      });

      expect(result).toBe(CONV_ROOT);
    });
  });

  describe("Rule 2: new burst since last reply", () => {
    it("threads off the latest customer messageTs when customer activity > last delivery", async () => {
      const lastDeliveryAt = new Date("2024-06-01T10:00:00Z");
      const laterCustomerAt = new Date("2024-06-01T10:05:00Z");

      mockEventFindFirst
        .mockResolvedValueOnce({
          createdAt: lastDeliveryAt,
          detailsJson: { threadTs: LAST_DELIVERY_TS },
        })
        .mockResolvedValueOnce({
          createdAt: laterCustomerAt,
          detailsJson: { messageTs: LATEST_CUSTOMER_TS },
        });

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: undefined,
      });

      expect(result).toBe(LATEST_CUSTOMER_TS);
    });

    it("first reply in the conversation picks latest customer message", async () => {
      mockEventFindFirst
        .mockResolvedValueOnce(null) // no prior delivery
        .mockResolvedValueOnce({
          createdAt: new Date(),
          detailsJson: { messageTs: LATEST_CUSTOMER_TS },
        });

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: undefined,
      });

      expect(result).toBe(LATEST_CUSTOMER_TS);
    });

    it("first reply with zero customer messages falls back to conversation root", async () => {
      mockEventFindFirst
        .mockResolvedValueOnce(null) // no prior delivery
        .mockResolvedValueOnce(null); // no customer messages

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: undefined,
      });

      expect(result).toBe(CONV_ROOT);
    });
  });

  describe("Rule 3: sticky to last delivery's thread", () => {
    it("reuses last delivery's threadTs when no new customer messages since", async () => {
      const lastDeliveryAt = new Date("2024-06-01T10:10:00Z");
      const olderCustomerAt = new Date("2024-06-01T10:05:00Z");

      mockEventFindFirst
        .mockResolvedValueOnce({
          createdAt: lastDeliveryAt,
          detailsJson: { threadTs: LAST_DELIVERY_TS },
        })
        .mockResolvedValueOnce({
          createdAt: olderCustomerAt,
          detailsJson: { messageTs: LATEST_CUSTOMER_TS },
        });

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: undefined,
      });

      expect(result).toBe(LAST_DELIVERY_TS);
    });

    it("sticky reuse works when customer has sent nothing at all post-first-reply", async () => {
      mockEventFindFirst
        .mockResolvedValueOnce({
          createdAt: new Date("2024-06-01T10:00:00Z"),
          detailsJson: { threadTs: LAST_DELIVERY_TS },
        })
        .mockResolvedValueOnce(null); // no customer messages

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: undefined,
      });

      expect(result).toBe(LAST_DELIVERY_TS);
    });
  });

  describe("Rule 4: legacy fallback", () => {
    it("falls back to latest customer messageTs when last delivery has no stored threadTs", async () => {
      const lastDeliveryAt = new Date("2024-06-01T10:10:00Z");
      const olderCustomerAt = new Date("2024-06-01T10:05:00Z");

      mockEventFindFirst
        .mockResolvedValueOnce({
          createdAt: lastDeliveryAt,
          detailsJson: {}, // legacy row: no threadTs stamp
        })
        .mockResolvedValueOnce({
          createdAt: olderCustomerAt,
          detailsJson: { messageTs: LATEST_CUSTOMER_TS },
        });

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: undefined,
      });

      expect(result).toBe(LATEST_CUSTOMER_TS);
    });

    it("falls back to conversation root when legacy row has neither stamp nor customer messages", async () => {
      mockEventFindFirst
        .mockResolvedValueOnce({
          createdAt: new Date("2024-06-01T10:10:00Z"),
          detailsJson: {},
        })
        .mockResolvedValueOnce(null);

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: undefined,
      });

      expect(result).toBe(CONV_ROOT);
    });
  });
});
