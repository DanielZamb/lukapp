import { BudgetError, currentBudgetMonth, effectiveRevision, requireMonth } from "./policy";
import type { BudgetWriteStore, SetCategoryLimit } from "./types";

export async function setCategoryLimit(
  store: BudgetWriteStore,
  input: SetCategoryLimit & { actorId: string; now: number },
) {
  requireMonth(input.effectiveMonth);
  const currency = await store.functionalCurrency();
  if (input.limit.currency !== currency) throw new BudgetError("currency_mismatch");
  if (!Number.isSafeInteger(input.limit.minorUnits) || input.limit.minorUnits <= 0)
    throw new BudgetError("limit_must_be_positive");
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200)
    throw new BudgetError("idempotency_key_invalid");
  const prior = await store.findRequest(input.idempotencyKey);
  if (prior) {
    if (prior.categoryId !== input.categoryId || prior.effectiveMonth !== input.effectiveMonth ||
      prior.limitMinorUnits !== input.limit.minorUnits || prior.expectedRevisionId !== input.expectedRevisionId)
      throw new BudgetError("idempotency_key_conflict");
    return { revision: prior, replay: true };
  }
  if (input.effectiveMonth !== currentBudgetMonth(input.now)) throw new BudgetError("month_changed");
  const category = (await store.listCategories()).find((category) => category.id === input.categoryId);
  if (!category) throw new BudgetError("category_not_found");
  if (category.nature !== "Expense") throw new BudgetError("expense_category_required");
  const revisions = (await store.listRevisions()).filter((revision) => revision.categoryId === input.categoryId);
  const latest = effectiveRevision(revisions, input.effectiveMonth);
  if ((latest?.id ?? null) !== input.expectedRevisionId) throw new BudgetError("limit_changed");
  const revision = await store.insertRevision({
    workspaceId: input.workspaceId, categoryId: input.categoryId,
    effectiveMonth: input.effectiveMonth, limitMinorUnits: input.limit.minorUnits,
    expectedRevisionId: input.expectedRevisionId, sequence: (latest?.sequence ?? 0) + 1,
    idempotencyKey: input.idempotencyKey, createdBy: input.actorId, createdAt: input.now,
  });
  return { revision, replay: false };
}
