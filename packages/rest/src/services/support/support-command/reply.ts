import { randomUUID } from "node:crypto";
import { prisma } from "@shared/database";
import * as slackDelivery from "@shared/rest/services/support/adapters/slack/slack-delivery-service";
import {
  PermanentExternalError,
  SUPPORT_CONVERSATION_EVENT_SOURCE,
  SUPPORT_CONVERSATION_STATUS,
  type SupportCommandResponse,
  type SupportRetryDeliveryCommand,
  type SupportSendReplyCommand,
  TransientExternalError,
  ValidationError,
} from "@shared/types";
import { TRPCError } from "@trpc/server";
import { buildCommandResponse } from "./_shared";

// ---------------------------------------------------------------------------
// supportCommand/reply — operator reply delivery + retry
//
// Both sendReply and retryDelivery share the sendReplyWithRecordedAttempt
// core, which persists the delivery attempt, calls the Slack adapter, and
// writes the success/failure timeline events atomically. Transient failures
// get scheduled for retry (up to 3 attempts, 5-minute backoff); permanent
// failures go straight to DEAD_LETTERED.
// ---------------------------------------------------------------------------

interface SupportReplyPayload {
  attachments: SupportSendReplyCommand["attachments"];
  messageText: string;
}

interface SupportDeliverySenderRequest {
  attachments: SupportSendReplyCommand["attachments"];
  installationId: string;
  installationMetadata: unknown;
  messageText: string;
  provider: "SLACK";
  thread: {
    channelId: string;
    teamId: string;
    threadTs: string;
  };
  workspaceId: string;
}

type SupportDeliverySender = (input: SupportDeliverySenderRequest) => Promise<{
  deliveredAt: string;
  providerMessageId: string;
}>;

function extractSlackMessageTs(detailsJson: unknown): string | null {
  if (typeof detailsJson !== "object" || detailsJson === null) {
    return null;
  }
  const record = detailsJson as Record<string, unknown>;
  const messageTs = record.messageTs;
  return typeof messageTs === "string" && messageTs.length > 0 ? messageTs : null;
}

function extractStoredThreadTs(detailsJson: unknown): string | null {
  if (typeof detailsJson !== "object" || detailsJson === null) {
    return null;
  }
  const record = detailsJson as Record<string, unknown>;
  const threadTs = record.threadTs;
  return typeof threadTs === "string" && threadTs.length > 0 ? threadTs : null;
}

/** @internal Exported for unit tests. Not part of the public service surface. */
export async function resolveDeliveryThreadTs(params: {
  conversationId: string;
  conversationRootThreadTs: string;
  replyToEventId: string | undefined;
}): Promise<string> {
  // Burst-sensitive thread resolution.
  //
  // Conceptually, a "burst" is the cluster of customer messages sent between
  // two operator replies (or before the first one). Each burst deserves its
  // own Slack thread so replies sit visually adjacent to what the customer
  // actually asked, instead of all piling into one runaway parent thread.
  //
  // Priority (first match wins):
  //   1. Explicit replyToEventId → UI "reply to this message" override.
  //      The operator is pointing at a specific event — thread off it.
  //   2. New burst since last reply → latest customer MESSAGE_RECEIVED
  //      created AFTER the last DELIVERY_ATTEMPTED. Starts a new thread
  //      on the newest message of this burst.
  //   3. No new customer messages → sticky to the last thread we used.
  //      Covers "operator sends two replies in a row with nothing from the
  //      customer in between" — don't fragment across self-replies.
  //   4. Legacy fallback → latest customer message or the conversation's
  //      grouping anchor. Only fires during the transition window for
  //      conversations whose last delivery predates threadTs stamping.
  //      In steady-state, rules 1-3 cover every reply.
  if (params.replyToEventId) {
    const targetEvent = await prisma.supportConversationEvent.findUnique({
      where: { id: params.replyToEventId },
      select: { detailsJson: true },
    });
    const messageTs = extractSlackMessageTs(targetEvent?.detailsJson);
    if (messageTs) return messageTs;
  }

  const [lastDelivery, latestCustomerMessage] = await Promise.all([
    prisma.supportConversationEvent.findFirst({
      where: {
        conversationId: params.conversationId,
        eventType: "DELIVERY_ATTEMPTED",
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, detailsJson: true },
    }),
    prisma.supportConversationEvent.findFirst({
      where: {
        conversationId: params.conversationId,
        eventType: "MESSAGE_RECEIVED",
        eventSource: SUPPORT_CONVERSATION_EVENT_SOURCE.customer,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, detailsJson: true },
    }),
  ]);

  const latestCustomerTs = extractSlackMessageTs(latestCustomerMessage?.detailsJson);

  // First reply in the conversation — whole history is one burst.
  if (!lastDelivery) {
    return latestCustomerTs ?? params.conversationRootThreadTs;
  }

  // New customer message arrived since our last reply → start a new thread
  // on it. This is the "each burst gets its own thread" rule.
  if (
    latestCustomerMessage &&
    latestCustomerMessage.createdAt > lastDelivery.createdAt &&
    latestCustomerTs
  ) {
    return latestCustomerTs;
  }

  // No new customer activity → stick to the last thread we used.
  const stickyThreadTs = extractStoredThreadTs(lastDelivery.detailsJson);
  if (stickyThreadTs) return stickyThreadTs;

  // Legacy fallback for pre-threadTs-stamping rows.
  return latestCustomerTs ?? params.conversationRootThreadTs;
}

