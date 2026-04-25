-- Migration: Agent-team resolution schema rollout (Phase 1, PR 1).
--
-- Adds AgentTeamRun.parentRunId for resume chains. PR 2 wires resumeAgentRun
-- to set this when an operator answer or customer reply triggers a fresh
-- workflow execution. parentRunId is null on original runs.
--
-- The new event kinds (question_dispatched / question_answered / question_
-- superseded) and the b → r positional-format change are pure-application
-- changes; no DB schema impact (event kinds are stored as strings on
-- AgentTeamRunEvent.kind, payloads in JSON).

ALTER TABLE "AgentTeamRun"
  ADD COLUMN "parentRunId" TEXT;

ALTER TABLE "AgentTeamRun"
  ADD CONSTRAINT "AgentTeamRun_parentRunId_fkey"
  FOREIGN KEY ("parentRunId") REFERENCES "AgentTeamRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AgentTeamRun_parentRunId_idx"
  ON "AgentTeamRun" ("parentRunId");
