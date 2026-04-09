import {
  compressedSessionDigestSchema,
  reconstructSessionDigest,
  POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS,
  SESSION_ERROR_TYPE_CODES,
  SESSION_ACTION_TYPE_CODES,
  type CompressedSessionDigest,
} from "@shared/types/positional-format/session-digest";
import { describe, expect, it } from "vitest";

// ── Fixtures ───────────────────────────────────────────────────────

const VALID_COMPRESSED: CompressedSessionDigest = {
  s: "sess_abc123",
  u: "user_42",
  d: "3m 42s",
  p: 4,
  r: ["/", "/settings", "/settings/billing", "/settings/billing/upgrade"],
  l: [
    "12:00:01|1|/settings",
    "12:00:05|0|Clicked billing tab",
    "12:00:08|1|/settings/billing",
    "12:00:12|0|Clicked upgrade button",
    "12:00:13|2|POST /api/checkout failed 500",
  ],
  e: ["12:00:13|1|POST /api/checkout 500|1"],
  f: {
    t: "12:00:13",
    y: 1,
    d: "Checkout API returned 500 after clicking upgrade",
    p: [
      "12:00:01|1|/settings",
      "12:00:05|0|Clicked billing tab",
      "12:00:08|1|/settings/billing",
      "12:00:12|0|Clicked upgrade button",
      "12:00:13|2|POST /api/checkout failed 500",
    ],
  },
  n: ["POST /api/checkout|500|1200|12:00:13"],
  c: ["ERROR|Uncaught TypeError|12:00:13|2"],
  v: {
    u: "https://app.example.com/settings/billing/upgrade",
    a: "Mozilla/5.0 Chrome/120",
    w: "1920x1080",
    r: "v2.3.1",
  },
};

const MINIMAL_COMPRESSED: CompressedSessionDigest = {
  s: "sess_xyz789",
  u: null,
  d: "1m 15s",
  p: 2,
  r: ["/", "/docs"],
  l: ["12:00:01|1|/", "12:00:10|0|Clicked docs link", "12:00:11|1|/docs"],
  e: [],
  f: null,
  n: [],
  c: [],
  v: {
    u: "https://app.example.com/docs",
    a: "Mozilla/5.0 Safari/17",
    w: "1440x900",
    r: null,
  },
};

// ── Code mapping constants ─────────────────────────────────────────

describe("code mapping constants", () => {
  it("SESSION_ACTION_TYPE_CODES has 5 entries in expected order", () => {
    expect(SESSION_ACTION_TYPE_CODES).toEqual([
      "CLICK",
      "ROUTE",
      "NETWORK_ERROR",
      "CONSOLE_ERROR",
      "EXCEPTION",
    ]);
  });

  it("SESSION_ERROR_TYPE_CODES has 3 entries in expected order", () => {
    expect(SESSION_ERROR_TYPE_CODES).toEqual(["EXCEPTION", "NETWORK_ERROR", "CONSOLE_ERROR"]);
  });
});

// ── Schema validation ──────────────────────────────────────────────

describe("compressedSessionDigestSchema", () => {
  it("validates a full compressed digest with failure point", () => {
    const result = compressedSessionDigestSchema.parse(VALID_COMPRESSED);
    expect(result.s).toBe("sess_abc123");
    expect(result.p).toBe(4);
    expect(result.f).not.toBeNull();
    expect(result.f?.y).toBe(1);
  });

  it("validates a minimal digest without failure point", () => {
    const result = compressedSessionDigestSchema.parse(MINIMAL_COMPRESSED);
    expect(result.u).toBeNull();
    expect(result.f).toBeNull();
    expect(result.v.r).toBeNull();
  });

  it("accepts empty arrays for all list fields", () => {
    const empty: CompressedSessionDigest = {
      s: "sess_empty",
      u: null,
      d: "0s",
      p: 0,
      r: [],
      l: [],
      e: [],
      f: null,
      n: [],
      c: [],
      v: { u: "http://localhost", a: "test", w: "800x600", r: null },
    };
    const result = compressedSessionDigestSchema.parse(empty);
    expect(result.r).toEqual([]);
    expect(result.l).toEqual([]);
    expect(result.e).toEqual([]);
    expect(result.n).toEqual([]);
    expect(result.c).toEqual([]);
  });

  it("rejects missing required field s (sessionId)", () => {
    const { s: _, ...missing } = VALID_COMPRESSED;
    expect(() => compressedSessionDigestSchema.parse(missing)).toThrow();
  });

  it("rejects missing required field v (environment)", () => {
    const { v: _, ...missing } = VALID_COMPRESSED;
    expect(() => compressedSessionDigestSchema.parse(missing)).toThrow();
  });

  it("rejects missing required field d (duration)", () => {
    const { d: _, ...missing } = VALID_COMPRESSED;
    expect(() => compressedSessionDigestSchema.parse(missing)).toThrow();
  });

  it("rejects non-integer page count", () => {
    expect(() =>
      compressedSessionDigestSchema.parse({ ...VALID_COMPRESSED, p: 2.5 })
    ).toThrow();
  });

  it("rejects non-string sessionId", () => {
    expect(() =>
      compressedSessionDigestSchema.parse({ ...VALID_COMPRESSED, s: 123 })
    ).toThrow();
  });

  it("rejects non-array routes", () => {
    expect(() =>
      compressedSessionDigestSchema.parse({ ...VALID_COMPRESSED, r: "not-an-array" })
    ).toThrow();
  });

  it("rejects failure point with y outside 0..2", () => {
    expect(() =>
      compressedSessionDigestSchema.parse({
        ...VALID_COMPRESSED,
        f: { t: "12:00:00", y: 5, d: "bad", p: [] },
      })
    ).toThrow();
  });

  it("rejects failure point with negative y", () => {
    expect(() =>
      compressedSessionDigestSchema.parse({
        ...VALID_COMPRESSED,
        f: { t: "12:00:00", y: -1, d: "bad", p: [] },
      })
    ).toThrow();
  });

  it("rejects environment with missing fields", () => {
    expect(() =>
      compressedSessionDigestSchema.parse({
        ...VALID_COMPRESSED,
        v: { u: "http://localhost" },
      })
    ).toThrow();
  });
});

