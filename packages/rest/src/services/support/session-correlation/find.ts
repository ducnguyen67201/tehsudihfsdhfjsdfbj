import { prisma } from "@shared/database";
import type { SessionEventRow, SessionRecordRow } from "./digest";

// ---------------------------------------------------------------------------
// sessionCorrelation/find — DB correlation query
//
// Looks up the most recent SessionRecord whose userEmail matches any of the
// input emails within a time window. Used by the support analysis flow
// after extracting candidate emails from the conversation events.
// ---------------------------------------------------------------------------

interface FindByEmailsInput {
  workspaceId: string;
  emails: string[];
  windowMinutes?: number;
}

/**
 * Find the most recent session matching any of the given emails
 * within the time window. Returns the session record and its events,
 * or null if no match found.
 */
export async function findByEmails(input: FindByEmailsInput): Promise<{
  record: SessionRecordRow;
  events: SessionEventRow[];
} | null> {
  const windowMs = (input.windowMinutes ?? 30) * 60 * 1000;

  const matchingSession = await prisma.sessionRecord.findFirst({
    where: {
      workspaceId: input.workspaceId,
      userEmail: { in: input.emails },
      lastEventAt: { gte: new Date(Date.now() - windowMs) },
      deletedAt: null,
    },
    orderBy: { lastEventAt: "desc" },
  });

  if (!matchingSession) {
    return null;
  }

  const events = await prisma.sessionEvent.findMany({
    where: { sessionRecordId: matchingSession.id },
    orderBy: { timestamp: "asc" },
    take: 200,
  });

  return {
    record: matchingSession,
    events,
  };
}
