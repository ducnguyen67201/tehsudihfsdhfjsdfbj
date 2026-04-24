import { prisma } from "@shared/database";
import { env } from "@shared/env";
import {
  type SupportSummaryRequest,
  type SupportSummaryResponse,
  type SupportSummaryWorkflowInput,
  type SupportSummaryWorkflowResult,
  THREAD_SUMMARY_MAX_CHARS,
  supportSummaryResponseSchema,
  supportSummaryWorkflowResultSchema,
} from "@shared/types";

// ---------------------------------------------------------------------------
// supportSummary service
//
// Owns thread-summary reads/writes plus the best-effort call to the agents
// service. Queue activities stay orchestration-only and call into this
// module for Prisma/network work.
//
//   import * as supportSummary from "@shared/rest/services/support/support-summary-service";
//   const cached = await supportSummary.getCachedResult(conversationId);
//   const job = await supportSummary.loadGenerationRequest(input);
//   const result = await supportSummary.requestSummary(job.request);
//   await supportSummary.updateSummary({ conversationId, summary, sourceEventId, generatedAt });
//
// See docs/conventions/service-layer-conventions.md.
// ---------------------------------------------------------------------------

const MAX_CUSTOMER_MESSAGES = 20;
const MAX_MESSAGES_IN_PROMPT = 12;
const AGENT_TIMEOUT_MS = 60_000;

type CustomerEvent = {
  id: string;
  summary: string | null;
  detailsJson: unknown;
  createdAt: Date;
};

function emptyResult(conversationId: string): SupportSummaryWorkflowResult {
  return supportSummaryWorkflowResultSchema.parse({
    conversationId,
    summary: null,
    generatedAt: null,
    sourceEventId: null,
  });
}

export async function getCachedResult(
  conversationId: string
): Promise<SupportSummaryWorkflowResult | null> {
  const existing = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    select: {
      threadSummary: true,
      threadSummaryGeneratedAt: true,
      threadSummarySourceEventId: true,
    },
  });

  if (!existing?.threadSummary) {
    return null;
  }

  return supportSummaryWorkflowResultSchema.parse({
    conversationId,
    summary: existing.threadSummary,
    generatedAt: existing.threadSummaryGeneratedAt?.toISOString() ?? null,
    sourceEventId: existing.threadSummarySourceEventId,
  });
}

export async function loadGenerationRequest(
  input: Pick<SupportSummaryWorkflowInput, "workspaceId" | "conversationId">
): Promise<{ request: SupportSummaryRequest; sourceEventId: string } | null> {
  const conversation = await prisma.supportConversation.findFirstOrThrow({
    where: {
      id: input.conversationId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      workspaceId: true,
      events: {
        where: {
          eventType: "MESSAGE_RECEIVED",
          eventSource: "CUSTOMER",
        },
        orderBy: { createdAt: "desc" },
        take: MAX_CUSTOMER_MESSAGES,
        select: {
          id: true,
          summary: true,
          detailsJson: true,
          createdAt: true,
        },
      },
    },
  });

  const events = conversation.events.reverse();
  const latestEvent = events[events.length - 1];
  if (!latestEvent) {
    return null;
  }

  const messages = events
    .map((event) => ({
      id: event.id,
      text: extractText(event) ?? event.summary ?? "",
      at: event.createdAt.toISOString(),
    }))
    .filter((message) => message.text.length > 0)
    .slice(-MAX_MESSAGES_IN_PROMPT);

  if (messages.length === 0) {
    return null;
  }

  return {
    request: {
      conversationId: conversation.id,
      messages,
    },
    sourceEventId: latestEvent.id,
  };
}

export async function requestSummary(
  request: SupportSummaryRequest
): Promise<SupportSummaryResponse> {
  const agentUrl = env.AGENT_SERVICE_URL ?? "http://localhost:3100";
  const response = await fetch(`${agentUrl}/support-summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Agent service returned ${response.status}: ${errorBody}`);
  }

  return supportSummaryResponseSchema.parse(await response.json());
}

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

export function buildEmptyResult(conversationId: string): SupportSummaryWorkflowResult {
  return emptyResult(conversationId);
}

function extractText(event: CustomerEvent): string | null {
  if (!event.detailsJson || typeof event.detailsJson !== "object") {
    return null;
  }

  const raw = (event.detailsJson as Record<string, unknown>).rawText;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}
