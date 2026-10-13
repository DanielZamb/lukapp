import { requireWorkspace } from "../accounting/membership";
import { resolveExpenseProposal } from "../accounting/planningReads";
import type { AccountingPlanningReads, CashExpenseProposal, PostedExpenseLine, ProposedExpense } from "../accounting/planningReads";
import type { Money, PeriodKey } from "../accounting/types";
import { compareMonths } from "./calendar";
import { requireBudget } from "./commands";
import { BudgetError } from "./errors";
import { budgetPolicy } from "./types";
import type { Budget, BudgetReads, BudgetTarget, LimitDecision, PlanningSelection, Scope } from "./types";

export type PlanningAmounts =
  | { kind: "notStarted" | "retired" | "noLimit" }
  | { kind: "limited"; limit: Money; carry: Money; available: Money; remaining: Money; overage: Money; carryOut: Money };
export type MonthEvaluation = {
  month: PeriodKey;
  actual: Money;
  sources: PostedExpenseLine[];
  selectedLimit: LimitDecision | null;
  planning: PlanningAmounts;
};
export type BudgetEvaluation = MonthEvaluation & {
  budgetId: Budget["id"]; name: string; target: BudgetTarget;
  functionalCurrency: string; selectedRevision: number; currentRevision: number;
  policy: typeof budgetPolicy.version; rollover: Budget["rollover"];
  evaluationContract: typeof budgetPolicy.evaluationContract;
  ledgerBasis: "currentPostedLines";
  carryEvidence: MonthEvaluation[];
};
function money(currency: string, value: bigint): Money {
  const minorUnits = Number(value);
  if (!Number.isSafeInteger(minorUnits)) throw new BudgetError("budget_money_overflow");
  return { currency, minorUnits };
}
function positive(value: bigint) { return value > 0n ? value : 0n; }
function min(a: bigint, b: bigint) { return a < b ? a : b; }
function matches(target: BudgetTarget, line: { accountId?: string; categoryId?: string }) {
  switch (target.kind) {
    case "totalExpense": return true;
    case "expenseAccount": return target.ledgerAccountId === line.accountId;
    case "category": return target.categoryId === line.categoryId;
    default: { const exhaustive: never = target; return exhaustive; }
  }
}
function applicableLimit(budget: Budget, month: PeriodKey): LimitDecision | null {
  let selected: LimitDecision | null = null;
  for (const limit of budget.limits) {
    if (compareMonths(limit.effective.month, month) > 0) continue;
    if (!selected || compareMonths(limit.effective.month, selected.effective.month) > 0 ||
      (compareMonths(limit.effective.month, selected.effective.month) === 0 && limit.revision > selected.revision)) selected = limit;
  }
  return selected;
}
function planning(budget: Budget, month: PeriodKey, limit: LimitDecision | null, currency: string, actual: bigint, carry: bigint): PlanningAmounts {
  if (compareMonths(month, budget.startMonth) < 0) return { kind: "notStarted" };
  if (budget.lifecycle.kind === "retired" && compareMonths(month, budget.lifecycle.effective.month) >= 0) return { kind: "retired" };
  if (!limit || limit.limit === null) return { kind: "noLimit" };
  return limitedAmounts(budget.rollover, limit.limit, currency, actual, carry);
}
function limitedAmounts(rollover: Budget["rollover"], limit: Money, currency: string, actual: bigint, carry: bigint): PlanningAmounts {
  const incoming = rollover.kind === "none" ? 0n : carry;
  const available = BigInt(limit.minorUnits) + incoming;
  const remaining = available - actual;
  const carryOut = rollover.kind === "none" ? 0n :
    min(BigInt(rollover.cap.minorUnits), positive(available - positive(actual)));
  return { kind: "limited", limit, carry: money(currency, incoming), available: money(currency, available),
    remaining: money(currency, remaining), overage: money(currency, positive(-remaining)), carryOut: money(currency, carryOut) };
}

