import { prisma } from "@shared/database";
import { THREAD_SUMMARY_MAX_CHARS } from "@shared/types";

// ---------------------------------------------------------------------------
// supportSummary service
//
// Writes the inbox-card one-liner summary for a SupportConversation. The
// summarization workflow (apps/queue) calls `updateSummary` after a
// successful LLM round-trip. The projection service reads the cached value
// directly off the conversation row — no service call needed for reads.
//
//   import * as supportSummary from "@shared/rest/services/support/support-summary-service";
//   await supportSummary.updateSummary({ conversationId, summary, sourceEventId, generatedAt });
//
// See docs/conventions/service-layer-conventions.md.
// ---------------------------------------------------------------------------

interface UpdateSummaryInput {
  conversationId: string;
  summary: string;
  sourceEventId: string;
  generatedAt?: Date;
}

/**
 * Persist a freshly generated thread summary. Overwrites any existing summary
 * on the conversation — summaries are a cache, not a history.
 *
 * Hard-caps the string at `THREAD_SUMMARY_MAX_CHARS` as a belt-and-braces
 * guard: Zod already rejects over-length responses at the agent service
 * boundary, but truncating here keeps the column schema honest even if the
 * contract drifts.
 */
export async function updateSummary(input: UpdateSummaryInput): Promise<void> {
  const trimmed = input.summary.trim().slice(0, THREAD_SUMMARY_MAX_CHARS);
  if (trimmed.length === 0) return;

  await prisma.supportConversation.update({
    where: { id: input.conversationId },
    data: {
      threadSummary: trimmed,
      threadSummaryGeneratedAt: input.generatedAt ?? new Date(),
      threadSummarySourceEventId: input.sourceEventId,
    },
  });
}

interface ShouldRegenerateInput {
  currentSourceEventId: string | null;
  latestCustomerEventId: string | null;
}

/**
 * Pure truth table — the workflow and future trigger paths both consume this
 * to decide whether to kick off a regeneration. Regeneration is a V2 feature;
 * the helper ships now so the call sites don't branch inline later.
 */
export function shouldRegenerate(input: ShouldRegenerateInput): boolean {
  if (!input.latestCustomerEventId) return false;
  if (!input.currentSourceEventId) return true;
  return input.currentSourceEventId !== input.latestCustomerEventId;
}
