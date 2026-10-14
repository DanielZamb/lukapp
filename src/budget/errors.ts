export const budgetErrorMessages = {
  budget_not_found: "Budget not found",
  budget_revision_stale: "Budget changed; refresh the plan",
  budget_retired: "Budget is retired",
  budget_revision_invalid: "Budget revision must be a positive whole number",
  budget_effective_month_invalid: "Choose a future month or confirm a retrospective planning change",
  budget_target_invalid: "Choose an active Expense category or a Workspace Expense account",
  budget_cardinality_conflict: "A single standing Budget already applies in these months",
  budget_name_conflict: "Choose a distinct Budget name",
  budget_limit_invalid: "Budget limit and carry cap must be nonnegative whole minor units",
  budget_money_overflow: "Budget amount exceeds the supported whole minor units",
  budget_history_limit: "Budget has reached its supported limit-change history",
  budget_workspace_limit: "Workspace has reached its supported number of Budgets",
  budget_reason_required: "Explain the retrospective planning change",
} as const;
export class BudgetError extends Error {
  constructor(readonly code: keyof typeof budgetErrorMessages) {
    super(budgetErrorMessages[code]);
    this.name = "BudgetError";
  }
}
