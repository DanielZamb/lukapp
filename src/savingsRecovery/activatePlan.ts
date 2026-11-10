import {
  currentRecoveryMonth,
  isAssetProductKind,
  RecoveryError,
  requireIdempotencyKey,
  suggestContribution,
} from "./policy";
import { remainingPrincipal } from "./lifecycle";
import { ALL_MONTHS, planProgress } from "./progress";
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
      (prior.replacementLinkInferred ? undefined : prior.replacesPlanId) !== input.replacesPlanId ||
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
  const plans = await store.listPlans();
  const cancellations = await store.listCancellations();
  const cancelled = new Set(cancellations.map(item => item.planId));
  const sourcePlans = plans.filter(plan => plan.sourceJournalEntryId === source.id);
  const latest = sourcePlans.slice().reverse().sort((a, b) => b.createdAt - a.createdAt)[0];
  if (input.replacesPlanId !== undefined) {
    const previous = plans.find(item => item.id === input.replacesPlanId && item.workspaceId === input.workspaceId);
    if (!previous) throw new RecoveryError("replacement_plan_not_found");
    if (!cancelled.has(previous.id)) throw new RecoveryError("replacement_plan_not_cancelled");
    if (previous.sourceJournalEntryId !== source.id) throw new RecoveryError("replacement_expense_mismatch");
    if (plans.some(item => item.replacesPlanId === previous.id)) throw new RecoveryError("replacement_already_exists");
    if (previous.id !== latest?.id) throw new RecoveryError("replacement_plan_not_latest");
  }
  const replacesPlanId = latest && cancelled.has(latest.id) && !plans.some(item => item.replacesPlanId === latest.id)
    ? latest.id : undefined;
  const contributions = await store.listContributions();
  const corrections = await store.listCorrections();
  for (const plan of sourcePlans.filter(item => !cancelled.has(item.id))) {
    const progress = await planProgress(plan, contributions, async id =>
      Boolean(await store.findReversalOf(id)), ALL_MONTHS, corrections);
    if (progress.remainingMinorUnits > 0) throw new RecoveryError("expense_already_recovered");
  }
  const destination = (await store.listProfiles()).find(
    (profile) => profile.id === input.destinationFinancialAccountProfileId,
  );
  if (!destination || destination.workspaceId !== input.workspaceId)
    throw new RecoveryError("destination_not_found");
  if (!isAssetProductKind(destination.productKind))
    throw new RecoveryError("destination_must_be_asset");
  const principalMinorUnits = await remainingPrincipal(store, source.id, source.amountMinorUnits, {
    plans, contributions, corrections,
  });
  if (principalMinorUnits === 0) throw new RecoveryError("expense_already_recovered");
  const suggestion = suggestContribution({
    principalMinorUnits,
    installmentCount: input.installmentCount,
    installmentMinorUnits: input.installmentMinorUnits,
  });
  const plan = await store.insertPlan({
    workspaceId: input.workspaceId,
    ...(replacesPlanId === undefined ? {} : { replacesPlanId }),
    ...(replacesPlanId !== undefined && input.replacesPlanId === undefined ? { replacementLinkInferred: true } : {}),
    sourceJournalEntryId: source.id,
    destinationFinancialAccountProfileId: destination.id,
    title: source.description || "Expense",
    principalMinorUnits: suggestion.principalMinorUnits,
    installmentCount: suggestion.installmentCount,
    installmentMinorUnits: suggestion.installmentMinorUnits,
    impliedAnnualRateBps: suggestion.impliedAnnualRateBps,
    currency,
    activationMonth: currentRecoveryMonth(input.now, await store.timeZone()),
    idempotencyKey: input.idempotencyKey,
    createdBy: input.actorId,
    createdAt: input.now,
  });
  return { plan, replay: false };
}
