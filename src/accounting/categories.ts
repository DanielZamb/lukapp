import { commandIdentity } from "./commandIdentity";
import { AccountingError } from "./errors";
import { requireWorkspace } from "./membership";
import { assertCategoryAccount, categoryPolicy, resolveCategoryAccount, resolvePreset, suggestCategoryNature } from "./categoryPolicy";
import type { AccountingStore } from "./types";
import type { CategoryScope, CategorySnapshot, CreateCategoryInput, ChangeCategoryInput, UserCategory, CategoryClassification } from "./categoryTypes";

export async function requireCategory(store: AccountingStore, workspaceId: string, id: string): Promise<UserCategory> {
  const category = await store.getCategory(id);
  if (!category || category.workspaceId !== workspaceId) throw new AccountingError("category_not_found");
  return category;
}

export function categorySnapshot(category: UserCategory): CategorySnapshot {
  if (category.classification.kind !== "resolved") throw new AccountingError("category_unresolved");
  return { categoryId: category.id, revision: category.revision, name: category.name,
    nature: category.classification.nature, natureProvenance: category.classification.natureProvenance, account: category.classification.account };
}

export async function createUserCategory(store: AccountingStore, input: CreateCategoryInput) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor, "prepare");
  const name = input.name.trim();
  if (!name) throw new AccountingError("name_required");
  if (!input.idempotencyKey) throw new AccountingError("idempotency_key_required");
  const selection = input.selection;
  const request = commandIdentity({ command: "create", name, selection });
  const receipt = await store.getCategoryReceipt(input.workspaceId, input.idempotencyKey);
  if (receipt) {
    if (receipt.request !== request) throw new AccountingError("idempotency_key_conflict");
    return { kind: "category" as const, category: receipt.category, replay: true };
  }
  if (selection.kind === "custom" && selection.confirmation === "lexiconConfirmed" &&
      !suggestCategoryNature(name).suggestions.includes(selection.answer))
    throw new AccountingError("category_suggestion_invalid");
  if (selection.kind === "custom" && (selection.answer === "stillMine" || selection.answer === "payingDebt"))
    return { kind: "profileRequired" as const, answer: selection.answer };
  let classification: CategoryClassification;
  if (selection.kind === "preset") classification = resolvePreset(workspace.chartOfAccountsTemplate, selection.concept);
  else {
    const answer = selection.answer;
    if (answer !== "Expense" && answer !== "Income") throw new AccountingError("category_nature_mismatch");
    classification = { kind: "resolved", nature: answer,
      natureProvenance: selection.confirmation === "answered" ? { kind: "answered" } :
        { kind: "lexiconConfirmed", policy: categoryPolicy, answer },
      account: resolveCategoryAccount(workspace.chartOfAccountsTemplate, name, answer) };
  }
  const category = await store.insertCategory({ workspaceId: input.workspaceId, name, revision: 1, status: "active", classification });
  await store.saveCategoryReceipt({ workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey, request, category, correctionEntryIds: [] });
  return { kind: "category" as const, category, replay: false };
}

export async function changeUserCategory(store: AccountingStore, input: ChangeCategoryInput) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor, "prepare");
  if (!input.confirmed) throw new AccountingError("category_confirmation_required");
  if (!input.idempotencyKey) throw new AccountingError("idempotency_key_required");
  const request = commandIdentity({ command: "change", categoryId: input.categoryId, revision: input.revision, change: input.change });
  const receipt = await store.getCategoryReceipt(input.workspaceId, input.idempotencyKey);
  if (receipt) {
    if (receipt.request !== request) throw new AccountingError("idempotency_key_conflict");
    return { category: receipt.category, replay: true };
  }
  const category = await requireCategory(store, input.workspaceId, input.categoryId);
  if (category.revision !== input.revision) throw new AccountingError("category_revision_stale");
  if (category.status !== "active") throw new AccountingError("category_inactive");
  const updated = { ...category, revision: category.revision + 1 };
  switch (input.change.kind) {
    case "rename":
      updated.name = input.change.name.trim();
      if (!updated.name) throw new AccountingError("name_required");
      break;
    case "archive": updated.status = "archived"; break;
    case "merge": {
      const target = await requireCategory(store, input.workspaceId, input.change.targetCategoryId);
      if (target.id === category.id || target.status !== "active" || target.classification.kind !== "resolved" ||
          category.classification.kind !== "resolved" || target.classification.nature !== category.classification.nature)
        throw new AccountingError("category_merge_invalid");
      updated.status = "archived";
      updated.mergedIntoCategoryId = target.id;
      break;
    }
    case "defaultAccount":
      if (category.classification.kind !== "resolved") throw new AccountingError("category_unresolved");
      assertCategoryAccount(workspace.chartOfAccountsTemplate, category.classification.nature, input.change.accountCode);
      updated.classification = { ...category.classification, account: { kind: "advanced", accountCode: input.change.accountCode } };
      break;
    default: { const exhaustive: never = input.change; return exhaustive; }
  }
  await store.saveCategory(updated);
  await store.saveCategoryReceipt({ workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey, request, category: updated, correctionEntryIds: [] });
  return { category: updated, replay: false };
}

export async function listUserCategories(store: AccountingStore, input: CategoryScope) {
  await requireWorkspace(store, input.workspaceId, input.actor);
  return (await store.listCategories(input.workspaceId)).sort((a, b) => a.id.localeCompare(b.id));
}

export async function categoryTotals(store: AccountingStore, input: CategoryScope) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const totals = new Map<string, { categoryId: string; year: number; month: number; expense: number; income: number }>();
  for (const entry of await store.listJournalEntries(input.workspaceId)) for (const line of entry.lines) {
    if (!line.category) continue;
    const key = `${line.category.categoryId}:${entry.period.year}:${entry.period.month}`;
    const total = totals.get(key) ?? { categoryId: line.category.categoryId, ...entry.period, expense: 0, income: 0 };
    const field = line.category.nature === "Expense" ? "expense" : "income";
    total[field] += field === "expense" ? line.debitMinorUnits - line.creditMinorUnits : line.creditMinorUnits - line.debitMinorUnits;
    if (!Number.isSafeInteger(total[field])) throw new AccountingError("journal_line_invalid");
    totals.set(key, total);
  }
  return [...totals.values()].sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.year - b.year || a.month - b.month).map((row) => ({ ...row,
    expense: { currency: workspace.functionalCurrency, minorUnits: row.expense },
    income: { currency: workspace.functionalCurrency, minorUnits: row.income } }));
}

export async function categoryNatureSuggestion(store: AccountingStore, input: CategoryScope & { name: string }) {
  await requireWorkspace(store, input.workspaceId, input.actor);
  return suggestCategoryNature(input.name);
}
