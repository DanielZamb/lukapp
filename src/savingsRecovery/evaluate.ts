import {
  currentRecoveryMonth, isAssetProductKind, planTargetMinorUnits, RecoveryError, requireMonth,
  scheduledDueMinorUnits,
} from "./policy";
import type {
  RecoveryContribution,
  RecoveryLedgerEntry,
  RecoveryPlan,
  RecoveryReadStore,
} from "./types";

// Sorts after every real YYYY-MM, so progress counts all contributions.
export const ALL_MONTHS = "9999-12";

export async function planProgress(
  plan: RecoveryPlan,
  contributions: RecoveryContribution[],
  reversed: (transferId: string) => Promise<boolean>,
  viewedMonth: string,
) {
  const target = planTargetMinorUnits(
    plan.principalMinorUnits, plan.installmentCount, plan.installmentMinorUnits,
  );
  // Progress for a month counts only what had been contributed by that month's end, so a
  // later transfer never makes an earlier month look recovered or erase what was due then.
  let recovered = 0;
  for (const contribution of contributions.filter((item) =>
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

export async function evaluateWorkspace(
  store: RecoveryReadStore,
  input: { now: number; month?: string },
) {
  const timeZone = await store.timeZone();
  const month = input.month ?? currentRecoveryMonth(input.now, timeZone);
  requireMonth(month);
  const [currency, plans, contributions, profiles, expenses] = await Promise.all([
    store.functionalCurrency(),
    store.listPlans(),
    store.listContributions(),
    store.listProfiles(),
    store.listExpenseEntries(),
  ]);
  const reserved = new Set(plans.map((plan) => plan.sourceJournalEntryId));
  const assets = profiles.filter((profile) => isAssetProductKind(profile.productKind));
  const destinations = assets
    .slice()
    .sort((a, b) => Number(b.productKind === "savingsAccount") - Number(a.productKind === "savingsAccount")
      || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const views = await Promise.all(plans
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    .map(async (plan) => {
      const progress = await planProgress(plan, contributions, async (entryId) =>
        Boolean(await store.findReversalOf(entryId)), month);
      const source = await store.getEntry(plan.sourceJournalEntryId);
      const destination = destinations.find((profile) => profile.id === plan.destinationFinancialAccountProfileId);
      return {
        id: plan.id,
        title: plan.title,
        sourceJournalEntryId: plan.sourceJournalEntryId,
        sourceTitle: source?.description || plan.title,
        destinationFinancialAccountProfileId: plan.destinationFinancialAccountProfileId,
        destinationName: destination?.name ?? "Savings",
        principalMinorUnits: plan.principalMinorUnits,
        installmentCount: plan.installmentCount,
        installmentMinorUnits: plan.installmentMinorUnits,
        impliedAnnualRateBps: plan.impliedAnnualRateBps,
        activationMonth: plan.activationMonth,
        currency: plan.currency,
        ...progress,
      };
    }));
  return {
    month,
    currentMonth: currentRecoveryMonth(input.now, timeZone),
    currency,
    plans: views,
    candidates: expenses
      .filter((entry) => !entry.reversesEntryId && !reserved.has(entry.id))
      .sort((a, b) => b.accountingDate.localeCompare(a.accountingDate) || b.id.localeCompare(a.id))
      .map((entry) => candidateView(entry, profiles)),
    destinations: destinations.map((profile) => ({
      id: profile.id, name: profile.name, productKind: profile.productKind,
    })),
    sources: assets
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .map((profile) => ({ id: profile.id, name: profile.name, productKind: profile.productKind })),
  };
}

function candidateView(entry: RecoveryLedgerEntry, profiles: { id: string; name: string }[]) {
  const place = entry.financialAccountProfileId
    ? profiles.find((profile) => profile.id === entry.financialAccountProfileId)?.name
    : undefined;
  return {
    journalEntryId: entry.id,
    title: entry.description || "Expense",
    accountingDate: entry.accountingDate,
    amountMinorUnits: entry.amountMinorUnits,
    financialAccountProfileId: entry.financialAccountProfileId,
    placeName: place,
  };
}
