import { type Prisma, prisma } from "@shared/database";
import { consumeIngestAttempt } from "@shared/rest/security/ingest-rate-limit";
import type { RouteContext } from "@shared/rest/security/rest-auth";
import { withWorkspaceApiKeyAuth } from "@shared/rest/security/rest-auth";
import { sessionIngestPayloadSchema } from "@shared/types";
import { NextResponse } from "next/server";
import { jsonWithCors, sessionCorsHeaders, withCorsHeaders } from "./cors";

const MAX_BODY_BYTES = 1_048_576; // 1 MB
const MAX_EVENTS_PER_SESSION = 10_000;

export async function handleSessionIngestOptions(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: sessionCorsHeaders() });
}

const innerHandler = withWorkspaceApiKeyAuth(async (request, ctx) => {
  // Check workspace feature gate
  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { sessionCaptureEnabled: true },
  });
  if (!workspace?.sessionCaptureEnabled) {
    return jsonWithCors(
      {
        error: { message: "Session capture is not enabled for this workspace", code: "FORBIDDEN" },
      },
      403
    );
  }

  // Rate limit by workspace
  const rateResult = consumeIngestAttempt(ctx.workspaceId);
  if (!rateResult.allowed) {
    return jsonWithCors({ error: { message: "Rate limit exceeded", code: "RATE_LIMITED" } }, 429, {
      extraHeaders: { "Retry-After": String(rateResult.retryAfterSeconds) },
    });
  }

  // Guard against oversized payloads
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return jsonWithCors(
      { error: { message: "Payload too large", code: "PAYLOAD_TOO_LARGE" } },
      413
    );
  }

  // Parse raw body (also checks actual size)
  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return jsonWithCors(
      { error: { message: "Failed to read request body", code: "BAD_REQUEST" } },
      400
    );
  }

  if (rawText.length > MAX_BODY_BYTES) {
    return jsonWithCors(
      { error: { message: "Payload too large", code: "PAYLOAD_TOO_LARGE" } },
      413
    );
  }

  // Validate payload
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return jsonWithCors({ error: { message: "Invalid JSON", code: "BAD_REQUEST" } }, 400);
  }

  const validation = sessionIngestPayloadSchema.safeParse(parsed);
  if (!validation.success) {
    return jsonWithCors(
      {
        error: {
          message: "Invalid payload",
          code: "VALIDATION_ERROR",
          issues: validation.error.issues,
        },
      },
      400
    );
  }

  const payload = validation.data;
  const workspaceId = ctx.workspaceId;

  // Return 202 immediately, write asynchronously
  const response = jsonWithCors({ accepted: true }, 202);

  void (async () => {
    try {
      // Use actual event timestamps instead of flush time for accuracy
      const eventTimestamps = payload.structuredEvents.map((e) => e.timestamp);
      const earliestEventTime = eventTimestamps.length > 0
        ? new Date(Math.min(...eventTimestamps))
        : new Date(payload.timestamp);
      const latestEventTime = eventTimestamps.length > 0
        ? new Date(Math.max(...eventTimestamps))
        : new Date(payload.timestamp);
      const hasRrweb = payload.rrwebEvents !== undefined;

      await prisma.$transaction(async (tx) => {
        // Upsert the session record
        const sessionRecord = await tx.sessionRecord.upsert({
          where: {
            workspaceId_sessionId: { workspaceId, sessionId: payload.sessionId },
          },
          create: {
            workspaceId,
            sessionId: payload.sessionId,
            userId: payload.userId ?? null,
            userEmail: payload.userEmail ?? null,
            startedAt: earliestEventTime,
            lastEventAt: latestEventTime,
            eventCount: payload.structuredEvents.length,
            hasReplayData: hasRrweb,
          },
          update: {
            lastEventAt: latestEventTime,
            eventCount: { increment: payload.structuredEvents.length },
            ...(hasRrweb ? { hasReplayData: true } : {}),
            ...(payload.userId ? { userId: payload.userId } : {}),
            ...(payload.userEmail ? { userEmail: payload.userEmail } : {}),
          },
        });

        // Enforce per-session event cap to prevent unbounded growth
        if (sessionRecord.eventCount >= MAX_EVENTS_PER_SESSION) {
          return;
        }

        // Batch insert structured events
        if (payload.structuredEvents.length > 0) {
          await tx.sessionEvent.createMany({
            data: payload.structuredEvents.map((event) => ({
              workspaceId,
              sessionRecordId: sessionRecord.id,
              eventType: event.eventType,
              timestamp: new Date(event.timestamp),
              url: "url" in event ? (event.url ?? null) : null,
              payload: event.payload as Prisma.InputJsonValue,
            })),
          });
        }

        // Insert replay chunk with unique constraint protection
        if (hasRrweb) {
          const rrwebString =
            typeof payload.rrwebEvents === "string"
              ? payload.rrwebEvents
              : JSON.stringify(payload.rrwebEvents);

          const lastChunk = await tx.sessionReplayChunk.findFirst({
            where: { sessionRecordId: sessionRecord.id },
            orderBy: { sequenceNumber: "desc" },
            select: { sequenceNumber: true },
          });

          await tx.sessionReplayChunk.create({
            data: {
              workspaceId,
              sessionRecordId: sessionRecord.id,
              sequenceNumber: (lastChunk?.sequenceNumber ?? -1) + 1,
              compressedData: Buffer.from(rrwebString, "utf-8"),
              eventCount: Array.isArray(payload.rrwebEvents) ? payload.rrwebEvents.length : 0,
              startTimestamp: earliestEventTime,
              endTimestamp: latestEventTime,
            },
          });
        }
      });
    } catch (error) {
      console.error("[session-ingest] Async write failed", {
        workspaceId,
        sessionId: payload.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return response;
});

/** POST handler — wraps auth handler to ensure CORS on every response (including 401). */
export async function handleSessionIngest(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const response = await innerHandler(req, ctx);
  return withCorsHeaders(response);
}
