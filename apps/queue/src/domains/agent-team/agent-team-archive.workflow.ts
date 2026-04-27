import type * as archiveActivities from "@/domains/agent-team/agent-team-archive.activity";
import { proxyActivities } from "@temporalio/workflow";

// Partition archive runs nightly. Single activity, bounded by its internal
// batch size; Temporal retries on transient DB failures but the activity is
// idempotent because it only drops partitions after checking the catalog.
const activities = proxyActivities<typeof archiveActivities>({
  startToCloseTimeout: "15 minutes",
  heartbeatTimeout: "60 seconds",
  retry: { maximumAttempts: 3 },
});

export interface AgentTeamArchiveWorkflowInput {
  retentionDays?: number;
}

export interface AgentTeamArchiveWorkflowResult {
  partitionsDropped: number;
  rowsArchived: number;
  retentionDays: number;
}

export async function agentTeamArchiveWorkflow(
  input?: AgentTeamArchiveWorkflowInput
): Promise<AgentTeamArchiveWorkflowResult> {
  const result = await activities.archiveAgentTeamEvents({
    retentionDays: input?.retentionDays,
  });
  return {
    partitionsDropped: result.partitionsDropped,
    rowsArchived: result.rowsArchived,
    retentionDays: result.retentionDays,
  };
}