async function loadConversationDeliveryContext(workspaceId: string, conversationId: string) {
  const conversation = await prisma.supportConversation.findFirst({
    where: {
      id: conversationId,
      workspaceId,
    },
    include: {
      installation: {
        select: {
          id: true,
          metadata: true,
          provider: true,
        },
      },
      deliveryAttempts: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          attemptNumber: true,
        },
      },
    },
  });

  if (!conversation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Support conversation not found",
    });
  }

  return conversation;
}

function normalizeReplyPayload(detailsJson: unknown): SupportReplyPayload | null {
  if (!detailsJson || typeof detailsJson !== "object") {
    return null;
  }

  const record = detailsJson as Record<string, unknown>;
  if (typeof record.messageText !== "string" || record.messageText.trim().length === 0) {
    return null;
  }

  const attachments = Array.isArray(record.attachments)
    ? record.attachments
        .filter(
          (value): value is SupportSendReplyCommand["attachments"][number] =>
            typeof value === "object" &&
            value !== null &&
            typeof (value as { url?: unknown }).url === "string"
        )
        .map((attachment) => ({
          mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : undefined,
          title: typeof attachment.title === "string" ? attachment.title : undefined,
          url: attachment.url,
        }))
    : [];

  return {
    messageText: record.messageText,
    attachments,
  };
}

async function loadReplyPayloadForCommand(
  workspaceId: string,
  conversationId: string,
  commandId: string
): Promise<SupportReplyPayload> {
  const events = await prisma.supportConversationEvent.findMany({
    where: {
      workspaceId,
      conversationId,
      eventType: "DELIVERY_ATTEMPTED",
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      detailsJson: true,
    },
  });

  for (const event of events) {
    if (!event.detailsJson || typeof event.detailsJson !== "object") {
      continue;
    }

    const details = event.detailsJson as Record<string, unknown>;
    if (details.commandId !== commandId) {
      continue;
    }

    const payload = normalizeReplyPayload(details);
    if (payload) {
      return payload;
    }
  }

  throw new ValidationError(`Reply payload not found for delivery command ${commandId}`);
}

