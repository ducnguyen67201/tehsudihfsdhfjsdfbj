import { prisma } from "@shared/database";
import { router, workspaceProcedure } from "@shared/rest/trpc";
import { SESSION_MATCH_CONFIDENCE } from "@shared/types";
import { z } from "zod";

export const sessionReplayRouter = router({
  getEvents: workspaceProcedure
    .input(
      z.object({
        sessionRecordId: z.string().min(1),
        limit: z.number().int().min(1).max(500).default(200),
      })
    )
    .query(async ({ ctx, input }) => {
      const events = await prisma.sessionEvent.findMany({
        where: {
          sessionRecordId: input.sessionRecordId,
          workspaceId: ctx.workspaceId,
        },
        orderBy: { timestamp: "asc" },
        take: input.limit,
      });

      // Find the last exception or network error as the failure point
      let failurePointId: string | null = null;
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event && (event.eventType === "EXCEPTION" || event.eventType === "NETWORK_ERROR")) {
          failurePointId = event.id;
          break;
        }
      }

      return { events, failurePointId };
    }),

  correlate: workspaceProcedure
    .input(
      z.object({
        conversationId: z.string().min(1).optional(),
        userEmail: z.string().email().optional(),
        userId: z.string().optional(),
        windowStartAt: z.string().datetime(),
        windowEndAt: z.string().datetime(),
      })
    )
    .query(async ({ ctx, input }) => {
      // If conversationId provided, extract emails from conversation events
      let resolvedEmail = input.userEmail;
      const resolvedUserId = input.userId;

      if (input.conversationId && !resolvedEmail && !resolvedUserId) {
        const events = await prisma.supportConversationEvent.findMany({
          where: { conversationId: input.conversationId, workspaceId: ctx.workspaceId },
          select: { summary: true, detailsJson: true },
          take: 50,
          orderBy: { createdAt: "desc" },
        });

        const { extractEmailsFromEvents } = await import(
          "./services/support/session-correlation-service"
        );
        const emails = extractEmailsFromEvents(events);
        if (emails.length > 0) {
          resolvedEmail = emails[0];
        }
      }

      if (!resolvedEmail && !resolvedUserId) {
        return { session: null, matchConfidence: SESSION_MATCH_CONFIDENCE.none };
      }

      const emailFilter = resolvedEmail ? { userEmail: resolvedEmail } : {};
      const userIdFilter = resolvedUserId ? { userId: resolvedUserId } : {};

      const session = await prisma.sessionRecord.findFirst({
        where: {
          workspaceId: ctx.workspaceId,
          ...emailFilter,
          ...userIdFilter,
          lastEventAt: {
            gte: new Date(input.windowStartAt),
            lte: new Date(input.windowEndAt),
          },
          deletedAt: null,
        },
        orderBy: { lastEventAt: "desc" },
      });

      if (!session) {
        return { session: null, matchConfidence: SESSION_MATCH_CONFIDENCE.none };
      }

      const matchConfidence =
        resolvedUserId && session.userId === resolvedUserId
          ? SESSION_MATCH_CONFIDENCE.confirmed
          : SESSION_MATCH_CONFIDENCE.fuzzy;

      return { session, matchConfidence };
    }),

  getSession: workspaceProcedure
    .input(z.object({ sessionRecordId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const session = await prisma.sessionRecord.findFirst({
        where: {
          id: input.sessionRecordId,
          workspaceId: ctx.workspaceId,
          deletedAt: null,
        },
      });

      return session;
    }),

  getReplayChunks: workspaceProcedure
    .input(z.object({ sessionRecordId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const chunks = await prisma.sessionReplayChunk.findMany({
        where: {
          sessionRecordId: input.sessionRecordId,
          workspaceId: ctx.workspaceId,
        },
        orderBy: { sequenceNumber: "asc" },
        select: {
          sequenceNumber: true,
          compressedData: true,
          startTimestamp: true,
          endTimestamp: true,
        },
      });

      // Base64-encode binary data for safe JSON transport via tRPC
      const encodedChunks = chunks.map((chunk) => ({
        sequenceNumber: chunk.sequenceNumber,
        compressedData: Buffer.from(chunk.compressedData).toString("base64"),
        startTimestamp: chunk.startTimestamp.toISOString(),
        endTimestamp: chunk.endTimestamp.toISOString(),
      }));

      return { chunks: encodedChunks, total: chunks.length };
    }),
});