// ── Reconstruction ─────────────────────────────────────────────────

describe("reconstructSessionDigest", () => {
  it("maps top-level scalar fields correctly", () => {
    const result = reconstructSessionDigest(VALID_COMPRESSED);
    expect(result.sessionId).toBe("sess_abc123");
    expect(result.userId).toBe("user_42");
    expect(result.duration).toBe("3m 42s");
    expect(result.pageCount).toBe(4);
  });

  it("preserves routeHistory as-is", () => {
    const result = reconstructSessionDigest(VALID_COMPRESSED);
    expect(result.routeHistory).toEqual([
      "/",
      "/settings",
      "/settings/billing",
      "/settings/billing/upgrade",
    ]);
  });

  it("handles null userId", () => {
    const result = reconstructSessionDigest(MINIMAL_COMPRESSED);
    expect(result.userId).toBeNull();
  });

  // ── Action parsing ────────────────────────────────────────────

  it("parses actions with correct type resolution", () => {
    const result = reconstructSessionDigest(VALID_COMPRESSED);
    const actions = result.lastActions;

    expect(actions[0]).toEqual({
      timestamp: "12:00:01",
      type: "ROUTE",
      description: "/settings",
    });
    expect(actions[1]).toEqual({
      timestamp: "12:00:05",
      type: "CLICK",
      description: "Clicked billing tab",
    });
    expect(actions[4]).toEqual({
      timestamp: "12:00:13",
      type: "NETWORK_ERROR",
      description: "POST /api/checkout failed 500",
    });
  });

  it("falls back to CLICK for out-of-range action type codes", () => {
    const compressed: CompressedSessionDigest = {
      ...MINIMAL_COMPRESSED,
      l: ["12:00:00|99|Unknown action type"],
    };
    const result = reconstructSessionDigest(compressed);
    expect(result.lastActions[0]?.type).toBe("CLICK");
  });

  it("handles action strings with pipe characters in description", () => {
    const compressed: CompressedSessionDigest = {
      ...MINIMAL_COMPRESSED,
      l: ["12:00:00|0|Clicked button | with pipe | in description"],
    };
    const result = reconstructSessionDigest(compressed);
    expect(result.lastActions[0]?.description).toBe(
      "Clicked button | with pipe | in description"
    );
  });

  it("handles action with missing fields gracefully", () => {
    const compressed: CompressedSessionDigest = {
      ...MINIMAL_COMPRESSED,
      l: [""],
    };
    const result = reconstructSessionDigest(compressed);
    expect(result.lastActions[0]).toEqual({
      timestamp: "",
      type: "CLICK",
      description: "",
    });
  });

  // ── Error parsing ─────────────────────────────────────────────

  it("parses errors with correct type resolution and count", () => {
    const result = reconstructSessionDigest(VALID_COMPRESSED);
    expect(result.errors[0]).toEqual({
      timestamp: "12:00:13",
      type: "NETWORK_ERROR",
      message: "POST /api/checkout 500",
      stack: null,
      count: 1,
    });
  });

  it("falls back to EXCEPTION for out-of-range error type codes", () => {
    const compressed: CompressedSessionDigest = {
      ...MINIMAL_COMPRESSED,
      e: ["12:00:00|50|Some error|3"],
    };
    const result = reconstructSessionDigest(compressed);
    expect(result.errors[0]?.type).toBe("EXCEPTION");
    expect(result.errors[0]?.count).toBe(3);
  });

  it("defaults error count to 1 when missing", () => {
    const compressed: CompressedSessionDigest = {
      ...MINIMAL_COMPRESSED,
      e: ["12:00:00|0|Some error"],
    };
    const result = reconstructSessionDigest(compressed);
    expect(result.errors[0]?.count).toBe(1);
  });

  it("always sets stack to null", () => {
    const result = reconstructSessionDigest(VALID_COMPRESSED);
    for (const error of result.errors) {
      expect(error.stack).toBeNull();
    }
  });

  // ── Network failure parsing ───────────────────────────────────

  it("parses network failures correctly", () => {
    const result = reconstructSessionDigest(VALID_COMPRESSED);
    expect(result.networkFailures[0]).toEqual({
      method: "POST",
      url: "/api/checkout",
      status: 500,
      durationMs: 1200,
      timestamp: "12:00:13",
    });
  });

  it("handles network failure with URL containing spaces", () => {
    const compressed: CompressedSessionDigest = {
      ...MINIMAL_COMPRESSED,
      n: ["GET /api/search query term|404|50|12:00:00"],
    };
    const result = reconstructSessionDigest(compressed);
    expect(result.networkFailures[0]?.method).toBe("GET");
    expect(result.networkFailures[0]?.url).toBe("/api/search query term");
  });

  it("handles empty method+url segment gracefully", () => {
    const compressed: CompressedSessionDigest = {
      ...MINIMAL_COMPRESSED,
      n: ["|0|0|"],
    };
    const result = reconstructSessionDigest(compressed);
    expect(result.networkFailures[0]?.method).toBe("");
    expect(result.networkFailures[0]?.url).toBe("");
    expect(result.networkFailures[0]?.status).toBe(0);
    expect(result.networkFailures[0]?.durationMs).toBe(0);
    expect(result.networkFailures[0]?.timestamp).toBe("");
  });

  // ── Console entry parsing ─────────────────────────────────────

  it("parses console entries correctly", () => {
    const result = reconstructSessionDigest(VALID_COMPRESSED);
    expect(result.consoleErrors[0]).toEqual({
      level: "ERROR",
      message: "Uncaught TypeError",
      timestamp: "12:00:13",
      count: 2,
    });
  });

  it("defaults console entry count to 1 when missing", () => {
    const compressed: CompressedSessionDigest = {
      ...MINIMAL_COMPRESSED,
      c: ["WARN|Something suspicious|12:00:00"],
    };
    const result = reconstructSessionDigest(compressed);
    expect(result.consoleErrors[0]?.count).toBe(1);
  });

  it("defaults console level to ERROR when empty", () => {
    const compressed: CompressedSessionDigest = {
      ...MINIMAL_COMPRESSED,
      c: [""],
    };
    const result = reconstructSessionDigest(compressed);
    expect(result.consoleErrors[0]?.level).toBe("");
  });

  // ── Failure point ─────────────────────────────────────────────

  it("reconstructs failure point with preceding actions", () => {
    const result = reconstructSessionDigest(VALID_COMPRESSED);
    expect(result.failurePoint).not.toBeNull();
    expect(result.failurePoint?.timestamp).toBe("12:00:13");
    expect(result.failurePoint?.type).toBe("NETWORK_ERROR");
    expect(result.failurePoint?.description).toBe(
      "Checkout API returned 500 after clicking upgrade"
    );
    expect(result.failurePoint?.precedingActions).toHaveLength(5);
    expect(result.failurePoint?.precedingActions[0]?.type).toBe("ROUTE");
  });

  it("returns null failure point when f is null", () => {
    const result = reconstructSessionDigest(MINIMAL_COMPRESSED);
    expect(result.failurePoint).toBeNull();
  });

  it("falls back failure point type to EXCEPTION for out-of-range y", () => {
    const compressed: CompressedSessionDigest = {
      ...MINIMAL_COMPRESSED,
      f: { t: "12:00:00", y: 0, d: "Exception happened", p: [] },
    };
    const result = reconstructSessionDigest(compressed);
    expect(result.failurePoint?.type).toBe("EXCEPTION");
  });

  // ── Environment ───────────────────────────────────────────────

  it("reconstructs environment fields", () => {
    const result = reconstructSessionDigest(VALID_COMPRESSED);
    expect(result.environment).toEqual({
      url: "https://app.example.com/settings/billing/upgrade",
      userAgent: "Mozilla/5.0 Chrome/120",
      viewport: "1920x1080",
      release: "v2.3.1",
    });
  });

  it("preserves null release in environment", () => {
    const result = reconstructSessionDigest(MINIMAL_COMPRESSED);
    expect(result.environment.release).toBeNull();
  });
});

// ── Prompt instructions ────────────────────────────────────────────

describe("POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS", () => {
  it("is a non-empty string", () => {
    expect(typeof POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS).toBe("string");
    expect(POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS.length).toBeGreaterThan(0);
  });

  it("contains field reference documentation", () => {
    expect(POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS).toContain("s = sessionId");
    expect(POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS).toContain("u = userId");
    expect(POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS).toContain("v = environment");
  });

  it("contains at least two examples (per positional format spec)", () => {
    const exampleCount = (
      POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS.match(/Example/g) ?? []
    ).length;
    expect(exampleCount).toBeGreaterThanOrEqual(2);
  });

  it("documents action type codes", () => {
    expect(POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS).toContain("0=CLICK");
    expect(POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS).toContain("4=EXCEPTION");
  });

  it("documents error type codes", () => {
    expect(POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS).toContain("0=EXCEPTION");
    expect(POSITIONAL_SESSION_DIGEST_FORMAT_INSTRUCTIONS).toContain("2=CONSOLE_ERROR");
  });
});
