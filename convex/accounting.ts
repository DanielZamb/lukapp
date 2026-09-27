/* Convex commands for the accounting kernel. Walkthrough: src/accounting/index.ts. */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { AccountingError, createAccountingCore } from "../src/accounting";
import { dateFromTimestamp } from "../src/accounting/period";
import { convexReadStore, convexStore } from "./store";
import {
  accountBalance,
  accountingPeriod,
  financialAccountProfile,
  money,
  periodKey,
  postedCashExpense,
  trialBalanceRow,
  workspace,
} from "./validators";

const actor = {
  userId: v.string(),
};

function throwAccounting(error: unknown): never {
  if (error instanceof AccountingError) {
    throw new ConvexError({ code: error.code, message: error.message });
  }
  throw error;
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throwAccounting(error);
  }
}

export const createPersonalWorkspace = mutation({
  args: {
    ...actor,
    functionalCurrency: v.string(),
    now: v.number(),
  },
  returns: workspace,
  handler: async (ctx, args) => {
    const core = createAccountingCore(await convexStore(ctx.db), {
      now: () => dateFromTimestamp(args.now),
    });
    return run(() =>
      core.createPersonalWorkspace({
        actor: { userId: args.userId },
        functionalCurrency: args.functionalCurrency,
      }),
    );
  },
});

export const openWorkspace = query({
  args: {
    ...actor,
    workspaceId: v.string(),
    now: v.number(),
  },
  returns: workspace,
  handler: async (ctx, args) => {
    const core = createAccountingCore(await convexReadStore(ctx.db), {
      now: () => dateFromTimestamp(args.now),
    });
    return run(() =>
      core.openWorkspace({
        actor: { userId: args.userId },
        workspaceId: args.workspaceId,
        now: args.now,
      }),
    );
  },
});

export const createFinancialAccountProfile = mutation({
  args: {
    ...actor,
    workspaceId: v.string(),
    name: v.string(),
  },
  returns: financialAccountProfile,
  handler: async (ctx, args) => {
    const core = createAccountingCore(await convexStore(ctx.db));
    return run(() =>
      core.createFinancialAccountProfile({
        actor: { userId: args.userId },
        workspaceId: args.workspaceId,
        name: args.name,
      }),
    );
  },
});

export const listFinancialAccountProfiles = query({
  args: {
    ...actor,
    workspaceId: v.string(),
  },
  returns: v.array(financialAccountProfile),
  handler: async (ctx, args) => {
    const core = createAccountingCore(await convexReadStore(ctx.db));
    return run(() =>
      core.listFinancialAccountProfiles({
        actor: { userId: args.userId },
        workspaceId: args.workspaceId,
      }),
    );
  },
});

export const lockAccountingPeriod = mutation({
  args: {
    ...actor,
    workspaceId: v.string(),
    period: periodKey,
  },
  returns: accountingPeriod,
  handler: async (ctx, args) => {
    const core = createAccountingCore(await convexStore(ctx.db));
    return run(() =>
      core.lockAccountingPeriod({
        actor: { userId: args.userId },
        workspaceId: args.workspaceId,
        period: args.period,
      }),
    );
  },
});

export const recordCashExpense = mutation({
  args: {
    ...actor,
    workspaceId: v.string(),
    financialAccountProfileId: v.string(),
    amount: money,
    accountingDate: v.string(),
    description: v.string(),
    idempotencyKey: v.string(),
  },
  returns: postedCashExpense,
  handler: async (ctx, args) => {
    const core = createAccountingCore(await convexStore(ctx.db));
    return run(() =>
      core.recordCashExpense({
        actor: { userId: args.userId },
        workspaceId: args.workspaceId,
        financialAccountProfileId: args.financialAccountProfileId,
        amount: args.amount,
        accountingDate: args.accountingDate,
        description: args.description,
        idempotencyKey: args.idempotencyKey,
      }),
    );
  },
});

export const listPostedCashExpenses = query({
  args: {
    ...actor,
    workspaceId: v.string(),
  },
  returns: v.array(postedCashExpense),
  handler: async (ctx, args) => {
    const core = createAccountingCore(await convexReadStore(ctx.db));
    return run(() =>
      core.listPostedCashExpenses({
        actor: { userId: args.userId },
        workspaceId: args.workspaceId,
      }),
    );
  },
});

export const balances = query({
  args: {
    ...actor,
    workspaceId: v.string(),
  },
  returns: v.array(accountBalance),
  handler: async (ctx, args) => {
    const core = createAccountingCore(await convexReadStore(ctx.db));
    return run(() =>
      core.balances({
        actor: { userId: args.userId },
        workspaceId: args.workspaceId,
      }),
    );
  },
});

export const trialBalance = query({
  args: {
    ...actor,
    workspaceId: v.string(),
  },
  returns: v.array(trialBalanceRow),
  handler: async (ctx, args) => {
    const core = createAccountingCore(await convexReadStore(ctx.db));
    return run(() =>
      core.trialBalance({
        actor: { userId: args.userId },
        workspaceId: args.workspaceId,
      }),
    );
  },
});
