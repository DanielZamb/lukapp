import {
  currentRecoveryMonth,
  isAssetProductKind,
  RecoveryError,
  requireIdempotencyKey,
  suggestContribution,
} from "./policy";
import type { ActivatePlan, RecoveryWriteStore } from "./types";

export async function activatePlan(
  store: RecoveryWriteStore,
  input: ActivatePlan & { actorId: string; now: number },
) {
  requireIdempotencyKey(input.idempotencyKey);
  const prior = await store.findPlanRequest(input.idempotencyKey);
  if (prior) {
    if (
      prior.sourceJournalEntryId !== input.sourceJournalEntryId ||
      prior.destinationFinancialAccountProfileId !== input.destinationFinancialAccountProfileId ||
      prior.installmentCount !== input.installmentCount ||
      prior.installmentMinorUnits !== input.installmentMinorUnits
    )
      throw new RecoveryError("idempotency_key_conflict");
    return { plan: prior, replay: true };
  }
  const currency = await store.functionalCurrency();
  const source = await store.getEntry(input.sourceJournalEntryId);
  if (!source || source.workspaceId !== input.workspaceId || source.policy !== "cash-expense@1")
    throw new RecoveryError("expense_not_found");
  if (source.reversesEntryId || await store.findReversalOf(source.id))
    throw new RecoveryError("expense_not_recoverable");
  const reserved = (await store.listPlans()).some(
    (plan) => plan.sourceJournalEntryId === source.id,
  );
  if (reserved) throw new RecoveryError("expense_already_recovered");
  const destination = (await store.listProfiles()).find(
    (profile) => profile.id === input.destinationFinancialAccountProfileId,
  );
  if (!destination || destination.workspaceId !== input.workspaceId)
    throw new RecoveryError("destination_not_found");
  if (!isAssetProductKind(destination.productKind))
    throw new RecoveryError("destination_must_be_asset");
  const suggestion = suggestContribution({
    principalMinorUnits: source.amountMinorUnits,
    installmentCount: input.installmentCount,
    installmentMinorUnits: input.installmentMinorUnits,
  });
  const plan = await store.insertPlan({
    workspaceId: input.workspaceId,
    sourceJournalEntryId: source.id,
    destinationFinancialAccountProfileId: destination.id,
    title: source.description || "Expense",
    principalMinorUnits: suggestion.principalMinorUnits,
    installmentCount: suggestion.installmentCount,
    installmentMinorUnits: suggestion.installmentMinorUnits,
    impliedAnnualRateBps: suggestion.impliedAnnualRateBps,
    currency,
    activationMonth: currentRecoveryMonth(input.now),
    idempotencyKey: input.idempotencyKey,
    createdBy: input.actorId,
    createdAt: input.now,
  });
  return { plan, replay: false };
}
