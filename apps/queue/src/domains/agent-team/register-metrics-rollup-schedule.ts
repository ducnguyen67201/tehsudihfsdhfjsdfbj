import { env } from "@shared/env";
import { buildTemporalConnectionOptions } from "@shared/rest/temporal-connection";
import { TASK_QUEUES } from "@shared/types";
import { Client, type Connection } from "@temporalio/client";

const SCHEDULE_ID = "agent-team-metrics-rollup";
// Daily at 01:00 UTC — runs before archive so archive has metrics rolled up
// for yesterday before it touches the partitions.
const CRON_EXPRESSION = "0 1 * * *";

/**
 * Idempotently register (or update) the Temporal schedule for the per-workspace
 * metrics rollup. Safe to call repeatedly — used from worker startup so the
 * rollup schedule cannot silently be missing on a fresh deploy.
 */
export async function registerAgentTeamMetricsRollupSchedule(
  client: Client
): Promise<{ existed: boolean }> {
  let alreadyExists = false;
  for await (const schedule of client.schedule.list()) {
    if (schedule.scheduleId === SCHEDULE_ID) {
      alreadyExists = true;
      break;
    }
  }

  if (alreadyExists) {
    const handle = client.schedule.getHandle(SCHEDULE_ID);
    await handle.update((prev) => ({
      ...prev,
      spec: { cronExpressions: [CRON_EXPRESSION] },
    }));
    return { existed: true };
  }

  await client.schedule.create({
    scheduleId: SCHEDULE_ID,
    spec: { cronExpressions: [CRON_EXPRESSION] },
    action: {
      type: "startWorkflow",
      workflowType: "agentTeamMetricsRollupWorkflow",
      taskQueue: TASK_QUEUES.CODEX,
      args: [{}],
    },
  });
  return { existed: false };
}

async function main(): Promise<void> {
  const { Connection } = await import("@temporalio/client");
  const connection: Connection = await Connection.connect(buildTemporalConnectionOptions());
  const client = new Client({ connection, namespace: env.TEMPORAL_NAMESPACE });

  const { existed } = await registerAgentTeamMetricsRollupSchedule(client);
  console.log(
    `${existed ? "Updated" : "Created"} schedule "${SCHEDULE_ID}" → ${CRON_EXPRESSION} ` +
      `(queue ${TASK_QUEUES.CODEX})`
  );
  await connection.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error("Failed to register agent-team metrics rollup schedule:", err);
    process.exit(1);
  });
}
