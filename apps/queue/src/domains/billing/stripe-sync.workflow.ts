import type * as syncActivities from "@/domains/billing/stripe-sync.activity";
import { proxyActivities } from "@temporalio/workflow";

const activities = proxyActivities<typeof syncActivities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3 },
});

export async function stripeUsageSyncWorkflow(): Promise<{ synced: number }> {
  const result = await activities.syncUsageEventsToStripe();
  return result;
}
