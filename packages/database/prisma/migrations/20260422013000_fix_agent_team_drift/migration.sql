-- Align agent-team migrations with the current Prisma schema.
-- The schema models these `updatedAt` columns with @updatedAt (no DB default),
-- and Prisma expects the explicit ON UPDATE CASCADE actions on these FKs.

-- Drop and recreate the FKs so the referential actions match schema.prisma.
ALTER TABLE "AgentTeamRunEvent" DROP CONSTRAINT "AgentTeamRunEvent_runId_fkey";
ALTER TABLE "AgentTeamRunEvent" DROP CONSTRAINT "AgentTeamRunEvent_workspaceId_fkey";
ALTER TABLE "WorkspaceAgentMetrics" DROP CONSTRAINT "WorkspaceAgentMetrics_workspaceId_fkey";

ALTER TABLE "AgentTeam"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "AgentTeamFact"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "AgentTeamOpenQuestion"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "AgentTeamRole"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "AgentTeamRoleInbox"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "AgentTeamRun"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "AgentTeamRunEvent"
  ADD CONSTRAINT "AgentTeamRunEvent_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "AgentTeamRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentTeamRunEvent"
  ADD CONSTRAINT "AgentTeamRunEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkspaceAgentMetrics"
  ADD CONSTRAINT "WorkspaceAgentMetrics_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
