import { planTargetMinorUnits, RecoveryError, scheduledDueMinorUnits } from "./policy";
import type { RecoveryPlan, RecoveryContribution, RecoveryCorrection } from "./types";

export function activeAttributions(contributions: RecoveryContribution[], corrections: RecoveryCorrection[]) {
  const corrected = new Set(corrections.map(item => item.contributionId));
  return contributions.filter(item => !corrected.has(item.id));
}

// Sorts after every real YYYY-MM, so progress counts all contributions.
export const ALL_MONTHS = "9999-12";

export async function planProgress(
  plan: RecoveryPlan,
  contributions: RecoveryContribution[],
  reversed: (transferId: string) => Promise<boolean>,
  viewedMonth: string,
  corrections: RecoveryCorrection[] = [],
) {
  const target = planTargetMinorUnits(
    plan.principalMinorUnits, plan.installmentCount, plan.installmentMinorUnits,
  );
  // Progress for a month counts only what had been contributed by that month's end, so a
  // later transfer never makes an earlier month look recovered or erase what was due then.
  let recovered = 0;
  for (const contribution of activeAttributions(contributions, corrections).filter((item) =>
    item.planId === plan.id && item.contributionDate.slice(0, 7) <= viewedMonth)) {
    if (!(await reversed(contribution.transferJournalEntryId)))
      recovered += contribution.amountMinorUnits;
  }
  if (!Number.isSafeInteger(recovered) || !Number.isSafeInteger(target - recovered))
    throw new RecoveryError("amount_out_of_range");
  const remaining = Math.max(0, target - recovered);
  return {
    recoveredMinorUnits: recovered,
    remainingMinorUnits: remaining,
    targetMinorUnits: target,
    dueMinorUnits: Math.max(0, scheduledDueMinorUnits(plan, viewedMonth) - recovered),
  };
}

