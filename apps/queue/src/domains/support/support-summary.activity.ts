import * as supportSummary from "@shared/rest/services/support/support-summary-service";
import type { SupportSummaryWorkflowInput, SupportSummaryWorkflowResult } from "@shared/types";

/**
 * Generate and persist a one-line thread summary for inbox cards.
 *
 * The activity stays orchestration-only: shared services own the Prisma reads,
 * the agents-service HTTP call, and the summary write-back.
 */
export async function generateConversationSummary(
  input: SupportSummaryWorkflowInput
): Promise<SupportSummaryWorkflowResult> {
  const cached = await supportSummary.getCachedResult(input.conversationId);
  if (cached) {
    return cached;
  }

  const generation = await supportSummary.loadGenerationRequest(input);
  if (!generation) {
    return supportSummary.buildEmptyResult(input.conversationId);
  }

  const result = await supportSummary.requestSummary(generation.request);
  const generatedAt = new Date();

  await supportSummary.updateSummary({
    conversationId: input.conversationId,
    summary: result.summary,
    sourceEventId: generation.sourceEventId,
    generatedAt,
  });

  return {
    conversationId: input.conversationId,
    summary: result.summary,
    generatedAt: generatedAt.toISOString(),
    sourceEventId: generation.sourceEventId,
  };
}
