import { AccountingError } from "../accounting/errors";
import { requirePeriodKey } from "../accounting/period";
import type { CashExpenseProposal } from "../accounting/planningReads";
import type { Money } from "../accounting/types";
import { BudgetError } from "./errors";
import type { CreateBudgetInput, EffectiveChange, PlanningSelection, RetireBudgetInput, UpdateBudgetInput } from "./types";

function name(value: string) {
  if (!value.trim()) throw new AccountingError("name_required");
}
function key(value: string) {
  if (!value.trim()) throw new AccountingError("idempotency_key_required");
}
export function validateRevision(revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new BudgetError("budget_revision_invalid");
}
function nonnegative(amount: Money | null) {
  if (amount !== null && (!Number.isSafeInteger(amount.minorUnits) || amount.minorUnits < 0))
    throw new BudgetError("budget_limit_invalid");
}
function effective(value: EffectiveChange) {
  requirePeriodKey(value.month);
  if (value.kind === "retrospective" && !value.reason.trim()) throw new BudgetError("budget_reason_required");
}
export function validateCreate(input: Omit<CreateBudgetInput, "actor">) {
  name(input.name); key(input.idempotencyKey); requirePeriodKey(input.startMonth); nonnegative(input.limit);
  if (input.rollover.kind === "carryUnspent") nonnegative(input.rollover.cap);
}
export function validateUpdate(input: Omit<UpdateBudgetInput, "actor">) {
  key(input.idempotencyKey); validateRevision(input.revision);
  if (input.change.kind === "rename") name(input.change.name);
  else { effective(input.change.effective); nonnegative(input.change.limit); }
}
export function validateRetire(input: Omit<RetireBudgetInput, "actor">) {
  key(input.idempotencyKey); validateRevision(input.revision); effective(input.effective);
}
export function validateSelection(selection: PlanningSelection) {
  if (selection.kind === "revision") validateRevision(selection.revision);
}
export function validateProposal(proposal: CashExpenseProposal) {
  if (!Number.isSafeInteger(proposal.amount.minorUnits) || proposal.amount.minorUnits <= 0)
    throw new AccountingError("amount_must_be_positive");
  if (proposal.categoryRevision !== undefined) validateRevision(proposal.categoryRevision);
}
