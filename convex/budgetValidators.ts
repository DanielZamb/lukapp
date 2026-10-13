import { defineTable } from "convex/server";
import { v } from "convex/values";
import { ledgerAccount, money, periodKey, postingPolicy, workspace } from "./validators";
import { categoryCorrection, categorySnapshot, userCategory } from "./categoryAnnotationValidators";

export const targetSelection = v.union(
  v.object({ kind: v.literal("totalExpense") }),
  v.object({ kind: v.literal("expenseAccount"), ledgerAccountId: ledgerAccount.fields.id }),
  v.object({ kind: v.literal("category"), categoryId: userCategory.fields.id }),
);
export const budgetTarget = v.union(
  v.object({ kind: v.literal("totalExpense") }),
  v.object({ kind: v.literal("expenseAccount"), ledgerAccountId: ledgerAccount.fields.id, code: v.string(), name: v.string() }),
  v.object({ kind: v.literal("category"), categoryId: userCategory.fields.id, selectedSnapshot: categorySnapshot }),
);
export const rollover = v.union(v.object({ kind: v.literal("none") }),
  v.object({ kind: v.literal("carryUnspent"), reset: v.literal("calendarYear"), cap: money }));
export const effectiveChange = v.union(
  v.object({ kind: v.literal("prospective"), month: periodKey }),
  v.object({ kind: v.literal("retrospective"), month: periodKey, reason: v.string(), confirmed: v.literal(true) }),
);
const decision = v.object({ revision: v.number(), decidedBy: v.string(), decidedAt: v.number(), policy: v.literal("budget-standing@1") });
const limit = v.union(money, v.null());
export const limitDecision = v.object({ ...decision.fields,
  effective: v.union(effectiveChange, v.object({ kind: v.literal("initial"), month: periodKey })), limit });
const budgetFields = {
  workspaceId: workspace.fields.id, name: v.string(), nameDecision: decision, revision: v.number(), target: budgetTarget,
  cardinality: v.union(v.literal("singleStanding"), v.literal("multipleNamed")), rollover, startMonth: periodKey, created: decision,
  lifecycle: v.union(v.object({ kind: v.literal("standing") }),
    v.object({ kind: v.literal("retired"), effective: effectiveChange, decision })),
  limits: v.array(limitDecision),
};
export const budget = v.object({ id: v.string(), ...budgetFields });
export const budgetResult = v.object({ budget, replay: v.boolean() });
export const budgetChange = v.union(v.object({ kind: v.literal("rename"), name: v.string() }),
  v.object({ kind: v.literal("limit"), effective: effectiveChange, limit }));
export const planningSelection = v.union(v.object({ kind: v.literal("current") }),
  v.object({ kind: v.literal("revision"), budgetId: budget.fields.id, revision: v.number() }));
export const expenseProposal = v.object({ financialAccountProfileId: v.string(), accountingDate: v.string(), amount: money,
  userCategoryId: v.optional(userCategory.fields.id), categoryRevision: v.optional(v.number()), ledgerAccountCode: v.optional(v.string()) });
const proposedExpense = v.object({ kind: v.literal("proposedExpense"), postingPolicy: v.literal("cash-expense@1"),
  financialAccountProfileId: v.string(), accountingDate: v.string(), month: periodKey, amount: money,
  account: v.object({ code: v.string(), name: v.string(), nature: v.literal("Expense"), ledgerAccountId: v.optional(ledgerAccount.fields.id) }),
  category: v.optional(categorySnapshot) });
const postedExpense = v.object({ kind: v.literal("postedExpense"), journalEntryId: v.string(), lineNumber: v.number(),
  accountingDate: v.string(), postedAt: v.number(), postedBy: v.string(), postingPolicy, reversesEntryId: v.optional(v.string()),
  account: v.object({ id: ledgerAccount.fields.id, workspaceId: workspace.fields.id, code: v.string(), name: v.string(),
    nature: v.literal("Expense"), normalSide: v.union(v.literal("Debit"), v.literal("Credit")), role: v.literal("Posting") }),
  debitMinorUnits: v.number(), creditMinorUnits: v.number(), category: v.optional(categorySnapshot), categoryCorrection: v.optional(categoryCorrection) });
export const planningAmounts = v.union(v.object({ kind: v.union(v.literal("notStarted"), v.literal("retired"), v.literal("noLimit")) }),
  v.object({ kind: v.literal("limited"), limit: money, carry: money, available: money, remaining: money, overage: money, carryOut: money }));
const monthEvaluation = v.object({ month: periodKey, actual: money, sources: v.array(postedExpense),
  selectedLimit: v.union(limitDecision, v.null()), planning: planningAmounts });
const budgetEvaluation = v.object({ ...monthEvaluation.fields, budgetId: budget.fields.id, name: v.string(), target: budgetTarget,
  functionalCurrency: v.string(), selectedRevision: v.number(), currentRevision: v.number(), policy: v.literal("budget-standing@1"), rollover,
  evaluationContract: v.literal("independentRulesDoNotSum"), ledgerBasis: v.literal("currentPostedLines"), carryEvidence: v.array(monthEvaluation) });
export const budgetEvaluations = v.object({ workspaceId: workspace.fields.id, month: periodKey, functionalCurrency: v.string(),
  evaluationContract: v.literal("independentRulesDoNotSum"), ledgerBasis: v.literal("currentPostedLines"), rows: v.array(budgetEvaluation) });
export const budgetImpact = v.object({ kind: v.literal("advisory"), hasPostingAuthority: v.literal(false), blocksPosting: v.literal(false),
  evaluationContract: v.literal("independentRulesDoNotSum"), proposal: proposedExpense,
  impacts: v.array(v.object({ evaluation: budgetEvaluation, proposedDelta: money,
    projected: v.object({ actual: money, planning: planningAmounts }) })) });
export const budgetTables = {
  budgets: defineTable(budgetFields).index("by_workspace", ["workspaceId"]),
  budgetVersions: defineTable({ budgetId: v.id("budgets"), revision: v.number(), budget }).index("by_budget_revision", ["budgetId", "revision"]),
  budgetReceipts: defineTable({ workspaceId: workspace.fields.id, idempotencyKey: v.string(), request: v.string(), budget })
    .index("by_workspace_key", ["workspaceId", "idempotencyKey"]),
};
