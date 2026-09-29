/* Convex commands for the accounting kernel. Walkthrough: src/accounting/index.ts. */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { AccountingError, createAccountingCore } from "../src/accounting";
import { dateFromTimestamp } from "../src/accounting/period";
import { convexReadStore, convexStore } from "./store";
import {
  accountBalance,
  accountingPeriod,
  catalogAccount,
  financialAccountProfile,
  ledgerAccount,
  money,
  periodKey,
  postedJournalEntry,
  productKind,
  trialBalanceRow,
  workspace,
} from "./validators";

const actor = {
  userId: v.string(),
};

const inWorkspace = {
  ...actor,
  workspaceId: v.string(),
};

const cashActivity = {
  ...inWorkspace,
  financialAccountProfileId: v.string(),
  amount: money,
  accountingDate: v.string(),
  description: v.string(),
  idempotencyKey: v.string(),
  ledgerAccountCode: v.optional(v.string()),
};

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AccountingError) {
      throw new ConvexError({ code: error.code, message: error.message });
    }
    throw error;
  }
}

function withActor<T extends { userId: string }>({ userId, ...rest }: T) {
  return { actor: { userId }, ...rest };
}

export const createPersonalWorkspace = mutation({
  args: { ...actor, functionalCurrency: v.string(), now: v.number() },
  returns: workspace,
  handler: async (ctx, args) =>
    run(() => {
      const core = createAccountingCore(convexStore(ctx.db), {
        now: () => dateFromTimestamp(args.now),
      });
      return core.createPersonalWorkspace({
        actor: { userId: args.userId },
        functionalCurrency: args.functionalCurrency,
      });
    }),
});

export const openWorkspace = query({
  args: { ...inWorkspace, now: v.number() },
  returns: workspace,
  handler: async (ctx, args) =>
    run(() => createAccountingCore(convexReadStore(ctx.db)).openWorkspace(withActor(args))),
});

export const createFinancialAccountProfile = mutation({
  args: { ...inWorkspace, name: v.string(), productKind },
  returns: financialAccountProfile,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).createFinancialAccountProfile(
        withActor(args),
      ),
    ),
});

export const listFinancialAccountProfiles = query({
  args: inWorkspace,
  returns: v.array(financialAccountProfile),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).listFinancialAccountProfiles(
        withActor(args),
      ),
    ),
});

export const listLedgerAccounts = query({
  args: inWorkspace,
  returns: v.array(ledgerAccount),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).listLedgerAccounts(withActor(args)),
    ),
});

export const listCatalogAccounts = query({
  args: inWorkspace,
  returns: v.array(catalogAccount),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).listCatalogAccounts(withActor(args)),
    ),
});

export const lockAccountingPeriod = mutation({
  args: { ...inWorkspace, period: periodKey, reason: v.optional(v.string()) },
  returns: accountingPeriod,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).lockAccountingPeriod(withActor(args)),
    ),
});

export const recordCashExpense = mutation({
  args: cashActivity,
  returns: postedJournalEntry,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).recordCashExpense(withActor(args)),
    ),
});

export const recordCashIncome = mutation({
  args: cashActivity,
  returns: postedJournalEntry,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).recordCashIncome(withActor(args)),
    ),
});

export const reversePostedEntry = mutation({
  args: {
    ...inWorkspace,
    journalEntryId: v.string(),
    accountingDate: v.optional(v.string()),
    description: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  returns: postedJournalEntry,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).reversePostedEntry(withActor(args)),
    ),
});

export const listJournalEntries = query({
  args: inWorkspace,
  returns: v.array(postedJournalEntry),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).listJournalEntries(withActor(args)),
    ),
});

export const balances = query({
  args: inWorkspace,
  returns: v.array(accountBalance),
  handler: async (ctx, args) =>
    run(() => createAccountingCore(convexReadStore(ctx.db)).balances(withActor(args))),
});

export const trialBalance = query({
  args: inWorkspace,
  returns: v.array(trialBalanceRow),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).trialBalance(withActor(args)),
    ),
});
