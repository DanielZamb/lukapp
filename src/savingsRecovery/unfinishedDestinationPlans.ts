import { ALL_MONTHS, planProgress } from "./progress";
import type { RecoveryReadStore } from "./types";

export async function unfinishedDestinationPlans(store: RecoveryReadStore, profileId: string) {
  const [plans, cancellations, contributions, corrections] = await Promise.all([
    store.listPlans(), store.listCancellations(), store.listContributions(), store.listCorrections(),
  ]);
  const cancelled = new Set(cancellations.map(item => item.planId));
  const unfinished: Array<{ id: string; title: string }> = [];
  for (const plan of plans) {
    if (plan.destinationFinancialAccountProfileId !== profileId || cancelled.has(plan.id)) continue;
    const progress = await planProgress(plan, contributions, async id => Boolean(await store.findReversalOf(id)), ALL_MONTHS, corrections);
    if (progress.remainingMinorUnits > 0) unfinished.push({ id: plan.id, title: plan.title });
  }
  return unfinished;
}
