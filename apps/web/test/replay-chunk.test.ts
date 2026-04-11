import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock prisma ────────────────────────────────────────────────────
const mockSessionRecordFindUnique = vi.fn();
const mockChunkFindFirst = vi.fn();
const mockKeyFindUnique = vi.fn();
const mockKeyUpdate = vi.fn().mockResolvedValue({});

vi.mock("@shared/database", () => ({
  prisma: {
    sessionRecord: { findUnique: (...args: unknown[]) => mockSessionRecordFindUnique(...args) },
    sessionReplayChunk: { findFirst: (...args: unknown[]) => mockChunkFindFirst(...args) },
    workspaceApiKey: {
      findUnique: (...args: unknown[]) => mockKeyFindUnique(...args),
      update: (...args: unknown[]) => mockKeyUpdate(...args),
    },
  },
}));

vi.mock("@shared/env", () => ({
  env: { INTERNAL_SERVICE_KEY: "tli_test" },
}));

// Bypass HMAC verification for testing
vi.mock("@shared/rest/security/api-key", () => ({
  extractApiKeyPrefix: (token: string) => {
    if (token.startsWith("tlk_")) return token.split(".")[0];
    return null;
  },
  verifyApiKeySecret: () => true,
}));

// ── Imports (after mocks) ──────────────────────────────────────────
const { handleReplayChunk, handleReplayChunkOptions } = await import(
  "../src/server/http/rest/sessions/replay-chunk"
);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new Request("https://app.trustloop.dev/api/rest/sessions/sess_abc/replay/0", {
    method: "GET",
    headers,
  });
}

function routeContext(sessionId?: string, sequence?: string) {
  return {
    params: Promise.resolve({
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(sequence !== undefined ? { sequence } : {}),
    }),
  };
}

function stubValidApiKey(workspaceId = "ws_1") {
  mockKeyFindUnique.mockResolvedValue({
    id: "key_1",
    workspaceId,
    secretHash: "hashed",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
}

function stubNoApiKey() {
  mockKeyFindUnique.mockResolvedValue(null);
}

// ── CORS Preflight ─────────────────────────────────────────────────

describe("replay chunk: CORS preflight", () => {
  it("returns 204 with CORS headers on OPTIONS", async () => {
    const res = await handleReplayChunkOptions();

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
  });
});

// ── Auth Failures ──────────────────────────────────────────────────

describe("replay chunk: auth failures", () => {
  it("returns 401 without auth header", async () => {
    const req = makeRequest();
    const res = await handleReplayChunk(req, routeContext("sess_abc", "0"));

    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when API key not found", async () => {
    stubNoApiKey();
    const req = makeRequest("tlk_bogus.secret");
    const res = await handleReplayChunk(req, routeContext("sess_abc", "0"));

    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ── Parameter Validation ───────────────────────────────────────────

describe("replay chunk: parameter validation", () => {
  beforeEach(() => {
    stubValidApiKey();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for missing sessionId param", async () => {
    const req = makeRequest("tlk_testprefix.secret");
    const res = await handleReplayChunk(req, routeContext(undefined, "0"));

    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("Missing");
  });

  it("returns 400 for missing sequence param", async () => {
    const req = makeRequest("tlk_testprefix.secret");
    const res = await handleReplayChunk(req, routeContext("sess_abc", undefined));

    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("Missing");
  });

  it("returns 400 for negative sequence number", async () => {
    const req = makeRequest("tlk_testprefix.secret");
    const res = await handleReplayChunk(req, routeContext("sess_abc", "-1"));

    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("Invalid sequence number");
  });

  it("returns 400 for non-numeric sequence", async () => {
    const req = makeRequest("tlk_testprefix.secret");
    const res = await handleReplayChunk(req, routeContext("sess_abc", "abc"));

    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("Invalid sequence number");
  });
});

// ── Session / Chunk Lookup ─────────────────────────────────────────

describe("replay chunk: session and chunk lookup", () => {
  beforeEach(() => {
    stubValidApiKey();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when session not found", async () => {
    mockSessionRecordFindUnique.mockResolvedValue(null);

    const req = makeRequest("tlk_testprefix.secret");
    const res = await handleReplayChunk(req, routeContext("sess_missing", "0"));

    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("Session not found");
  });

  it("returns 404 when session belongs to different workspace", async () => {
    mockSessionRecordFindUnique.mockResolvedValue({ workspaceId: "ws_other" });

    const req = makeRequest("tlk_testprefix.secret");
    const res = await handleReplayChunk(req, routeContext("sess_abc", "0"));

    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("Session not found");
  });

  it("returns 404 when chunk not found", async () => {
    mockSessionRecordFindUnique.mockResolvedValue({ workspaceId: "ws_1" });
    mockChunkFindFirst.mockResolvedValue(null);

    const req = makeRequest("tlk_testprefix.secret");
    const res = await handleReplayChunk(req, routeContext("sess_abc", "0"));

    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("Replay chunk not found");
  });
});

// ── Successful Response ────────────────────────────────────────────

describe("replay chunk: successful response", () => {
  beforeEach(() => {
    stubValidApiKey();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with binary data, correct Content-Type, Cache-Control, and CORS headers", async () => {
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    mockSessionRecordFindUnique.mockResolvedValue({ workspaceId: "ws_1" });
    mockChunkFindFirst.mockResolvedValue({ compressedData: binaryData });

    const req = makeRequest("tlk_testprefix.secret");
    const res = await handleReplayChunk(req, routeContext("sess_abc", "3"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400, immutable");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBeTruthy();

    const responseBody = await res.arrayBuffer();
    expect(Buffer.from(responseBody)).toEqual(binaryData);
  });

  it("passes correct sessionRecordId and sequenceNumber to prisma queries", async () => {
    mockSessionRecordFindUnique.mockResolvedValue({ workspaceId: "ws_1" });
    mockChunkFindFirst.mockResolvedValue({ compressedData: Buffer.from([0x01]) });

    const req = makeRequest("tlk_testprefix.secret");
    await handleReplayChunk(req, routeContext("sess_xyz", "5"));

    expect(mockSessionRecordFindUnique).toHaveBeenCalledWith({
      where: { id: "sess_xyz" },
      select: { workspaceId: true },
    });

    expect(mockChunkFindFirst).toHaveBeenCalledWith({
      where: { sessionRecordId: "sess_xyz", sequenceNumber: 5 },
      select: { compressedData: true },
    });
  });
});
