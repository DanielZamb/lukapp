import { requireOpenPlace } from "../accounting/placeState";
import { ALL_MONTHS, planProgress } from "./progress";
import { RecoveryError, planTargetMinorUnits } from "./policy";
import type { RecoveryContribution, RecoveryCorrection, RecoveryPlan, RecoveryReadStore } from "./types";

export async function remainingPrincipal(
  store: Pick<RecoveryReadStore, "findReversalOf">,
  sourceId: string,
  principal: number,
  history: { plans: RecoveryPlan[]; contributions: RecoveryContribution[]; corrections: RecoveryCorrection[] },
) {
  const { plans, contributions, corrections } = history;
  let recoveredPrincipal = 0n;
  for (const plan of plans.filter(item => item.sourceJournalEntryId === sourceId)) {
    const progress = await planProgress(plan, contributions, async id =>
      Boolean(await store.findReversalOf(id)), ALL_MONTHS, corrections);
    const target = planTargetMinorUnits(plan.principalMinorUnits, plan.installmentCount, plan.installmentMinorUnits);
    recoveredPrincipal += BigInt(Math.min(progress.recoveredMinorUnits, target)) * BigInt(plan.principalMinorUnits) / BigInt(target);
  }
  return Math.max(0, principal - Number(recoveredPrincipal));
}

export async function requireContributablePlan(store: RecoveryReadStore, planId: string, workspaceId: string) {
  const plan = (await store.listPlans()).find(item => item.id === planId && item.workspaceId === workspaceId);
  if (!plan) throw new RecoveryError("plan_not_found");
  if ((await store.listCancellations()).some(item => item.planId === plan.id))
    throw new RecoveryError("plan_cancelled");
  if (await store.findReversalOf(plan.sourceJournalEntryId))
    throw new RecoveryError("expense_not_recoverable");
  const expense = await store.getEntry(plan.sourceJournalEntryId);
  const profile = (await store.listProfiles()).find(item => item.id === expense?.financialAccountProfileId);
  if (profile) requireOpenPlace(profile);
  return plan;
}

export function requireContributionDate(plan: RecoveryPlan, date: string) {
  if (date < plan.activationDate)
    throw new RecoveryError("transfer_predates_activation");
}
