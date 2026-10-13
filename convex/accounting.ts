import { ConvexError, v } from "convex/values";
import { ownerMutation, ownerQuery } from "./lib/owner";
import {
  bootstrapPersonalWorkspace,
  personalWorkspaceLink,
  requirePersonalWorkspaceOwner,
} from "./lib/personalWorkspace";
import { AccountingError, createAccountingCore } from "../src/accounting";
import { dateFromTimestamp } from "../src/accounting/period";
import { convexReadStore, convexStore } from "./store";
import {
  accountBalance,
  openingPositionResult,
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

const inWorkspace = {
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

export const createPersonalWorkspace = ownerMutation({
  args: {
    functionalCurrency: v.string(),
    chartOfAccountsTemplate: v.optional(v.string()),
    now: v.number(),
  },
  returns: workspace,
  handler: async (ctx, args) =>
    run(() => {
      const core = createAccountingCore(convexStore(ctx.db), {
        now: () => dateFromTimestamp(args.now),
      });
      return bootstrapPersonalWorkspace(ctx, args, core);
    }),
});

export const createHouseholdWorkspace = ownerMutation({
  args: {
    functionalCurrency: v.string(),
    chartOfAccountsTemplate: v.optional(v.string()),
    idempotencyKey: v.string(),
    now: v.number(),
  },
  returns: workspace,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db), {
        now: () => dateFromTimestamp(args.now),
      }).createHouseholdWorkspace({ ...args, actor: ctx.actor }),
    ),
});

export const listOwnedWorkspaces = ownerQuery({
  args: { now: v.number() },
  returns: v.array(workspace),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).listOwnedWorkspaces({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const personalWorkspace = ownerQuery({
  args: { now: v.number() },
  returns: v.union(
    v.object({ status: v.literal("provisioning-required") }),
    v.object({ status: v.literal("ready"), workspace }),
  ),
  handler: async (ctx, args) =>
    run(async () => {
      const linked = await personalWorkspaceLink(ctx, ctx.actor.userId);
      if (!linked) return { status: "provisioning-required" } as const;
      await requirePersonalWorkspaceOwner(
        ctx,
        linked.workspaceId,
        ctx.actor.userId,
      );
      const workspace = await createAccountingCore(
        convexReadStore(ctx.db),
      ).openWorkspace({
        actor: ctx.actor,
        workspaceId: linked.workspaceId,
        now: args.now,
      });
      return { status: "ready", workspace } as const;
    }),
});

export const openWorkspace = ownerQuery({
  args: { ...inWorkspace, now: v.number() },
  returns: workspace,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).openWorkspace({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const createFinancialAccountProfile = ownerMutation({
  args: { ...inWorkspace, name: v.string(), productKind },
  returns: financialAccountProfile,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).createFinancialAccountProfile({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const listFinancialAccountProfiles = ownerQuery({
  args: inWorkspace,
  returns: v.array(financialAccountProfile),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(
        convexReadStore(ctx.db),
      ).listFinancialAccountProfiles({ ...args, actor: ctx.actor }),
    ),
});

export const listLedgerAccounts = ownerQuery({
  args: inWorkspace,
  returns: v.array(ledgerAccount),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).listLedgerAccounts({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const listCatalogAccounts = ownerQuery({
  args: inWorkspace,
  returns: v.array(catalogAccount),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).listCatalogAccounts({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const lockAccountingPeriod = ownerMutation({
  args: { ...inWorkspace, period: periodKey, reason: v.optional(v.string()) },
  returns: accountingPeriod,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).lockAccountingPeriod({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const recordCashExpense = ownerMutation({
  args: cashActivity,
  returns: postedJournalEntry,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).recordCashExpense({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const recordCashIncome = ownerMutation({
  args: cashActivity,
  returns: postedJournalEntry,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).recordCashIncome({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const reversePostedEntry = ownerMutation({
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
      createAccountingCore(convexStore(ctx.db)).reversePostedEntry({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const listJournalEntries = ownerQuery({
  args: { ...inWorkspace, financialAccountProfileId: v.optional(v.string()) },
  returns: v.array(postedJournalEntry),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).listJournalEntries({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const balances = ownerQuery({
  args: inWorkspace,
  returns: v.array(accountBalance),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).balances({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const trialBalance = ownerQuery({
  args: inWorkspace,
  returns: v.array(trialBalanceRow),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).trialBalance({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

const openingPositionArgs = {
  ...inWorkspace,
  amount: money,
  accountingDate: v.string(),
  description: v.string(),
  idempotencyKey: v.string(),
};

export const recordOpeningPosition = ownerMutation({
  args: {
    ...openingPositionArgs,
    financialAccountProfileId: v.string(),
    replacesOpeningKey: v.optional(v.string()),
  },
  returns: openingPositionResult,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).recordOpeningPosition({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const setupFinancialAccount = ownerMutation({
  args: { ...openingPositionArgs, name: v.string(), productKind },
  returns: openingPositionResult,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).setupFinancialAccount({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const recordAccountTransfer = ownerMutation({
  args: {
    ...openingPositionArgs,
    sourceFinancialAccountProfileId: v.string(),
    destinationFinancialAccountProfileId: v.string(),
  },
  returns: postedJournalEntry,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexStore(ctx.db)).recordAccountTransfer({
        ...args,
        actor: ctx.actor,
      }),
    ),
});
