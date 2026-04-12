import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for resolveDeliveryThreadTs — the Slack thread picker
 * invoked by every operator reply.
 *
 * Rules under test:
 *   1. Explicit replyToEventId → that event's messageTs
 *   2. Default               → conversationRootThreadTs
 *
 * An earlier revision also implemented burst-sensitive targeting and a
 * sticky cache of prior delivery thread stamps. Those rules were removed
 * because they broke ingress routing: Slack threads anchored to later
 * messages had thread_ts values that didn't match the conversation's
 * canonical key, so customer replies to those threads spawned phantom
 * conversations. Until we add a conversation ↔ thread_ts alias table,
 * one Slack thread per conversation is the only safe shape. See the
 * docstring in resolveDeliveryThreadTs for the full rationale.
 */

const mockEventFindUnique = vi.fn();

vi.mock("@shared/database", () => ({
  prisma: {
    supportConversationEvent: {
      findUnique: (...args: unknown[]) => mockEventFindUnique(...args),
    },
  },
}));

const { resolveDeliveryThreadTs } = await import(
  "@shared/rest/services/support/support-command/reply"
);

const CONV_ID = "conv-123";
const CONV_ROOT = "1700000000.000000";
const EXPLICIT_TARGET_TS = "1700000800.333333";

describe("resolveDeliveryThreadTs", () => {
  beforeEach(() => {
    mockEventFindUnique.mockReset();
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
    });

    it("falls through to the conversation root when the targeted event has no messageTs", async () => {
      mockEventFindUnique.mockResolvedValue({ detailsJson: {} });

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: "evt-xyz",
      });

      expect(result).toBe(CONV_ROOT);
    });

    it("falls through when the targeted event is missing entirely", async () => {
      mockEventFindUnique.mockResolvedValue(null);

      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: "evt-xyz",
      });

      expect(result).toBe(CONV_ROOT);
    });
  });

  describe("Rule 2: default to conversation root", () => {
    it("returns conversationRootThreadTs when no replyToEventId is provided", async () => {
      const result = await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: undefined,
      });

      expect(result).toBe(CONV_ROOT);
      expect(mockEventFindUnique).not.toHaveBeenCalled();
    });

    it("never consults delivery history or customer messages (no per-reply DB lookups)", async () => {
      // This is the regression guard: the earlier burst-sensitive resolver
      // ran two extra findFirst queries per reply. The simplified resolver
      // must not regress that performance profile.
      await resolveDeliveryThreadTs({
        conversationId: CONV_ID,
        conversationRootThreadTs: CONV_ROOT,
        replyToEventId: undefined,
      });

      expect(mockEventFindUnique).not.toHaveBeenCalled();
    });
  });
});
