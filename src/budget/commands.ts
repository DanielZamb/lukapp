import { categorySnapshot, requireCategory } from "../accounting/categories";
import { commandIdentity } from "../accounting/commandIdentity";
import { AccountingError } from "../accounting/errors";
import { requireWorkspace } from "../accounting/membership";
import { clockMonth } from "../accounting/period";
import type { Money, PeriodKey, StoredWorkspace } from "../accounting/types";
import { compareMonths } from "./calendar";
import { BudgetError } from "./errors";
import { budgetPolicy } from "./types";
import type { Budget, BudgetReads, BudgetResult, CreateBudgetInput, Decision, Dependencies, EffectiveChange, RetireBudgetInput, UpdateBudgetInput } from "./types";

function currency(workspace: StoredWorkspace, amount: Money | null) {
  if (amount !== null && amount.currency !== workspace.functionalCurrency) throw new AccountingError("currency_mismatch");
}
function decision(deps: Dependencies, actor: Decision["decidedBy"], revision: number): Decision {
  return { revision, decidedBy: actor, decidedAt: deps.clock.now().getTime(), policy: budgetPolicy.version };
}
function nextRevision(budget: Budget) {
  const revision = budget.revision + 1;
  if (!Number.isSafeInteger(revision)) throw new BudgetError("budget_revision_invalid");
  return revision;
}
function assertEffective(deps: Dependencies, effective: EffectiveChange, start: PeriodKey) {
  const relative = compareMonths(effective.month, clockMonth(deps.clock.now()));
  if (compareMonths(effective.month, start) < 0 ||
    (effective.kind === "prospective" ? relative <= 0 : relative > 0))
    throw new BudgetError("budget_effective_month_invalid");
}
export async function requireBudget(store: BudgetReads, workspaceId: Budget["workspaceId"], id: Budget["id"]) {
  const budget = await store.getBudget(id);
  if (!budget || budget.workspaceId !== workspaceId) throw new BudgetError("budget_not_found");
  return budget;
}
function overlaps(a: Pick<Budget, "startMonth" | "lifecycle">, b: Pick<Budget, "startMonth" | "lifecycle">) {
  const endA = a.lifecycle.kind === "retired" ? a.lifecycle.effective.month : undefined;
  const endB = b.lifecycle.kind === "retired" ? b.lifecycle.effective.month : undefined;
  if (endA && compareMonths(endA, a.startMonth) <= 0) return false;
  if (endB && compareMonths(endB, b.startMonth) <= 0) return false;
  return (!endA || compareMonths(b.startMonth, endA) < 0) && (!endB || compareMonths(a.startMonth, endB) < 0);
}
function assertNames(peers: Budget[], budget: Omit<Budget, "id"> & { id?: Budget["id"] }) {
  for (const peer of peers) {
    if (peer.id === budget.id || !overlaps(peer, budget)) continue;
    if (peer.cardinality === "singleStanding" || budget.cardinality === "singleStanding")
      throw new BudgetError("budget_cardinality_conflict");
    if (peer.name.toLocaleLowerCase("en-US") === budget.name.toLocaleLowerCase("en-US"))
      throw new BudgetError("budget_name_conflict");
  }
}
async function replay(deps: Dependencies, workspaceId: Budget["workspaceId"], key: string, request: string): Promise<BudgetResult | undefined> {
  const receipt = await deps.store.getReceipt(workspaceId, key);
  if (!receipt) return undefined;
  if (receipt.request !== request) throw new AccountingError("idempotency_key_conflict");
  return { budget: receipt.budget, replay: true };
}
async function finish(deps: Dependencies, budget: Budget, key: string, request: string): Promise<BudgetResult> {
  await deps.store.appendVersion(budget);
  await deps.store.saveReceipt({ workspaceId: budget.workspaceId, idempotencyKey: key, request, budget });
  return { budget, replay: false };
}
export async function createBudget(deps: Dependencies, input: CreateBudgetInput): Promise<BudgetResult> {
  const workspace = await requireWorkspace(deps.accounting, input.workspaceId, input.actor, "manageBudgets");
  const request = commandIdentity({ command: "createBudget", ...input });
  const prior = await replay(deps, input.workspaceId, input.idempotencyKey, request);
  if (prior) return prior;
  currency(workspace, input.limit);
  if (input.rollover.kind === "carryUnspent") currency(workspace, input.rollover.cap);
  let target: Budget["target"];
  switch (input.target.kind) {
    case "totalExpense": target = input.target; break;
    case "expenseAccount": {
      const account = await deps.accounting.getLedgerAccount(input.target.ledgerAccountId);
      if (!account || account.workspaceId !== workspace.id || account.nature !== "Expense") throw new BudgetError("budget_target_invalid");
      target = { ...input.target, code: account.code, name: account.name }; break;
    }
    case "category": {
      const category = await requireCategory(deps.accounting, workspace.id, input.target.categoryId);
      if (category.status !== "active" || category.classification.kind !== "resolved" || category.classification.nature !== "Expense")
        throw new BudgetError("budget_target_invalid");
      target = { ...input.target, selectedSnapshot: categorySnapshot(category) }; break;
    }
    default: { const exhaustive: never = input.target; return exhaustive; }
  }
  const made = decision(deps, input.actor.userId, 1);
  const fields: Omit<Budget, "id"> = {
    workspaceId: workspace.id, name: input.name.trim(), nameDecision: made, revision: 1,
    startMonth: input.startMonth, target, cardinality: input.cardinality, rollover: input.rollover,
    created: made, lifecycle: { kind: "standing" },
    limits: [{ ...made, effective: { kind: "initial", month: input.startMonth }, limit: input.limit }],
  };
  const peers = await deps.store.listBudgets(workspace.id);
  if (peers.length >= budgetPolicy.maxWorkspaceBudgets) throw new BudgetError("budget_workspace_limit");
  assertNames(peers, fields);
  const budget = await deps.store.insertBudget(fields);
  return finish(deps, budget, input.idempotencyKey, request);
}
export async function updateBudget(deps: Dependencies, input: UpdateBudgetInput): Promise<BudgetResult> {
  const workspace = await requireWorkspace(deps.accounting, input.workspaceId, input.actor, "manageBudgets");
  const request = commandIdentity({ command: "updateBudget", ...input });
  const prior = await replay(deps, input.workspaceId, input.idempotencyKey, request);
  if (prior) return prior;
  const current = await requireBudget(deps.store, workspace.id, input.budgetId);
  if (current.revision !== input.revision) throw new BudgetError("budget_revision_stale");
  if (current.lifecycle.kind === "retired") throw new BudgetError("budget_retired");
  const changed = decision(deps, input.actor.userId, nextRevision(current));
  let budget: Budget;
  switch (input.change.kind) {
    case "rename":
      budget = { ...current, name: input.change.name.trim(), nameDecision: changed, revision: changed.revision };
      assertNames(await deps.store.listBudgets(budget.workspaceId), budget); break;
    case "limit":
      assertEffective(deps, input.change.effective, current.startMonth);
      currency(workspace, input.change.limit);
      if (current.limits.length >= budgetPolicy.maxLimitDecisions) throw new BudgetError("budget_history_limit");
      budget = { ...current, revision: changed.revision,
        limits: [...current.limits, { ...changed, effective: input.change.effective, limit: input.change.limit }] }; break;
    default: { const exhaustive: never = input.change; return exhaustive; }
  }
  await deps.store.saveBudget(budget);
  return finish(deps, budget, input.idempotencyKey, request);
}
export async function retireBudget(deps: Dependencies, input: RetireBudgetInput): Promise<BudgetResult> {
  await requireWorkspace(deps.accounting, input.workspaceId, input.actor, "manageBudgets");
  const request = commandIdentity({ command: "retireBudget", ...input });
  const prior = await replay(deps, input.workspaceId, input.idempotencyKey, request);
  if (prior) return prior;
  const current = await requireBudget(deps.store, input.workspaceId, input.budgetId);
  if (current.revision !== input.revision) throw new BudgetError("budget_revision_stale");
  if (current.lifecycle.kind === "retired") throw new BudgetError("budget_retired");
  assertEffective(deps, input.effective, current.startMonth);
  const changed = decision(deps, input.actor.userId, nextRevision(current));
  const budget: Budget = { ...current, revision: changed.revision,
    lifecycle: { kind: "retired", effective: input.effective, decision: changed } };
  await deps.store.saveBudget(budget);
  return finish(deps, budget, input.idempotencyKey, request);
}