async function sendReplyWithRecordedAttempt(
  params: {
    actorUserId: string;
    attemptNumber: number;
    commandId: string;
    conversationId: string;
    payload: SupportReplyPayload;
    replyToEventId?: string;
    workspaceId: string;
  },
  sender: SupportDeliverySender,
  existingDeliveryAttemptId?: string
): Promise<void> {
  const conversation = await loadConversationDeliveryContext(
    params.workspaceId,
    params.conversationId
  );

  if (conversation.installation.provider !== "SLACK") {
    throw new ValidationError("Only Slack support delivery is implemented");
  }

  // Resolve the Slack thread_ts BEFORE opening the delivery transaction so
  // the chosen thread can be stamped on the DELIVERY_ATTEMPTED event. Future
  // replies read that stamp to stay sticky — once we commit to a thread,
  // subsequent replies in the same conversation continue posting there.
  const resolvedThreadTs = await resolveDeliveryThreadTs({
    conversationId: params.conversationId,
    conversationRootThreadTs: conversation.threadTs,
    replyToEventId: params.replyToEventId,
  });

  const requestedAt = new Date();
  const initialAttempt = await prisma.$transaction(async (tx) => {
    const attempt = existingDeliveryAttemptId
      ? await tx.supportDeliveryAttempt.update({
          where: {
            id: existingDeliveryAttemptId,
          },
          data: {
            attemptNumber: params.attemptNumber,
            errorCode: null,
            errorMessage: null,
            nextRetryAt: null,
            state: "RETRYING",
          },
        })
      : await tx.supportDeliveryAttempt.create({
          data: {
            workspaceId: params.workspaceId,
            conversationId: params.conversationId,
            commandId: params.commandId,
            provider: "SLACK",
            attemptNumber: params.attemptNumber,
            state: "PENDING",
          },
        });

    await tx.supportConversationEvent.create({
      data: {
        workspaceId: params.workspaceId,
        conversationId: params.conversationId,
        eventType: "DELIVERY_ATTEMPTED",
        eventSource: SUPPORT_CONVERSATION_EVENT_SOURCE.operator,
        summary: "Reply send requested",
        detailsJson: {
          actorUserId: params.actorUserId,
          attachments: params.payload.attachments,
          commandId: params.commandId,
          deliveryAttemptId: attempt.id,
          messageText: params.payload.messageText,
          threadTs: resolvedThreadTs,
          ...(params.replyToEventId ? { replyToEventId: params.replyToEventId } : {}),
        },
      },
    });

    return attempt;
  });

  try {
    const delivery = await sender({
      provider: "SLACK",
      workspaceId: params.workspaceId,
      installationId: conversation.installation.id,
      installationMetadata: conversation.installation.metadata,
      thread: {
        teamId: conversation.teamId,
        channelId: conversation.channelId,
        threadTs: resolvedThreadTs,
      },
      messageText: params.payload.messageText,
      attachments: params.payload.attachments,
    });

    const deliveredAt = new Date(delivery.deliveredAt);
    await prisma.$transaction(async (tx) => {
      await tx.supportDeliveryAttempt.update({
        where: {
          id: initialAttempt.id,
        },
        data: {
          state: "SUCCEEDED",
          providerMessageId: delivery.providerMessageId,
          nextRetryAt: null,
        },
      });

      await tx.supportConversation.update({
        where: {
          id: params.conversationId,
        },
        data: {
          status:
            conversation.status === SUPPORT_CONVERSATION_STATUS.done
              ? SUPPORT_CONVERSATION_STATUS.done
              : SUPPORT_CONVERSATION_STATUS.inProgress,
          customerWaitingSince: null,
          staleAt: null,
          retryCount: 0,
          lastActivityAt: deliveredAt,
        },
      });

      await tx.supportConversationEvent.create({
        data: {
          workspaceId: params.workspaceId,
          conversationId: params.conversationId,
          eventType: "DELIVERY_SUCCEEDED",
          eventSource: SUPPORT_CONVERSATION_EVENT_SOURCE.operator,
          summary: "Reply delivered to Slack",
          detailsJson: {
            actorUserId: params.actorUserId,
            commandId: params.commandId,
            deliveredAt: delivery.deliveredAt,
            deliveryAttemptId: initialAttempt.id,
            providerMessageId: delivery.providerMessageId,
          },
        },
      });
    });
  } catch (error) {
    const isTransient = error instanceof TransientExternalError;
    const errorMessage = error instanceof Error ? error.message : "Support delivery failed";
    const retryCount = existingDeliveryAttemptId ? params.attemptNumber : 1;
    const nextRetryAt =
      isTransient && retryCount < 3 ? new Date(requestedAt.getTime() + 5 * 60 * 1000) : null;

    await prisma.$transaction(async (tx) => {
      await tx.supportDeliveryAttempt.update({
        where: {
          id: initialAttempt.id,
        },
        data: {
          state:
            nextRetryAt || error instanceof PermanentExternalError ? "FAILED" : "DEAD_LETTERED",
          errorCode: error instanceof Error ? error.name : "UnknownError",
          errorMessage,
          nextRetryAt,
        },
      });

      await tx.supportConversation.update({
        where: {
          id: params.conversationId,
        },
        data: {
          retryCount,
          lastActivityAt: new Date(),
        },
      });

      await tx.supportConversationEvent.create({
        data: {
          workspaceId: params.workspaceId,
          conversationId: params.conversationId,
          eventType: "DELIVERY_FAILED",
          eventSource: SUPPORT_CONVERSATION_EVENT_SOURCE.system,
          summary: "Reply delivery failed",
          detailsJson: {
            commandId: params.commandId,
            deliveryAttemptId: initialAttempt.id,
            errorMessage,
            retryable: Boolean(nextRetryAt),
            nextRetryAt: nextRetryAt?.toISOString() ?? null,
          },
        },
      });
    });

    throw new TRPCError({
      code: isTransient ? "TOO_MANY_REQUESTS" : "BAD_REQUEST",
      message: errorMessage,
    });
  }
}

