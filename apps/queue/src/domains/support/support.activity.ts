import { normalizeSlackMessageEvent } from "@/domains/support/adapters/slack/event-normalizer";
import { prisma, softUpsert } from "@shared/database";
import {
  GROUPING_DEFAULTS,
  GROUPING_ELIGIBLE_STATUSES,
  SUPPORT_CONVERSATION_EVENT_SOURCE,
  SUPPORT_CONVERSATION_STATUS,
  SUPPORT_INGRESS_PROCESSING_STATE,
  type SupportConversationEventSource,
  type SupportWorkflowInput,
  type SupportWorkflowResult,
  WORKFLOW_PROCESSING_STATUS,
} from "@shared/types";
import { ConflictError, ValidationError } from "@shared/types/errors";
import {
  SUPPORT_AUTHOR_ROLE_BUCKET,
  type SupportAuthorRoleBucket,
} from "@shared/types/support/support-adapter.schema";

// Ingress drops these at the boundary so they never hit the conversation
// upsert or the timeline. `bot` covers our own chat.postMessage echoes;
// `system` covers Slack noise subtypes (edits, joins, pinned_item, etc.).
const DROPPED_AUTHOR_ROLES = new Set<SupportAuthorRoleBucket>([
  SUPPORT_AUTHOR_ROLE_BUCKET.bot,
  SUPPORT_AUTHOR_ROLE_BUCKET.system,
]);

function mapAuthorRoleToEventSource(
  role: SupportAuthorRoleBucket
): SupportConversationEventSource {
  if (role === SUPPORT_AUTHOR_ROLE_BUCKET.internal) {
    return SUPPORT_CONVERSATION_EVENT_SOURCE.operator;
  }
  return SUPPORT_CONVERSATION_EVENT_SOURCE.customer;
}

function buildCanonicalConversationKey(
  installationId: string,
  teamId: string,
  channelId: string,
  threadTs: string
): string {
  return `${installationId}:${teamId}:${channelId}:${threadTs}`;
}

function computeUnreadStaleAt(baseTime: Date): Date {
  return new Date(baseTime.getTime() + 30 * 60 * 1000);
}

function summarizeMessage(text: string | null): string {
  if (!text) {
    return "Slack message received";
  }

  return text.length <= 140 ? text : `${text.slice(0, 137)}...`;
}

/**
 * Process one persisted ingress event into a deterministic conversation
 * projection update. The ingress event is already idempotent by this point.
 */
