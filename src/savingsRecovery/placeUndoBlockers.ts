import type { RecoveryReadStore } from "./types";

// Historical contributions count even after cancellation or correction. Undo must not erase their source expense.
export async function contributedExpensePlans(store: RecoveryReadStore, profileId: string) {
  const [plans, contributions] = await Promise.all([store.listPlans(), store.listContributions()]);
  const funded = new Set(contributions.map(item => item.planId));
  const result: Array<{ id: string; title: string }> = [];
  for (const plan of plans) {
    if (!funded.has(plan.id)) continue;
    const expense = await store.getEntry(plan.sourceJournalEntryId);
    if (expense?.financialAccountProfileId === profileId) result.push({ id: plan.id, title: plan.title });
  }
  return result;
}

export async function contributedDestinationPlans(store: RecoveryReadStore, profileId: string) {
  const [plans, contributions] = await Promise.all([store.listPlans(), store.listContributions()]);
  const funded = new Set(contributions.map(c => c.planId));
  return plans.filter(p => p.destinationFinancialAccountProfileId === profileId && funded.has(p.id)).map(p => ({ id: p.id, title: p.title }));
}
