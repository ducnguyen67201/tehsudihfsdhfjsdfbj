import type * as summaryActivities from "@/domains/support/support-summary.activity";
import type { SupportSummaryWorkflowInput, SupportSummaryWorkflowResult } from "@shared/types";
import { proxyActivities } from "@temporalio/workflow";

// One activity, one LLM round-trip. Timeout is generous to absorb OpenAI
// tail latency; retry once on transient failure and surrender if the second
// attempt fails — a stale card is better than a retry storm against the
// agent service.
const summaryActivitiesProxy = proxyActivities<typeof summaryActivities>({
  startToCloseTimeout: "90 seconds",
  retry: { maximumAttempts: 2 },
});

/**
 * Thread summarization workflow.
 *
 * Generates a short one-liner describing what the conversation is about,
 * caches it on `SupportConversation.threadSummary`. Surfaced on inbox cards
 * in place of the raw last-message preview.
 *
 * Deterministic workflow ID (`support-summary::{conversationId}`) — the
 * ingress path fires this eagerly per MESSAGE_RECEIVED+CUSTOMER event and
 * relies on Temporal's workflow-ID uniqueness to dedupe bursts.
 */
export async function supportSummaryWorkflow(
  input: SupportSummaryWorkflowInput
): Promise<SupportSummaryWorkflowResult> {
  return summaryActivitiesProxy.generateConversationSummary(input);
}
