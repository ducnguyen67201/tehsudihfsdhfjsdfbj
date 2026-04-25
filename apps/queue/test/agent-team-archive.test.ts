import { describe, expect, it } from "vitest";
import {
  assertSafePartitionName,
  cutoffDate,
  parsePartitionBound,
} from "../src/domains/agent-team/agent-team-archive.activity";

describe("parsePartitionBound", () => {
  it("extracts lo and hi from a standard FOR VALUES range", () => {
    const result = parsePartitionBound("FOR VALUES FROM ('2026-04-01') TO ('2026-05-01')");
    expect(result?.lo.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(result?.hi.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("returns null for DEFAULT partition expression", () => {
    expect(parsePartitionBound("DEFAULT")).toBeNull();
  });

  it("returns null for unparseable expressions", () => {
    expect(parsePartitionBound("FOR VALUES IN (1, 2, 3)")).toBeNull();
    expect(parsePartitionBound("")).toBeNull();
  });
});

describe("cutoffDate", () => {
  it("subtracts retentionDays in milliseconds", () => {
    const now = new Date("2026-04-14T00:00:00Z");
    expect(cutoffDate(now, 30).toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("treats zero retention as 'now'", () => {
    const now = new Date("2026-04-14T12:34:56Z");
    expect(cutoffDate(now, 0).toISOString()).toBe(now.toISOString());
  });
});

describe("assertSafePartitionName", () => {
  it("accepts the managed partition shape", () => {
    expect(() => assertSafePartitionName("AgentTeamRunEvent_202604")).not.toThrow();
  });

  it("rejects any name that could smuggle SQL through raw DDL", () => {
    expect(() => assertSafePartitionName('"; DROP TABLE "AgentTeamRunEvent" --')).toThrow();
    expect(() => assertSafePartitionName("agentteamrunevent_202604")).toThrow();
    expect(() => assertSafePartitionName("AgentTeamRunEvent_2026-04")).toThrow();
    expect(() => assertSafePartitionName("AgentTeamRunEvent_")).toThrow();
    expect(() => assertSafePartitionName("")).toThrow();
  });
});
