import { ALL_MONTHS, planProgress } from "./progress";
import { RecoveryError, requireIdempotencyKey } from "./policy";
import type { CancelPlan, RecoveryWriteStore } from "./types";

export async function cancelPlan(store: RecoveryWriteStore, input: CancelPlan & { actorId: string; now: number }) {
  requireIdempotencyKey(input.idempotencyKey);
  const reason = input.reason?.trim();
  const cancellations = await store.listCancellations();
  const prior = cancellations.find(item => item.idempotencyKey === input.idempotencyKey);
  if (prior) {
    if (prior.planId !== input.planId || prior.reason !== reason) throw new RecoveryError("idempotency_key_conflict");
    return { cancellation: prior, replay: true };
  }
  if (reason !== undefined && (!reason || reason.length > 1000)) throw new RecoveryError("reason_invalid");
  const plan = (await store.listPlans()).find(item => item.id === input.planId && item.workspaceId === input.workspaceId);
  if (!plan) throw new RecoveryError("plan_not_found");
  if (cancellations.some(item => item.planId === plan.id)) throw new RecoveryError("plan_already_cancelled");
  const progress = await planProgress(plan, await store.listContributions(), async id =>
    Boolean(await store.findReversalOf(id)), ALL_MONTHS, await store.listCorrections());
  if (progress.remainingMinorUnits === 0) throw new RecoveryError("plan_already_complete");
  const cancellation = await store.insertCancellation({
    workspaceId: input.workspaceId, planId: plan.id, ...(reason === undefined ? {} : { reason }),
    idempotencyKey: input.idempotencyKey, createdBy: input.actorId,
    eventTime: input.now, recordedAt: input.now,
  });
  return { cancellation, replay: false };
}
