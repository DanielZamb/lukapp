import { expenseEligibility } from "../accounting/queries/expenseEligibility";
import { periodFromAccountingDate } from "../accounting/period";
import { minor, RecoveryError, total } from "./amounts";
import type { ContributionAllocation, Plan, RecoveryLedger, Snapshot, SourceAllocation } from "./types";

export async function countedAllocations(ledger: RecoveryLedger, snapshot: Snapshot, asKnownAt: number, throughDate = "9999-12-31") {
  const events = snapshot.events.filter(event => event.recordedAt <= asKnownAt);
  const reversed = new Set(events.flatMap(event => event.data.kind === "contributionReversal" ? [event.data.contributionId] : []));
  const contributions = [];
  for (const event of events) {
    if (event.data.kind !== "contribution") continue;
    const transfer = await ledger.getJournalEntry(event.data.transferEntryId);
    const reversal = transfer && await ledger.findReversalOf(transfer.id);
    const voided = !transfer || (reversal !== undefined && reversal.postedAt <= asKnownAt);
    contributions.push({ event, data: event.data, voided, corrected: reversed.has(event.id) });
  }
  const verified = contributions.filter(item => !item.voided && !item.corrected && item.data.contributionDate <= throughDate)
    .flatMap(item => item.data.allocations);
  const declared = events.flatMap(event => event.data.kind === "openingProgress" && event.data.throughDate <= throughDate ? [event.data.allocation] : []);
  return { verified, declared, contributions };
}

export function paidFor(planId: string, allocations: ContributionAllocation[]) {
  const matching = allocations.filter(allocation => allocation.planId === planId);
  return {
    amountMinor: total(matching.map(allocation => allocation.amountMinor)),
    principalMinor: total(matching.map(allocation => allocation.principalMinor)),
    premiumMinor: total(matching.map(allocation => allocation.premiumMinor)),
  };
}
export function sourcePaid(entryId: string, allocations: ContributionAllocation[]) {
  return total(allocations.flatMap(allocation => allocation.sources.filter(source => source.entryId === entryId).map(source => source.principalMinor)));
}

export async function sourceExpense(ledger: RecoveryLedger, workspaceId: string, entryId: string, asKnownAt: number) {
  const entry = await ledger.getJournalEntry(entryId);
  if (!entry || entry.workspaceId !== workspaceId || entry.policy !== "cash-expense@1" || entry.postedAt > asKnownAt) return 0;
  const reversal = await ledger.findReversalOf(entryId);
  if (reversal && reversal.postedAt <= asKnownAt) return 0;
  const amounts = [];
  for (const line of entry.lines) {
    const account = await ledger.getLedgerAccount(line.ledgerAccountId);
    if (account?.nature === "Expense") amounts.push(line.debitMinorUnits);
  }
  return (await expenseEligibility(ledger, { workspaceId, sourceEntryId: entryId, originalMinorUnits: total(amounts), asKnownAt })).minorUnits;
}

export async function planStatus(ledger: RecoveryLedger, snapshot: Snapshot, plan: Plan, allocations: ContributionAllocation[], asKnownAt: number) {
  const events = snapshot.events.filter(event => event.recordedAt <= asKnownAt);
  if (events.some(event => event.data.kind === "cancelled" && event.data.planId === plan.id)) return { kind: "Cancelled" as const, unsupportedEntryIds: [] };
  if (plan.state.kind === "Draft" || plan.state.commitment.activatedAt > asKnownAt) return { kind: "Draft" as const, unsupportedEntryIds: [] };
  const paid = paidFor(plan.id, allocations);
  if (paid.amountMinor === total(plan.state.commitment.schedule.map(item => item.amountMinor))) return { kind: "Completed" as const, unsupportedEntryIds: [] };
  const unsupportedEntryIds = [];
  for (const source of plan.terms.sources) {
    const eligible = await sourceExpense(ledger, plan.workspaceId, source.entryId, asKnownAt);
    const recoveredElsewhere = sourcePaid(source.entryId, allocations.filter(allocation => allocation.planId !== plan.id));
    let unsupported = source.principalMinor + recoveredElsewhere > eligible;
    const effects = await ledger.listJournalSourceEffects(plan.workspaceId, source.entryId);
    const changes = await Promise.all(effects.map(effect => ledger.getJournalEntry(effect.journalEntryId)));
    for (const change of changes) {
      if (unsupported || !change || change.postedAt < plan.state.commitment.activatedAt || change.postedAt > asKnownAt) continue;
      const historical = await countedAllocations(ledger, snapshot, change.postedAt);
      const paidAtChange = [...historical.verified, ...historical.declared];
      if (paidFor(plan.id, paidAtChange).amountMinor === total(plan.state.commitment.schedule.map(item => item.amountMinor))) continue;
      const eligibleAtChange = await sourceExpense(ledger, plan.workspaceId, source.entryId, change.postedAt);
      const recoveredOutsideAtChange = sourcePaid(source.entryId, paidAtChange.filter(allocation => allocation.planId !== plan.id));
      unsupported = source.principalMinor + recoveredOutsideAtChange > eligibleAtChange;
    }
    if (unsupported) unsupportedEntryIds.push(source.entryId);
  }
  if (unsupportedEntryIds.length || events.some(event => event.data.kind === "suspended" && event.data.planId === plan.id))
    return { kind: "Suspended" as const, unsupportedEntryIds };
  return { kind: "Active" as const, unsupportedEntryIds };
}

export async function transferEvidence(ledger: RecoveryLedger, workspaceId: string, entryId: string, today: string) {
  const entry = await ledger.getJournalEntry(entryId);
  if (!entry || entry.workspaceId !== workspaceId || entry.policy !== "account-transfer@1" || entry.lines.length !== 2 || entry.accountingDate > today)
    throw new RecoveryError("recovery_transfer_ineligible");
  if (await ledger.findReversalOf(entry.id)) throw new RecoveryError("recovery_transfer_reversed");
  const source = entry.lines.find(line => line.creditMinorUnits > 0);
  const destination = entry.lines.find(line => line.debitMinorUnits > 0);
  if (!source || !destination || source.creditMinorUnits !== destination.debitMinorUnits) throw new RecoveryError("recovery_transfer_ineligible");
  const [sourceAccount, destinationAccount] = await Promise.all([
    ledger.getLedgerAccount(source.ledgerAccountId), ledger.getLedgerAccount(destination.ledgerAccountId),
  ]);
  if (sourceAccount?.nature !== "Asset" || destinationAccount?.nature !== "Asset") throw new RecoveryError("recovery_transfer_ineligible");
  return { entry, destinationAccountId: destination.ledgerAccountId, capacityMinor: minor(destination.debitMinorUnits, true) };
}

export function findPlan(snapshot: Snapshot, id: string): Plan {
  const plan = snapshot.plans.find(plan => plan.id === id);
  if (!plan) throw new RecoveryError("recovery_plan_not_found");
  return plan;
}
export function validDate(date: string): string {
  periodFromAccountingDate(date);
  return date;
}
export function remainingSources(plan: Plan, allocations: ContributionAllocation[]): SourceAllocation[] {
  return plan.terms.sources.map(source => ({ ...source, principalMinor: minor(source.principalMinor - sourcePaid(source.entryId,
    allocations.filter(allocation => allocation.planId === plan.id))) }));
}
