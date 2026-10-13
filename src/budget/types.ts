import type { AccountingClock, Actor, LedgerAccount, Money, PeriodKey, StoredWorkspace } from "../accounting/types";
import type { CategorySnapshot, UserCategory } from "../accounting/categoryTypes";
import type { AccountingPlanningReads } from "../accounting/planningReads";

export const budgetPolicy = {
  version: "budget-standing@1",
  evaluationContract: "independentRulesDoNotSum",
  maxLimitDecisions: 256,
  maxWorkspaceBudgets: 100,
} as const;
export type TargetSelection =
  | { kind: "totalExpense" }
  | { kind: "expenseAccount"; ledgerAccountId: LedgerAccount["id"] }
  | { kind: "category"; categoryId: UserCategory["id"] };
export type BudgetTarget =
  | { kind: "totalExpense" }
  | { kind: "expenseAccount"; ledgerAccountId: LedgerAccount["id"]; code: string; name: string }
  | { kind: "category"; categoryId: UserCategory["id"]; selectedSnapshot: CategorySnapshot };
export type Rollover = { kind: "none" } | { kind: "carryUnspent"; reset: "calendarYear"; cap: Money };
export type EffectiveChange =
  | { kind: "prospective"; month: PeriodKey }
  | { kind: "retrospective"; month: PeriodKey; reason: string; confirmed: true };
export type Decision = { revision: number; decidedBy: Actor["userId"]; decidedAt: number; policy: typeof budgetPolicy.version };
export type LimitDecision = Decision & {
  effective: { kind: "initial"; month: PeriodKey } | EffectiveChange;
  limit: Money | null;
};
export type Budget = {
  id: string;
  workspaceId: StoredWorkspace["id"];
  name: string;
  nameDecision: Decision;
  revision: number;
  target: BudgetTarget;
  cardinality: "singleStanding" | "multipleNamed";
  rollover: Rollover;
  startMonth: PeriodKey;
  created: Decision;
  lifecycle: { kind: "standing" } | { kind: "retired"; effective: EffectiveChange; decision: Decision };
  limits: LimitDecision[];
};
export type Scope = { actor: Actor; workspaceId: StoredWorkspace["id"] };
export type CreateBudgetInput = Scope & {
  name: string; startMonth: PeriodKey; target: TargetSelection;
  cardinality: Budget["cardinality"]; rollover: Rollover; limit: Money | null; idempotencyKey: string;
};
export type UpdateBudgetInput = Scope & {
  budgetId: Budget["id"]; revision: number; idempotencyKey: string;
  change: { kind: "rename"; name: string } | { kind: "limit"; effective: EffectiveChange; limit: Money | null };
};
export type RetireBudgetInput = Scope & {
  budgetId: Budget["id"]; revision: number; effective: EffectiveChange; idempotencyKey: string;
};
export type PlanningSelection = { kind: "current" } | { kind: "revision"; budgetId: Budget["id"]; revision: number };
export type BudgetResult = { budget: Budget; replay: boolean };
export type BudgetReceipt = { workspaceId: StoredWorkspace["id"]; idempotencyKey: string; request: string; budget: Budget };
export type BudgetReads = {
  getBudget(id: Budget["id"]): Promise<Budget | undefined>;
  getVersion(id: Budget["id"], revision: number): Promise<Budget | undefined>;
  listBudgets(workspaceId: StoredWorkspace["id"]): Promise<Budget[]>;
  getReceipt(workspaceId: StoredWorkspace["id"], key: string): Promise<BudgetReceipt | undefined>;
};
export type BudgetStore = BudgetReads & {
  insertBudget(budget: Omit<Budget, "id">): Promise<Budget>;
  saveBudget(budget: Budget): Promise<void>;
  appendVersion(budget: Budget): Promise<void>;
  saveReceipt(receipt: BudgetReceipt): Promise<void>;
};
export type Dependencies = { store: BudgetStore; accounting: AccountingPlanningReads; clock: AccountingClock };
