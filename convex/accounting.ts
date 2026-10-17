import {
  categoryNature,
  categorySelection,
  categoryStyle,
  createCategoryResult,
  userCategory,
} from "./categoryValidators";
import { createUserCategory as createCategory } from "../src/accounting/commands/createUserCategory";
import { restyleUserCategory as restyleCategory } from "../src/accounting/commands/restyleUserCategory";
import { listUserCategories as listCategories } from "../src/accounting/queries/listUserCategories";
import {
  listCategoryPresets as categoryPresets,
  suggestCategoryNature as suggestNature,
} from "../src/accounting/categories/policy";
/* Convex commands for the accounting kernel. Walkthrough: src/accounting/index.ts. */
import { ConvexError, v } from "convex/values";
import {
  ownerMutation as mutation,
  ownerQuery as query,
} from "./lib/functions";
import { postedActivity as readPostedActivity } from "../src/accounting/queries/postedActivity";
import { AccountingError, createAccountingCore } from "../src/accounting";
import { convexReadStore, convexStore } from "./store";
import {
  ensurePersonalDefaults as ensureDefaults,
  readPersonalDefaults,
} from "./personalDefaults";
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
  userCategoryId: v.optional(v.string()),
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

export const createPersonalWorkspace = mutation({
  args: {
    functionalCurrency: v.string(),
    chartOfAccountsTemplate: v.optional(v.string()),
  },
  returns: workspace,
  handler: async (ctx, args) =>
    run(() => {
      const core = createAccountingCore(convexStore(ctx.db));
      return core.createPersonalWorkspace({
        actor: ctx.actor,
        functionalCurrency: args.functionalCurrency,
        ...(args.chartOfAccountsTemplate
          ? { chartOfAccountsTemplate: args.chartOfAccountsTemplate }
          : {}),
      });
    }),
});

export const openWorkspace = query({
  args: inWorkspace,
  returns: workspace,
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).openWorkspace({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const createFinancialAccountProfile = mutation({
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

export const listFinancialAccountProfiles = query({
  args: inWorkspace,
  returns: v.array(financialAccountProfile),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(
        convexReadStore(ctx.db),
      ).listFinancialAccountProfiles({ ...args, actor: ctx.actor }),
    ),
});

export const listLedgerAccounts = query({
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

export const listCatalogAccounts = query({
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

export const lockAccountingPeriod = mutation({
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

export const recordCashExpense = mutation({
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

export const recordCashIncome = mutation({
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
      createAccountingCore(convexStore(ctx.db)).reversePostedEntry({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const listJournalEntries = query({
  args: inWorkspace,
  returns: v.array(postedJournalEntry),
  handler: async (ctx, args) =>
    run(() =>
      createAccountingCore(convexReadStore(ctx.db)).listJournalEntries({
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const balances = query({
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

export const trialBalance = query({
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

const defaults = v.object({ workspace, financialAccountProfile });

export const personalDefaults = query({
  args: {},
  returns: v.union(v.null(), defaults),
  handler: async (ctx) => run(() => readPersonalDefaults(ctx, ctx.actor)),
});

export const ensurePersonalDefaults = mutation({
  args: {
    functionalCurrency: v.string(),
    startingMinorUnits: v.number(),
    categories: v.optional(v.array(categorySelection)),
  },
  returns: defaults,
  handler: async (ctx, args) => run(() => ensureDefaults(ctx, ctx.actor, args)),
});

export const postedActivity = query({
  args: { ...inWorkspace, month: v.string() },
  returns: v.object({
    accounts: v.array(
      v.object({
        financialAccountProfileId: v.string(),
        name: v.string(),
        balance: money,
      }),
    ),
    rows: v.array(
      v.object({
        id: v.string(),
        financialAccountProfileId: v.optional(v.string()),
        title: v.string(),
        date: v.string(),
        detail: v.string(),
        reversed: v.boolean(),
        amount: money,
      }),
    ),
    monthSpendMinorUnits: v.number(),
  }),
  handler: async (ctx, args) =>
    run(() =>
      readPostedActivity(convexReadStore(ctx.db), {
        ...args,
        actor: ctx.actor,
      }),
    ),
});

export const listCategoryPresets = query({
  args: { nature: v.optional(categoryNature) },
  handler: async (_ctx, args) => categoryPresets(args.nature),
});

export const suggestCategoryNature = query({
  args: {
    name: v.string(),
    direction: v.optional(v.union(v.literal("out"), v.literal("in"))),
  },
  handler: async (_ctx, args) => suggestNature(args.name, args.direction),
});

export const createUserCategory = mutation({
  args: { ...inWorkspace, selection: categorySelection },
  returns: createCategoryResult,
  handler: async (ctx, args) =>
    run(() =>
      createCategory(convexStore(ctx.db), { ...args, actor: ctx.actor }),
    ),
});

export const listUserCategories = query({
  args: inWorkspace,
  returns: v.array(userCategory),
  handler: async (ctx, args) =>
    run(() =>
      listCategories(convexReadStore(ctx.db), { ...args, actor: ctx.actor }),
    ),
});

export const restyleUserCategory = mutation({
  args: { ...inWorkspace, categoryId: v.string(), style: categoryStyle },
  returns: userCategory,
  handler: async (ctx, args) =>
    run(() =>
      restyleCategory(convexStore(ctx.db), { ...args, actor: ctx.actor }),
    ),
});
