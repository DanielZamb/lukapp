import { ALL_MONTHS, planProgress } from "./progress";
import type { RecoveryInvalidation, RecoveryWriteStore } from "./types";

export async function cancelReopenedPlans(
  store: RecoveryWriteStore,
  input: { workspaceId: string; actorId: string; now: number; cause: RecoveryInvalidation },
) {
  const [plans, contributions, corrections, cancellations] = await Promise.all([
    store.listPlans(), store.listContributions(), store.listCorrections(), store.listCancellations(),
  ]);
  const cause = input.cause;
  const affected = new Set(contributions.filter(item => cause.kind === "transfer_reversed"
    ? item.transferJournalEntryId === cause.transferJournalEntryId
    : item.id === cause.contributionId).map(item => item.planId));
  if (affected.size === 0) return;
  const sources = new Set(plans.filter(plan => affected.has(plan.id)).map(plan => plan.sourceJournalEntryId));
  const cancelled = new Set(cancellations.map(item => item.planId));
  const beforeCorrections = cause.kind === "contribution_corrected"
    ? corrections.filter(item => item.id !== cause.correctionId) : corrections;
  const states = await Promise.all(plans.filter(plan => plan.workspaceId === input.workspaceId
    && sources.has(plan.sourceJournalEntryId) && !cancelled.has(plan.id))
    .map(async plan => {
      const before = await planProgress(plan, contributions, async id =>
        cause.kind === "transfer_reversed" && id === cause.transferJournalEntryId
          ? false : Boolean(await store.findReversalOf(id)), ALL_MONTHS, beforeCorrections);
      const after = await planProgress(plan, contributions, async id =>
        Boolean(await store.findReversalOf(id)), ALL_MONTHS, corrections);
      return { plan, before, after };
    }));
  const reopened = states.filter(item => affected.has(item.plan.id)
    && item.before.remainingMinorUnits === 0 && item.after.remainingMinorUnits > 0);
  for (const state of reopened) {
    const unfinished = states.find(item => item.plan.id !== state.plan.id
      && item.plan.sourceJournalEntryId === state.plan.sourceJournalEntryId
      && item.before.remainingMinorUnits > 0 && item.after.remainingMinorUnits > 0)
      ?? reopened.filter(item => item.plan.sourceJournalEntryId === state.plan.sourceJournalEntryId)
        .sort((a, b) => b.plan.createdAt - a.plan.createdAt || a.plan.id.localeCompare(b.plan.id))[0];
    if (!unfinished || unfinished.plan.id === state.plan.id) continue;
    const eventId = cause.kind === "transfer_reversed" ? cause.reversalJournalEntryId : cause.correctionId;
    await store.insertCancellation({
      workspaceId: input.workspaceId, planId: state.plan.id,
      idempotencyKey: `automatic:${cause.kind}:${eventId}:${state.plan.id}`,
      createdBy: input.actorId, eventTime: input.now, recordedAt: input.now,
      origin: { kind: "automatic", cause, unfinishedPlanId: unfinished.plan.id },
    });
  }
}
