interface SlidingWindow {
  timestamps: number[];
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;

const buckets = new Map<string, SlidingWindow>();

/**
 * Per-workspace sliding-window rate limiter for session-replay read endpoints
 * (`list`, `getEvents`, `correlate`, `getSession`, `getForConversation`,
 * `getReplayChunks`). 120 requests per 60s per workspace — generous for normal
 * operator browsing (about 2/sec sustained, enough to click through ~40
 * conversations per minute when each open triggers 2-3 reads), tight enough
 * to stop a runaway client or accidental polling loop from chewing through
 * the replay storage path.
 *
 * Mirrors `ingest-rate-limit.ts`. Independent bucket — the ingest limit
 * (100/sec) covers the write path; this one covers reads. Keep both because
 * a workspace can legitimately push lots of writes while never reading,
 * and vice versa.
 */
export function consumeSessionReplayReadAttempt(workspaceId: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const existing = buckets.get(workspaceId);
  const window = existing ?? { timestamps: [] };

  window.timestamps = window.timestamps.filter((ts) => ts > cutoff);

  // Evict stale buckets so we don't accumulate one entry per workspace forever.
  if (existing && window.timestamps.length === 0) {
    buckets.delete(workspaceId);
  }

  if (window.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = window.timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));

    buckets.set(workspaceId, window);
    return { allowed: false, retryAfterSeconds };
  }

  window.timestamps.push(now);
  buckets.set(workspaceId, window);

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test-only helper to clear all buckets between tests. */
export function _resetSessionReplayReadRateLimitForTest(): void {
  buckets.clear();
}
