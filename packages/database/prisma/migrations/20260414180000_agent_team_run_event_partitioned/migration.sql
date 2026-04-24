-- Agent team run event log: source of truth for agent-team observability.
-- Partitioned by month on `ts` so archival can drop whole partitions in O(1).
--
-- Rules enforced by this migration:
--   (1) Postgres requires any unique constraint on a partitioned table to
--       include all partition-key columns, so the PK is (id, ts), not id.
--   (2) Partitions inherit indexes declared on the parent automatically
--       (Postgres >= 11). Attaching new partitions inherits the index set.
--   (3) Archival (commit 6) will DROP PARTITION for months older than the
--       retention window — 30 days by default.
--
-- Also adds AgentTeamRun.summary JSONB cache (populated on run terminal state)
-- and WorkspaceAgentMetrics daily rollup (populated by commit 7).

ALTER TABLE "AgentTeamRun" ADD COLUMN "summary" JSONB;

CREATE TABLE "AgentTeamRunEvent" (
  "id"          TEXT        NOT NULL,
  "runId"       TEXT        NOT NULL,
  "workspaceId" TEXT        NOT NULL,
  "ts"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor"       TEXT        NOT NULL,
  "kind"        TEXT        NOT NULL,
  "target"      TEXT,
  "messageKind" TEXT,
  "payload"     JSONB       NOT NULL,
  "latencyMs"   INTEGER,
  "tokensIn"    INTEGER,
  "tokensOut"   INTEGER,
  "truncated"   BOOLEAN     NOT NULL DEFAULT FALSE,
  CONSTRAINT "AgentTeamRunEvent_pkey" PRIMARY KEY ("id", "ts")
) PARTITION BY RANGE ("ts");

-- Indexes on the parent propagate to every current and future partition.
-- Pattern `(runId, ts, id)` matches the cursor-based SSE read: tuple compare
-- on (ts, id) with runId equality — handles same-millisecond tiebreak.
CREATE INDEX "AgentTeamRunEvent_runId_ts_id_idx"
  ON "AgentTeamRunEvent" ("runId", "ts", "id");

CREATE INDEX "AgentTeamRunEvent_workspaceId_ts_idx"
  ON "AgentTeamRunEvent" ("workspaceId", "ts");

CREATE INDEX "AgentTeamRunEvent_runId_actor_kind_idx"
  ON "AgentTeamRunEvent" ("runId", "actor", "kind");

ALTER TABLE "AgentTeamRunEvent"
  ADD CONSTRAINT "AgentTeamRunEvent_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "AgentTeamRun"("id") ON DELETE CASCADE;

ALTER TABLE "AgentTeamRunEvent"
  ADD CONSTRAINT "AgentTeamRunEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT;

-- Pre-create partitions: current month + next 3. Archive workflow rotates
-- forward by creating the next month's partition nightly before it's needed.
-- Months use first-of-month UTC boundaries. NAME pattern: "AgentTeamRunEvent_YYYYMM".
DO $$
DECLARE
  start_of_month DATE := date_trunc('month', CURRENT_DATE)::DATE;
  m              INT;
  lo             DATE;
  hi             DATE;
  part_name      TEXT;
BEGIN
  FOR m IN 0..3 LOOP
    lo := (start_of_month + (m    || ' month')::INTERVAL)::DATE;
    hi := (start_of_month + ((m+1)|| ' month')::INTERVAL)::DATE;
    part_name := 'AgentTeamRunEvent_' || to_char(lo, 'YYYYMM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "AgentTeamRunEvent" FOR VALUES FROM (%L) TO (%L)',
      part_name, lo, hi
    );
  END LOOP;
END $$;

-- Daily workspace rollup for agent-team activity. One row per workspace per UTC
-- day. Populated by agent-team-metrics-rollup.workflow.ts (commit 7).
CREATE TABLE "WorkspaceAgentMetrics" (
  "id"               TEXT         NOT NULL,
  "workspaceId"      TEXT         NOT NULL,
  "day"              DATE         NOT NULL,
  "runsTotal"        INTEGER      NOT NULL DEFAULT 0,
  "runsSucceeded"    INTEGER      NOT NULL DEFAULT 0,
  "runsFailed"       INTEGER      NOT NULL DEFAULT 0,
  "turnsTotal"       INTEGER      NOT NULL DEFAULT 0,
  "toolCallsTotal"   INTEGER      NOT NULL DEFAULT 0,
  "tokensTotal"      INTEGER      NOT NULL DEFAULT 0,
  "toolLatencyP50Ms" INTEGER,
  "toolLatencyP95Ms" INTEGER,
  "turnWallP50Ms"    INTEGER,
  "turnWallP95Ms"    INTEGER,
  "computedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceAgentMetrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceAgentMetrics_workspaceId_day_key"
  ON "WorkspaceAgentMetrics" ("workspaceId", "day");

CREATE INDEX "WorkspaceAgentMetrics_day_idx"
  ON "WorkspaceAgentMetrics" ("day");

ALTER TABLE "WorkspaceAgentMetrics"
  ADD CONSTRAINT "WorkspaceAgentMetrics_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
