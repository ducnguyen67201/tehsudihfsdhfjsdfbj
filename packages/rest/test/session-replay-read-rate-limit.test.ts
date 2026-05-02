import { afterEach, describe, expect, it } from "vitest";
import {
  _resetSessionReplayReadRateLimitForTest,
  consumeSessionReplayReadAttempt,
} from "../src/security/session-replay-read-rate-limit";

afterEach(() => {
  _resetSessionReplayReadRateLimitForTest();
});

describe("consumeSessionReplayReadAttempt", () => {
  it("allows requests within the per-workspace budget", () => {
    const result = consumeSessionReplayReadAttempt(`ws_allow_${Date.now()}`);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("blocks the 121st request inside the same 60s window", () => {
    const workspaceId = `ws_block_${Date.now()}`;

    for (let i = 0; i < 120; i++) {
      expect(consumeSessionReplayReadAttempt(workspaceId).allowed).toBe(true);
    }

    const blocked = consumeSessionReplayReadAttempt(workspaceId);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("isolates buckets per workspace so one tenant cannot starve another", () => {
    const wsA = `ws_iso_a_${Date.now()}`;
    const wsB = `ws_iso_b_${Date.now()}`;

    for (let i = 0; i < 120; i++) {
      consumeSessionReplayReadAttempt(wsA);
    }

    expect(consumeSessionReplayReadAttempt(wsA).allowed).toBe(false);
    expect(consumeSessionReplayReadAttempt(wsB).allowed).toBe(true);
  });
});
