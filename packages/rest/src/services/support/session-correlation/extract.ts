// ---------------------------------------------------------------------------
// sessionCorrelation/extract — email extraction from conversation events
//
// Pure function: no DB, no side effects. Scans event summaries and JSON
// payload blobs for anything that looks like an email address. Used by the
// support flow to find candidate emails for session correlation.
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

interface ConversationEventSlice {
  summary: string | null;
  detailsJson: unknown;
}

/**
 * Scan conversation event summaries and detailsJson for email addresses.
 * Returns unique emails (lowercased) found across all events.
 */
export function extractEmails(events: ConversationEventSlice[]): string[] {
  const emails = new Set<string>();

  for (const event of events) {
    if (event.summary) {
      for (const match of event.summary.matchAll(EMAIL_REGEX)) {
        emails.add(match[0].toLowerCase());
      }
    }

    if (event.detailsJson && typeof event.detailsJson === "object") {
      const jsonStr = JSON.stringify(event.detailsJson);
      for (const match of jsonStr.matchAll(EMAIL_REGEX)) {
        emails.add(match[0].toLowerCase());
      }
    }
  }

  return [...emails];
}
