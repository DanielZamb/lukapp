import { ALL_MONTHS, activeAttributions, planProgress } from "./progress";
import { cancelReopenedPlans } from "./cancelReopenedPlans";
import { requireContributablePlan, requireContributionDate } from "./lifecycle";
import { RecoveryError, requireIdempotencyKey } from "./policy";
import type { CorrectContribution, RecoveryContribution, RecoveryWriteStore } from "./types";

export async function correctContribution(store: RecoveryWriteStore, input: CorrectContribution & { actorId: string; now: number }) {
  requireIdempotencyKey(input.idempotencyKey);
  const reason = input.reason.trim();
  const [contributions, corrections] = await Promise.all([store.listContributions(), store.listCorrections()]);
  const prior = corrections.find(item => item.idempotencyKey === input.idempotencyKey);
  if (prior) {
    if (prior.contributionId !== input.contributionId || prior.reason !== reason || prior.targetPlanId !== input.targetPlanId)
      throw new RecoveryError("idempotency_key_conflict");
    return { correction: prior, replacementContribution: contributions.find(item => item.id === prior.replacementContributionId), replay: true };
  }
  if (!reason || reason.length > 1000) throw new RecoveryError("reason_invalid");
  const original = contributions.find(item => item.id === input.contributionId && item.workspaceId === input.workspaceId);
  if (!original) throw new RecoveryError("contribution_not_found");
  if (corrections.some(item => item.contributionId === original.id)) throw new RecoveryError("contribution_already_corrected");
  if (await store.findReversalOf(original.transferJournalEntryId)) throw new RecoveryError("contribution_voided");
  const transfer = await store.getEntry(original.transferJournalEntryId);
  if (!transfer || transfer.workspaceId !== input.workspaceId || transfer.policy !== "account-transfer@1" || transfer.reversesEntryId)
    throw new RecoveryError("transfer_not_usable");
  let replacementContribution: RecoveryContribution | undefined;
  if (input.targetPlanId !== undefined) {
    if (input.targetPlanId === original.planId) throw new RecoveryError("correction_target_same_plan");
    const target = await requireContributablePlan(store, input.targetPlanId, input.workspaceId);
    const originalPlan = (await store.listPlans()).find(item => item.id === original.planId);
    if (originalPlan?.sourceJournalEntryId === target.sourceJournalEntryId)
      throw new RecoveryError("correction_target_same_expense");
    requireContributionDate(target, original.contributionDate);
    if (target.destinationFinancialAccountProfileId !== transfer.destinationFinancialAccountProfileId)
      throw new RecoveryError("transfer_destination_mismatch");
    const progress = await planProgress(target, contributions, async id =>
      Boolean(await store.findReversalOf(id)), ALL_MONTHS, corrections);
    if (progress.remainingMinorUnits < original.amountMinorUnits) throw new RecoveryError("correction_exceeds_plan_remaining");
    const active = activeAttributions(contributions, corrections).filter(item =>
      item.id !== original.id && item.transferJournalEntryId === transfer.id);
    if (active.reduce((sum, item) => sum + item.amountMinorUnits, 0) + original.amountMinorUnits > transfer.amountMinorUnits)
      throw new RecoveryError("transfer_capacity_exceeded");
    replacementContribution = await store.insertContribution({
      workspaceId: input.workspaceId, planId: target.id, transferJournalEntryId: transfer.id,
      amountMinorUnits: original.amountMinorUnits, contributionDate: original.contributionDate,
      idempotencyKey: input.idempotencyKey, createdBy: input.actorId, recordedAt: input.now,
      correctsContributionId: original.id,
    });
  }
  const correction = await store.insertCorrection({
    workspaceId: input.workspaceId, contributionId: original.id, reason,
    ...(input.targetPlanId === undefined ? {} : { targetPlanId: input.targetPlanId }),
    ...(replacementContribution ? { replacementContributionId: replacementContribution.id } : {}),
    contributionDate: original.contributionDate,
    idempotencyKey: input.idempotencyKey, createdBy: input.actorId, recordedAt: input.now,
  });
  await cancelReopenedPlans(store, {
    workspaceId: input.workspaceId, actorId: input.actorId, now: input.now,
    cause: { kind: "contribution_corrected", contributionId: original.id, correctionId: correction.id },
  });
  return { correction, replacementContribution, replay: false };
}