/**
 * Send an operator reply into Slack, persisting delivery evidence for done-policy enforcement.
 */
export async function sendReply(
  input: SupportSendReplyCommand,
  sender: SupportDeliverySender = slackDelivery.sendThreadReply
): Promise<SupportCommandResponse> {
  const commandId = randomUUID();
  const conversation = await loadConversationDeliveryContext(
    input.workspaceId,
    input.conversationId
  );
  const nextAttemptNumber = (conversation.deliveryAttempts[0]?.attemptNumber ?? 0) + 1;

  await sendReplyWithRecordedAttempt(
    {
      actorUserId: input.actorUserId,
      attemptNumber: nextAttemptNumber,
      commandId,
      conversationId: input.conversationId,
      payload: {
        messageText: input.messageText,
        attachments: input.attachments,
      },
      replyToEventId: input.replyToEventId,
      workspaceId: input.workspaceId,
    },
    sender
  );

  return buildCommandResponse(commandId);
}

/**
 * Re-open a failed delivery attempt so an operator can trigger a retry path.
 */
export async function retryDelivery(
  input: SupportRetryDeliveryCommand,
  sender: SupportDeliverySender = slackDelivery.sendThreadReply
): Promise<SupportCommandResponse> {
  const operatorCommandId = randomUUID();
  const attempt = await prisma.supportDeliveryAttempt.findFirst({
    where: {
      id: input.deliveryAttemptId,
      workspaceId: input.workspaceId,
    },
    select: {
      id: true,
      conversationId: true,
      attemptNumber: true,
      commandId: true,
    },
  });

  if (!attempt) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Support delivery attempt not found",
    });
  }

  const payload = await loadReplyPayloadForCommand(
    input.workspaceId,
    attempt.conversationId,
    attempt.commandId
  );

  await prisma.supportConversationEvent.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: attempt.conversationId,
      eventType: "NOTE",
      eventSource: SUPPORT_CONVERSATION_EVENT_SOURCE.operator,
      summary: "Delivery retry requested",
      detailsJson: {
        actorUserId: input.actorUserId,
        deliveryAttemptId: attempt.id,
        operatorCommandId,
      },
    },
  });

  await sendReplyWithRecordedAttempt(
    {
      actorUserId: input.actorUserId,
      attemptNumber: attempt.attemptNumber + 1,
      commandId: attempt.commandId,
      conversationId: attempt.conversationId,
      payload,
      workspaceId: input.workspaceId,
    },
    sender,
    attempt.id
  );

  return buildCommandResponse(operatorCommandId);
}
