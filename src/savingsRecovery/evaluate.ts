import {
  currentRecoveryMonth, isAssetProductKind, requireMonth,
} from "./policy";
import { remainingPrincipal } from "./lifecycle";
import type {
  RecoveryLedgerEntry,
  RecoveryReadStore,
} from "./types";
import { planProgress } from "./progress";

export async function evaluateWorkspace(
  store: RecoveryReadStore,
  input: { now: number; month?: string },
) {
  const timeZone = await store.timeZone();
  const month = input.month ?? currentRecoveryMonth(input.now, timeZone);
  requireMonth(month);
  const [currency, plans, contributions, profiles, expenses, cancellations, corrections] = await Promise.all([
    store.functionalCurrency(),
    store.listPlans(),
    store.listContributions(),
    store.listProfiles(),
    store.listExpenseEntries(),
    store.listCancellations(),
    store.listCorrections(),
  ]);
  const cancelled = new Map(cancellations.map(item => [item.planId, item]));
  const reserved = new Set(plans.filter(plan => !cancelled.has(plan.id)).map(plan => plan.sourceJournalEntryId));
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
        Boolean(await store.findReversalOf(entryId)), month, corrections);
      const source = await store.getEntry(plan.sourceJournalEntryId);
      const status: "active" | "suspended" | "cancelled" | "completed" = cancelled.has(plan.id) ? "cancelled" :
        await store.findReversalOf(plan.sourceJournalEntryId) ? "suspended" :
        progress.remainingMinorUnits === 0 ? "completed" : "active";
      const contributionHistory = await Promise.all(contributions.filter(item => item.planId === plan.id)
        .sort((a, b) => a.contributionDate.localeCompare(b.contributionDate) || a.recordedAt - b.recordedAt || a.id.localeCompare(b.id))
        .map(async item => {
          const correction = corrections.find(decision => decision.contributionId === item.id);
          const voided = Boolean(await store.findReversalOf(item.transferJournalEntryId));
          const contributionStatus: "active" | "voided" | "corrected" = correction ? "corrected" : voided ? "voided" : "active";
          return { ...item, status: contributionStatus, transferReversed: voided, correction };
        }));
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
        status,
        cancellation: cancelled.get(plan.id),
        replacesPlanId: plan.replacesPlanId,
        replacedByPlanId: plans.find(item => item.replacesPlanId === plan.id)?.id,
        contributionHistory,
        remainingMinorUnits: status === "cancelled" ? 0 : progress.remainingMinorUnits,
        dueMinorUnits: status === "active" ? progress.dueMinorUnits : 0,
      };
    }));
  return {
    month,
    currentMonth: currentRecoveryMonth(input.now, timeZone),
    currency,
    plans: views,
    candidates: (await Promise.all(expenses
      .filter(entry => !entry.reversesEntryId && !reserved.has(entry.id))
      .map(async entry => ({
      ...entry, amountMinorUnits: await remainingPrincipal(store, entry.id, entry.amountMinorUnits, { plans, contributions, corrections }),
    }))))
      .filter(entry => entry.amountMinorUnits > 0)
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
