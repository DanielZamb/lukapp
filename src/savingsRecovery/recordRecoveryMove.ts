import { isAssetProductKind, RecoveryError, requireIdempotencyKey } from "./policy";
import { recordContribution } from "./recordContribution";
import type { RecoveryContribution, RecoveryWriteStore } from "./types";

export type PostRecoveryTransfer = (input: {
  workspaceId: string;
  sourceFinancialAccountProfileId: string;
  destinationFinancialAccountProfileId: string;
  amount: { currency: string; minorUnits: number };
  accountingDate: string;
  description: string;
  idempotencyKey: string;
}) => Promise<{ id: string; amountMinorUnits: number; accountingDate: string }>;

export async function recordRecoveryMove(
  store: RecoveryWriteStore,
  postTransfer: PostRecoveryTransfer,
  input: {
    workspaceId: string;
    planId: string;
    sourceFinancialAccountProfileId: string;
    amount: { currency: string; minorUnits: number };
    accountingDate: string;
    description: string;
    idempotencyKey: string;
    actorId: string;
    now: number;
  },
) {
  requireIdempotencyKey(input.idempotencyKey);
  const prior = await store.findContributionRequest(input.idempotencyKey);
  if (prior) {
    if (prior.planId !== input.planId) throw new RecoveryError("idempotency_key_conflict");
    const transfer = await store.getEntry(prior.transferJournalEntryId);
    if (!transfer) throw new RecoveryError("transfer_not_found");
    if (
      transfer.financialAccountProfileId !== input.sourceFinancialAccountProfileId ||
      transfer.amountMinorUnits !== input.amount.minorUnits
    )
      throw new RecoveryError("idempotency_key_conflict");
    return pair(transfer, prior, true);
  }
  const plan = (await store.listPlans()).find((item) => item.id === input.planId);
  if (!plan || plan.workspaceId !== input.workspaceId)
    throw new RecoveryError("plan_not_found");
  const profiles = await store.listProfiles();
  const source = profiles.find((profile) => profile.id === input.sourceFinancialAccountProfileId);
  if (!source || source.workspaceId !== input.workspaceId || !isAssetProductKind(source.productKind))
    throw new RecoveryError("source_must_be_asset");
  const destination = profiles.find((profile) => profile.id === plan.destinationFinancialAccountProfileId);
  if (!destination || destination.workspaceId !== input.workspaceId || !isAssetProductKind(destination.productKind))
    throw new RecoveryError("destination_must_be_asset");
  const posted = await postTransfer({
    workspaceId: input.workspaceId,
    sourceFinancialAccountProfileId: source.id,
    destinationFinancialAccountProfileId: destination.id,
    amount: input.amount,
    accountingDate: input.accountingDate,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
  });
  const { contribution, replay } = await recordContribution(store, {
    workspaceId: input.workspaceId,
    planId: plan.id,
    transferJournalEntryId: posted.id,
    idempotencyKey: input.idempotencyKey,
    actorId: input.actorId,
    now: input.now,
  });
  return pair(posted, contribution, replay);
}

function pair(
  transfer: { id: string; amountMinorUnits: number; accountingDate: string },
  contribution: RecoveryContribution,
  replay: boolean,
) {
  return {
    replay,
    transfer: {
      id: transfer.id,
      amountMinorUnits: transfer.amountMinorUnits,
      accountingDate: transfer.accountingDate,
    },
    contribution,
  };
}