async function selectedBudgets(store: BudgetReads, input: Scope & { selection: PlanningSelection }) {
  if (input.selection.kind === "current") return (await store.listBudgets(input.workspaceId)).map(budget => ({ budget, currentRevision: budget.revision }));
  const head = await requireBudget(store, input.workspaceId, input.selection.budgetId);
  const budget = await store.getVersion(head.id, input.selection.revision);
  if (!budget || budget.workspaceId !== input.workspaceId) throw new BudgetError("budget_revision_invalid");
  return [{ budget, currentRevision: head.revision }];
}
async function evaluateSelected(
  accounting: AccountingPlanningReads,
  workspaceId: Budget["workspaceId"], currency: string, month: PeriodKey,
  selected: Awaited<ReturnType<typeof selectedBudgets>>,
): Promise<BudgetEvaluation[]> {
  const cache = new Map<string, PostedExpenseLine[]>();
  async function lines(period: PeriodKey) {
    const key = `${period.year}:${period.month}`;
    let result = cache.get(key);
    if (!result) { result = await accounting.postedExpenseLines(workspaceId, period); cache.set(key, result); }
    return result;
  }
  const rows: BudgetEvaluation[] = [];
  for (const { budget, currentRevision } of selected) {
    let first = month.month;
    if (budget.rollover.kind === "carryUnspent" && compareMonths(budget.startMonth, month) <= 0)
      first = budget.startMonth.year === month.year ? budget.startMonth.month : 1;
    let carry = 0n;
    const history: MonthEvaluation[] = [];
    for (let number = first; number <= month.month; number++) {
      const period = { year: month.year, month: number };
      const sources = (await lines(period)).filter(line => matches(budget.target, { accountId: line.account.id, categoryId: line.category?.categoryId }));
      const actual = sources.reduce((sum, line) => sum + BigInt(line.debitMinorUnits) - BigInt(line.creditMinorUnits), 0n);
      const selectedLimit = applicableLimit(budget, period);
      const amounts = planning(budget, period, selectedLimit, currency, actual, carry);
      const evaluated: MonthEvaluation = { month: period, actual: money(currency, actual), sources, selectedLimit, planning: amounts };
      carry = amounts.kind === "limited" ? BigInt(amounts.carryOut.minorUnits) : 0n;
      if (number < month.month) history.push(evaluated);
      else rows.push({ ...evaluated, budgetId: budget.id, name: budget.name, target: budget.target,
        functionalCurrency: currency, selectedRevision: budget.revision, currentRevision, policy: budgetPolicy.version,
        rollover: budget.rollover, evaluationContract: budgetPolicy.evaluationContract, ledgerBasis: "currentPostedLines", carryEvidence: history });
    }
  }
  return rows;
}
export async function listBudgets(store: BudgetReads, accounting: AccountingPlanningReads, input: Scope) {
  await requireWorkspace(accounting, input.workspaceId, input.actor);
  return store.listBudgets(input.workspaceId);
}
export async function evaluateBudgets(store: BudgetReads, accounting: AccountingPlanningReads, input: Scope & { month: PeriodKey; selection: PlanningSelection }) {
  const workspace = await requireWorkspace(accounting, input.workspaceId, input.actor);
  const rows = await evaluateSelected(accounting, workspace.id, workspace.functionalCurrency, input.month, await selectedBudgets(store, input));
  return { workspaceId: workspace.id, month: input.month, functionalCurrency: workspace.functionalCurrency,
    evaluationContract: budgetPolicy.evaluationContract, ledgerBasis: "currentPostedLines" as const, rows };
}
export type BudgetImpact = {
  kind: "advisory"; hasPostingAuthority: false; blocksPosting: false;
  evaluationContract: typeof budgetPolicy.evaluationContract;
  proposal: ProposedExpense;
  impacts: Array<{ evaluation: BudgetEvaluation; proposedDelta: Money; projected: { actual: Money; planning: PlanningAmounts } }>;
};
export async function budgetImpactWarning(store: BudgetReads, accounting: AccountingPlanningReads, input: Scope & { proposal: CashExpenseProposal }): Promise<BudgetImpact> {
  const workspace = await requireWorkspace(accounting, input.workspaceId, input.actor);
  const proposal = await resolveExpenseProposal(accounting, workspace, input.proposal);
  const evaluations = await evaluateSelected(accounting, workspace.id, workspace.functionalCurrency, proposal.month,
    await selectedBudgets(store, { ...input, selection: { kind: "current" } }));
  return { kind: "advisory", hasPostingAuthority: false, blocksPosting: false, evaluationContract: budgetPolicy.evaluationContract, proposal,
    impacts: evaluations.map(evaluation => {
      const delta = matches(evaluation.target, { accountId: proposal.account.ledgerAccountId, categoryId: proposal.category?.categoryId }) ? BigInt(proposal.amount.minorUnits) : 0n;
      const actual = BigInt(evaluation.actual.minorUnits) + delta;
      const amounts = evaluation.planning;
      const projected = amounts.kind !== "limited" ? amounts : limitedAmounts(
        evaluation.rollover, amounts.limit, workspace.functionalCurrency, actual, BigInt(amounts.carry.minorUnits));
      return { evaluation, proposedDelta: money(workspace.functionalCurrency, delta), projected: { actual: money(workspace.functionalCurrency, actual), planning: projected } };
    }) };
}
