import { currentRecoveryMonth, isAssetProductKind, RecoveryError, requireIdempotencyKey } from "./policy";
import { planProgress } from "./evaluate";
import type { RecordContribution, RecoveryWriteStore } from "./types";

export async function recordContribution(
  store: RecoveryWriteStore,
  input: RecordContribution & { actorId: string; now: number },
) {
  requireIdempotencyKey(input.idempotencyKey);
  const prior = await store.findContributionRequest(input.idempotencyKey);
  if (prior) {
    if (
      prior.planId !== input.planId ||
      prior.transferJournalEntryId !== input.transferJournalEntryId
    )
      throw new RecoveryError("idempotency_key_conflict");
    return { contribution: prior, replay: true };
  }
  const plan = (await store.listPlans()).find((item) => item.id === input.planId);
  if (!plan || plan.workspaceId !== input.workspaceId)
    throw new RecoveryError("plan_not_found");
  const transfer = await store.getEntry(input.transferJournalEntryId);
  if (!transfer || transfer.workspaceId !== input.workspaceId || transfer.policy !== "account-transfer@1")
    throw new RecoveryError("transfer_not_found");
  if (transfer.reversesEntryId) throw new RecoveryError("transfer_not_usable");
  if (await store.findReversalOf(transfer.id)) throw new RecoveryError("transfer_reversed");
  if (transfer.destinationFinancialAccountProfileId !== plan.destinationFinancialAccountProfileId)
    throw new RecoveryError("transfer_destination_mismatch");
  const profiles = await store.listProfiles();
  const source = profiles.find((profile) => profile.id === transfer.financialAccountProfileId);
  const destination = profiles.find((profile) => profile.id === transfer.destinationFinancialAccountProfileId);
  if (!source || !isAssetProductKind(source.productKind))
    throw new RecoveryError("source_must_be_asset");
  if (!destination || !isAssetProductKind(destination.productKind))
    throw new RecoveryError("destination_must_be_asset");
  const claimed = (await store.listContributions()).some(
    (contribution) => contribution.transferJournalEntryId === transfer.id,
  );
  if (claimed) throw new RecoveryError("transfer_already_attributed");
  const remaining = (await planProgress(plan, await store.listContributions(), async (entryId) =>
    Boolean(await store.findReversalOf(entryId)), currentRecoveryMonth(input.now),
  )).remainingMinorUnits;
  if (remaining <= 0) throw new RecoveryError("plan_already_complete");
  const amount = Math.min(transfer.amountMinorUnits, remaining);
  if (amount <= 0) throw new RecoveryError("transfer_not_usable");
  const contribution = await store.insertContribution({
    workspaceId: input.workspaceId,
    planId: plan.id,
    transferJournalEntryId: transfer.id,
    amountMinorUnits: amount,
    contributionDate: transfer.accountingDate,
    idempotencyKey: input.idempotencyKey,
    createdBy: input.actorId,
    recordedAt: input.now,
  });
  return { contribution, replay: false };
}