export async function runSupportPipeline(
  input: SupportWorkflowInput
): Promise<SupportWorkflowResult> {
  const ingressEvent = await prisma.supportIngressEvent.findUnique({
    where: {
      id: input.ingressEventId,
    },
    include: {
      installation: true,
    },
  });

  if (!ingressEvent) {
    throw new ValidationError(`Support ingress event ${input.ingressEventId} not found`);
  }

  if (ingressEvent.canonicalIdempotencyKey !== input.canonicalIdempotencyKey) {
    throw new ConflictError("Support ingress event idempotency key mismatch");
  }

  if (
    ingressEvent.processingState === SUPPORT_INGRESS_PROCESSING_STATE.processed &&
    ingressEvent.processedAt
  ) {
    const existingConversation = await prisma.supportConversation.findFirst({
      where: {
        workspaceId: input.workspaceId,
        installationId: input.installationId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
      },
    });

    return {
      ingressEventId: input.ingressEventId,
      conversationId: existingConversation?.id ?? null,
      status: WORKFLOW_PROCESSING_STATUS.processed,
      processedAt: ingressEvent.processedAt.toISOString(),
    };
  }

  const normalized = normalizeSlackMessageEvent(ingressEvent.rawPayloadJson);
  if (!normalized) {
    throw new ValidationError("Slack ingress payload could not be normalized");
  }

  // Slack Events API echoes our own chat.postMessage calls back as message
  // events (role=bot). It also emits noise like edits, deletes, and channel
  // membership churn (role=system via NOISE_SUBTYPES in the normalizer).
  // Neither should upsert the conversation or create a timeline entry —
  // operator replies are tracked via DELIVERY_* events, and Slack noise
  // carries no human signal.
  //
  // KNOWN LIMITATION: this is a blanket drop, not a targeted filter on our
  // installation's bot user ID. Other-integration bot messages that carry
  // file attachments (per design doc §3) are silently dropped too. To be
  // fixed when Pillar A (file mirroring) lands — see TODOS.md.
  if (DROPPED_AUTHOR_ROLES.has(normalized.authorRoleBucket)) {
    const droppedAt = new Date();
    console.log("[support] dropped ingress event", {
      ingressEventId: ingressEvent.id,
      authorRoleBucket: normalized.authorRoleBucket,
      slackUserId: normalized.slackUserId,
    });
    await prisma.supportIngressEvent.update({
      where: { id: ingressEvent.id },
      data: {
        processingState: SUPPORT_INGRESS_PROCESSING_STATE.processed,
        processedAt: droppedAt,
      },
    });
    return {
      ingressEventId: input.ingressEventId,
      conversationId: null,
      status: WORKFLOW_PROCESSING_STATUS.processed,
      processedAt: droppedAt.toISOString(),
    };
  }

  const now = new Date();

  // Standalone message grouping: check if this message should join an existing
  // conversation via a time-window anchor instead of creating a new one.
  const isStandalone = normalized.threadTs === normalized.messageTs;
  const isCustomer = normalized.authorRoleBucket === SUPPORT_AUTHOR_ROLE_BUCKET.customer;
  const hasAuthor = normalized.slackUserId !== null;
  const shouldGroupStandalone = isStandalone && isCustomer && hasAuthor;

  // Read grouping window config from installation metadata
  const installationMeta = ingressEvent.installation.metadata as Record<string, unknown> | null;
  const windowMinutes =
    (installationMeta?.groupingWindowMinutes as number) ?? GROUPING_DEFAULTS.windowMinutes;
  const maxWindowMinutes =
    (installationMeta?.maxGroupingWindowMinutes as number) ?? GROUPING_DEFAULTS.maxWindowMinutes;

  const conversation = await prisma.$transaction(async (tx) => {
    // Resolve the threadTs for the canonical key. For standalone messages from
    // customers, check for an active grouping anchor to reuse.
    let resolvedThreadTs = normalized.threadTs;

    if (shouldGroupStandalone) {
      const activeAnchor = await tx.supportGroupingAnchor.findFirst({
        where: {
          workspaceId: input.workspaceId,
          channelId: normalized.channelId,
          authorSlackUserId: normalized.slackUserId!,
          windowExpiresAt: { gt: now },
          conversation: {
            status: { in: [...GROUPING_ELIGIBLE_STATUSES] },
            deletedAt: null,
          },
        },
        orderBy: { windowExpiresAt: "desc" },
      });

      if (activeAnchor) {
        // Check max window cap: don't extend beyond maxWindowMinutes from start
        const maxExpiry = new Date(
          activeAnchor.windowStartAt.getTime() + maxWindowMinutes * 60 * 1000
        );
        if (now < maxExpiry) {
          resolvedThreadTs = activeAnchor.anchorMessageTs;

          // Extend the sliding window
          const newExpiry = new Date(now.getTime() + windowMinutes * 60 * 1000);
          await tx.supportGroupingAnchor.update({
            where: { id: activeAnchor.id },
            data: {
              windowExpiresAt:
                newExpiry > activeAnchor.windowExpiresAt ? newExpiry : activeAnchor.windowExpiresAt,
            },
          });
        }
      }
    }

    const canonicalConversationKey = buildCanonicalConversationKey(
      input.installationId,
      normalized.teamId,
      normalized.channelId,
      resolvedThreadTs
    );

    const conversationData = {
      teamId: normalized.teamId,
      channelId: normalized.channelId,
      threadTs: resolvedThreadTs,
      status: SUPPORT_CONVERSATION_STATUS.unread,
      lastCustomerMessageAt: now,
      customerWaitingSince: now,
      staleAt: computeUnreadStaleAt(now),
      lastActivityAt: now,
    };

    const upsertedConversation = await softUpsert(tx.supportConversation, {
      where: { workspaceId: input.workspaceId, canonicalConversationKey },
      create: {
        workspaceId: input.workspaceId,
        installationId: input.installationId,
        canonicalConversationKey,
        ...conversationData,
      },
      update: conversationData,
    });

    // Create a new grouping anchor if this is a standalone customer message
    // that didn't match an existing anchor (i.e., resolvedThreadTs === messageTs)
    if (shouldGroupStandalone && resolvedThreadTs === normalized.messageTs) {
      await tx.supportGroupingAnchor.create({
        data: {
          workspaceId: input.workspaceId,
          installationId: input.installationId,
          channelId: normalized.channelId,
          authorSlackUserId: normalized.slackUserId!,
          conversationId: upsertedConversation.id,
          anchorMessageTs: normalized.messageTs,
          windowStartAt: now,
          windowExpiresAt: new Date(now.getTime() + windowMinutes * 60 * 1000),
        },
      });
    }

    await tx.supportConversationEvent.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: upsertedConversation.id,
        eventType: "MESSAGE_RECEIVED",
        eventSource: mapAuthorRoleToEventSource(normalized.authorRoleBucket),
        summary: summarizeMessage(normalized.text),
        detailsJson: {
          canonicalIdempotencyKey: input.canonicalIdempotencyKey,
          threadTs: normalized.threadTs,
          messageTs: normalized.messageTs,
          channelId: normalized.channelId,
          teamId: normalized.teamId,
          authorRoleBucket: normalized.authorRoleBucket,
          rawText: normalized.text,
          slackUserId: normalized.slackUserId,
        },
      },
    });

    await tx.supportIngressEvent.update({
      where: {
        id: ingressEvent.id,
      },
      data: {
        processingState: SUPPORT_INGRESS_PROCESSING_STATE.processed,
        processedAt: now,
      },
    });

    return upsertedConversation;
  });

  return {
    ingressEventId: input.ingressEventId,
    conversationId: conversation.id,
    status: WORKFLOW_PROCESSING_STATUS.processed,
    processedAt: now.toISOString(),
  };
}
