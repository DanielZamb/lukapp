import { ConvexError, v } from "convex/values";
import { AccountingError } from "../src/accounting/errors";
import { requirePeriodKey } from "../src/accounting/period";
import { createBudget as create, updateBudget as update, retireBudget as retire } from "../src/budget/commands";
import { listBudgets as list, evaluateBudgets as evaluate, budgetImpactWarning as impact } from "../src/budget/evaluation";
import { BudgetError } from "../src/budget/errors";
import { validateCreate, validateUpdate, validateRetire, validateSelection, validateProposal } from "../src/budget/input";
import { ownerMutation, ownerQuery } from "./lib/owner";
import { accountingPlanningReads } from "./accountingPlanningStore";
import { budgetReads, budgetStore } from "./budgetStore";
import * as b from "./budgetValidators";
import { periodKey } from "./validators";

async function result<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof BudgetError || error instanceof AccountingError)
      throw new ConvexError({ code: error.code, message: error.message });
    throw error;
  }
}
export const createBudget = ownerMutation({
  operation: "budget.createBudget",
  args: { workspaceId: b.budget.fields.workspaceId, name: v.string(), startMonth: periodKey, target: b.targetSelection,
    cardinality: b.budget.fields.cardinality, rollover: b.rollover, limit: b.limitDecision.fields.limit, idempotencyKey: v.string() },
  returns: b.budgetResult,
  handler: (ctx, args) => result(async () => {
    validateCreate(args);
    const decidedAt = new Date();
    return create({ store: budgetStore(ctx), accounting: accountingPlanningReads(ctx), clock: { now: () => decidedAt } }, { ...args, actor: ctx.actor });
  }),
});
export const updateBudget = ownerMutation({
  operation: "budget.updateBudget",
  args: { workspaceId: b.budget.fields.workspaceId, budgetId: b.budget.fields.id, revision: v.number(), change: b.budgetChange, idempotencyKey: v.string() },
  returns: b.budgetResult,
  handler: (ctx, args) => result(async () => {
    validateUpdate(args);
    const decidedAt = new Date();
    return update({ store: budgetStore(ctx), accounting: accountingPlanningReads(ctx), clock: { now: () => decidedAt } }, { ...args, actor: ctx.actor });
  }),
});
export const retireBudget = ownerMutation({
  operation: "budget.retireBudget",
  args: { workspaceId: b.budget.fields.workspaceId, budgetId: b.budget.fields.id, revision: v.number(), effective: b.effectiveChange, idempotencyKey: v.string() },
  returns: b.budgetResult,
  handler: (ctx, args) => result(async () => {
    validateRetire(args);
    const decidedAt = new Date();
    return retire({ store: budgetStore(ctx), accounting: accountingPlanningReads(ctx), clock: { now: () => decidedAt } }, { ...args, actor: ctx.actor });
  }),
});
export const listBudgets = ownerQuery({
  operation: "budget.listBudgets", args: { workspaceId: b.budget.fields.workspaceId }, returns: v.array(b.budget),
  handler: (ctx, args) => result(() => list(budgetReads(ctx), accountingPlanningReads(ctx), { ...args, actor: ctx.actor })),
});
export const evaluateBudgets = ownerQuery({
  operation: "budget.evaluateBudgets",
  args: { workspaceId: b.budget.fields.workspaceId, month: periodKey, selection: v.optional(b.planningSelection) }, returns: b.budgetEvaluations,
  handler: (ctx, args) => result(async () => {
    requirePeriodKey(args.month);
    const selection = args.selection ?? { kind: "current" };
    validateSelection(selection);
    return evaluate(budgetReads(ctx), accountingPlanningReads(ctx), { ...args, selection, actor: ctx.actor });
  }),
});
export const budgetImpactWarning = ownerQuery({
  operation: "budget.budgetImpactWarning", args: { workspaceId: b.budget.fields.workspaceId, proposal: b.expenseProposal }, returns: b.budgetImpact,
  handler: (ctx, args) => result(async () => {
    validateProposal(args.proposal);
    return impact(budgetReads(ctx), accountingPlanningReads(ctx), { ...args, actor: ctx.actor });
  }),
});
