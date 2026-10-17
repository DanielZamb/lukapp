import type { IntakeSuggestion } from "./types";

export class IntakeError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const INTAKE_BATCH_LIMIT = 50;

export function intakeKey(candidateId: string) {
  if (!candidateId.trim()) throw new IntakeError("candidate_id_required");
  return `intake:${candidateId}`;
}

export function requireIntakeBatch(count: number) {
  if (count < 1) throw new IntakeError("candidates_required");
  if (count > INTAKE_BATCH_LIMIT) throw new IntakeError("batch_too_large");
}

export function changedFields(
  suggestion: IntakeSuggestion,
  confirmed: IntakeSuggestion,
) {
  const names: string[] = [];
  if (suggestion.direction !== confirmed.direction) names.push("direction");
  if (suggestion.description !== confirmed.description) names.push("description");
  if (
    suggestion.amount.currency !== confirmed.amount.currency ||
    suggestion.amount.minorUnits !== confirmed.amount.minorUnits
  )
    names.push("amount");
  if (suggestion.accountingDate !== confirmed.accountingDate) names.push("accountingDate");
  if (suggestion.financialAccountProfileId !== confirmed.financialAccountProfileId)
    names.push("financialAccountProfileId");
  if (
    suggestion.userCategoryIds.join("\0") !== confirmed.userCategoryIds.join("\0")
  )
    names.push("userCategoryIds");
  if (suggestion.primaryUserCategoryId !== confirmed.primaryUserCategoryId)
    names.push("primaryUserCategoryId");
  return names;
}
