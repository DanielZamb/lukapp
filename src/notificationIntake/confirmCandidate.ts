import { changedFields, intakeKey, IntakeError } from "./policy";
import type {
  ConfirmCandidateInput,
  ConfirmCandidateResult,
  IntakeStore,
  PostCashActivity,
} from "./types";

export async function confirmCandidate(
  store: IntakeStore,
  post: PostCashActivity,
  input: ConfirmCandidateInput & { actorId: string; now: number },
): Promise<ConfirmCandidateResult> {
  if (input.confirmed.direction !== "in" && input.confirmed.direction !== "out")
    throw new IntakeError("direction_invalid");
  if (!input.confirmed.description.trim())
    throw new IntakeError("description_required");
  if (!input.confirmed.financialAccountProfileId)
    throw new IntakeError("account_required");
  const key = intakeKey(input.candidateId);
  const existing = await store.findReceipt(input.workspaceId, key);
  if (existing) {
    const posted = await store.readPosted(existing.journalEntryId);
    if (!posted) throw new IntakeError("journal_entry_not_found");
    return {
      posted: { ...posted, replay: true },
      receipt: existing,
      replay: true,
    };
  }
  const posted = await post({
    kind: input.confirmed.direction,
    workspaceId: input.workspaceId,
    financialAccountProfileId: input.confirmed.financialAccountProfileId,
    amount: input.confirmed.amount,
    accountingDate: input.confirmed.accountingDate,
    description: input.confirmed.description.trim(),
    idempotencyKey: key,
    ...(input.confirmed.userCategoryIds.length
      ? { userCategoryIds: [...input.confirmed.userCategoryIds] }
      : {}),
    ...(input.confirmed.primaryUserCategoryId
      ? { primaryUserCategoryId: input.confirmed.primaryUserCategoryId }
      : {}),
  });
  const receipt = await store.insertReceipt({
    workspaceId: input.workspaceId,
    journalEntryId: posted.id,
    idempotencyKey: key,
    suggestion: input.suggestion,
    changedFields: changedFields(input.suggestion, input.confirmed),
    parserVersion: input.parserVersion,
    consentVersion: input.consentVersion,
    actorId: input.actorId,
    confirmedAt: input.now,
  });
  return { posted, receipt, replay: posted.replay };
}
