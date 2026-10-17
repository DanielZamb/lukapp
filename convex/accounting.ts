import { ConvexError, v, type Infer } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { postedHistory as readPostedHistory } from "../src/accounting/queries/postedHistory";
import { postedEntry as readPostedEntry } from "../src/accounting/queries/postedEntry";
import { activityRow } from "./historyValidators";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { ownerQuery as query } from "./lib/functions";
import { verifyCurrentSession } from "./lib/session";
import {
  requireDevice,
  requirePersonalRead,
  requireWorkspacePermission,
} from "./lib/deviceAuthorization";
import { run } from "./accountingErrors";
import {
  accountSetup,
  accountTransfer,
  openingPosition,
  categoryCreation,
  categoryRestyle,
  cashActivity,
  defaults,
  inWorkspace,
  periodLock,
  personalSetup,
  profileCreation,
  reversal,
  workspaceCreation,
} from "./accountingValues";
import {
  categoryNature,
  createCategoryResult,
  userCategory,
  userCategoryView,
} from "./categoryValidators";
import {
  listCategoryPresets as categoryPresets,
  suggestCategoryNature as suggestNature,
} from "../src/accounting/categories/policy";
import { listUserCategories as listCategories } from "../src/accounting/queries/listUserCategories";
import { postedActivity as readPostedActivity } from "../src/accounting/queries/postedActivity";
import { categoryTotals as readCategoryTotals } from "../src/accounting/queries/categoryTotals";
import { createAccountingCore } from "../src/accounting";
import { convexReadStore, convexHistoryStore } from "./store";
import { readPersonalDefaults } from "./personalDefaults";
import {
  accountBalance,
  accountNature,
  accountSetupResult,
  accountingPeriod,
  catalogAccount,
  financialAccountProfile,
  ledgerAccount,
  money,
  postedJournalEntry,
  trialBalanceRow,
  workspace,
} from "./validators";

export const createPersonalWorkspace = action({
  args: workspaceCreation,
  returns: workspace,
  handler: async (ctx): Promise<Infer<typeof workspace>> => {
    await verifyCurrentSession(ctx.auth);
    throw new ConvexError({
      code: "workspace_creation_disabled",
      message: "Use first setup to create the Personal workspace",
    });
  },
});

export const openWorkspace = query({
  args: inWorkspace,
  returns: workspace,
  handler: async (ctx, args) =>
    run(async () =>
      createAccountingCore(convexReadStore(ctx.db)).openWorkspace({
        ...args,
        actor: await requireWorkspacePermission(ctx, {
          workspaceId: args.workspaceId,
          permission: "workspace:read",
        }),
      }),
    ),
});

export const createFinancialAccountProfile = action({
  args: profileCreation,
  returns: financialAccountProfile,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof financialAccountProfile>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(
      internal.accountingWrites.createFinancialAccountProfile,
      { ...args, session },
    );
  },
});

export const listFinancialAccountProfiles = query({
  args: inWorkspace,
  returns: v.array(financialAccountProfile),
  handler: async (ctx, args) =>
    run(async () =>
      createAccountingCore(
        convexReadStore(ctx.db),
      ).listFinancialAccountProfiles({
        ...args,
        actor: await requireWorkspacePermission(ctx, {
          workspaceId: args.workspaceId,
          permission: "workspace:read",
        }),
      }),
    ),
});

export const listLedgerAccounts = query({
  args: inWorkspace,
  returns: v.array(ledgerAccount),
  handler: async (ctx, args) =>
    run(async () =>
      createAccountingCore(convexReadStore(ctx.db)).listLedgerAccounts({
        ...args,
        actor: await requireWorkspacePermission(ctx, {
          workspaceId: args.workspaceId,
          permission: "workspace:read",
        }),
      }),
    ),
});

export const listCatalogAccounts = query({
  args: inWorkspace,
  returns: v.array(catalogAccount),
  handler: async (ctx, args) =>
    run(async () =>
      createAccountingCore(convexReadStore(ctx.db)).listCatalogAccounts({
        ...args,
        actor: await requireWorkspacePermission(ctx, {
          workspaceId: args.workspaceId,
          permission: "workspace:read",
        }),
      }),
    ),
});

export const lockAccountingPeriod = action({
  args: periodLock,
  returns: accountingPeriod,
  handler: async (ctx, args): Promise<Infer<typeof accountingPeriod>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.lockAccountingPeriod, {
      ...args,
      session,
    });
  },
});

export const recordCashExpense = action({
  args: cashActivity,
  returns: postedJournalEntry,
  handler: async (ctx, args): Promise<Infer<typeof postedJournalEntry>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.recordCashExpense, {
      ...args,
      session,
    });
  },
});

export const recordCashIncome = action({
  args: cashActivity,
  returns: postedJournalEntry,
  handler: async (ctx, args): Promise<Infer<typeof postedJournalEntry>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.recordCashIncome, {
      ...args,
      session,
    });
  },
});

export const reversePostedEntry = action({
  args: reversal,
  returns: postedJournalEntry,
  handler: async (ctx, args): Promise<Infer<typeof postedJournalEntry>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.reversePostedEntry, {
      ...args,
      session,
    });
  },
});

export const listJournalEntries = query({
  args: inWorkspace,
  returns: v.array(postedJournalEntry),
  handler: async (ctx, args) =>
    run(async () =>
      createAccountingCore(convexReadStore(ctx.db)).listJournalEntries({
        ...args,
        actor: await requireWorkspacePermission(ctx, {
          workspaceId: args.workspaceId,
          permission: "workspace:read",
        }),
      }),
    ),
});

export const postedHistory = query({
  args: {
    ...inWorkspace,
    financialAccountProfileId: v.optional(v.string()),
    includeReversals: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(activityRow),
  handler: async (ctx, args) => run(async () => readPostedHistory(convexHistoryStore(ctx.db), {
    ...args,
    actor: await requireWorkspacePermission(ctx, { workspaceId: args.workspaceId, permission: "workspace:read" }),
  })),
});

export const postedEntry = query({
  args: { ...inWorkspace, journalEntryId: v.string() },
  returns: v.object({ entry: postedJournalEntry, row: activityRow }),
  handler: async (ctx, args) => run(async () => readPostedEntry(convexReadStore(ctx.db), {
    ...args,
    actor: await requireWorkspacePermission(ctx, { workspaceId: args.workspaceId, permission: "workspace:read" }),
  })),
});

export const balances = query({
  args: inWorkspace,
  returns: v.array(accountBalance),
  handler: async (ctx, args) =>
    run(async () =>
      createAccountingCore(convexReadStore(ctx.db)).balances({
        ...args,
        actor: await requireWorkspacePermission(ctx, {
          workspaceId: args.workspaceId,
          permission: "workspace:read",
        }),
      }),
    ),
});

export const trialBalance = query({
  args: inWorkspace,
  returns: v.array(trialBalanceRow),
  handler: async (ctx, args) =>
    run(async () =>
      createAccountingCore(convexReadStore(ctx.db)).trialBalance({
        ...args,
        actor: await requireWorkspacePermission(ctx, {
          workspaceId: args.workspaceId,
          permission: "workspace:read",
        }),
      }),
    ),
});

export const personalDefaults = query({
  args: {},
  returns: v.union(v.null(), defaults),
  handler: async (ctx) =>
    run(async () => readPersonalDefaults(ctx, await requirePersonalRead(ctx))),
});

export const ensurePersonalDefaults = action({
  args: personalSetup,
  returns: defaults,
  handler: async (ctx, args): Promise<Infer<typeof defaults>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.ensurePersonalDefaults, {
      ...args,
      session,
    });
  },
});

export const postedActivity = query({
  args: { ...inWorkspace, month: v.string(), includeRows: v.optional(v.boolean()) },
  returns: v.object({
    accounts: v.array(
      v.object({
        financialAccountProfileId: v.string(),
        name: v.string(),
        nature: accountNature,
        balance: money,
      }),
    ),
    rows: v.array(activityRow),
    monthSpendMinorUnits: v.number(),
  }),
  handler: async (ctx, args) =>
    run(async () =>
      readPostedActivity(convexReadStore(ctx.db), {
        ...args,
        actor: await requireWorkspacePermission(ctx, {
          workspaceId: args.workspaceId,
          permission: "workspace:read",
        }),
      }),
    ),
});

export const categoryTotals = query({
  args: { ...inWorkspace, month: v.string() },
  returns: v.object({
    totalsOverlap: v.literal(true),
    month: v.string(),
    currency: v.string(),
    categories: v.array(
      v.object({
        categoryId: v.string(),
        name: v.string(),
        nature: v.optional(categoryNature),
        minorUnits: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) =>
    run(async () =>
      readCategoryTotals(convexReadStore(ctx.db), {
        ...args,
        actor: await requireWorkspacePermission(ctx, {
          workspaceId: args.workspaceId,
          permission: "workspace:read",
        }),
      }),
    ),
});

export const listCategoryPresets = query({
  args: { nature: v.optional(categoryNature) },
  handler: async (ctx, args) => {
    await requireDevice(ctx);
    return categoryPresets(args.nature);
  },
});

export const suggestCategoryNature = query({
  args: {
    name: v.string(),
    direction: v.optional(v.union(v.literal("out"), v.literal("in"))),
  },
  handler: async (ctx, args) => {
    await requireDevice(ctx);
    return suggestNature(args.name, args.direction);
  },
});

export const createUserCategory = action({
  args: categoryCreation,
  returns: createCategoryResult,
  handler: async (ctx, args): Promise<Infer<typeof createCategoryResult>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.createUserCategory, {
      ...args,
      session,
    });
  },
});

export const listUserCategories = query({
  args: inWorkspace,
  returns: v.array(userCategoryView),
  handler: async (ctx, args) =>
    run(async () =>
      listCategories(convexReadStore(ctx.db), {
        ...args,
        actor: await requireWorkspacePermission(ctx, {
          workspaceId: args.workspaceId,
          permission: "workspace:read",
        }),
      }),
    ),
});

export const restyleUserCategory = action({
  args: categoryRestyle,
  returns: userCategory,
  handler: async (ctx, args): Promise<Infer<typeof userCategory>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.restyleUserCategory, {
      ...args,
      session,
    });
  },
});

export const recordAccountTransfer = action({
  args: accountTransfer,
  returns: postedJournalEntry,
  handler: async (ctx, args): Promise<Infer<typeof postedJournalEntry>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.recordAccountTransfer, {
      ...args,
      session,
    });
  },
});

export const recordOpeningPosition = action({
  args: openingPosition,
  returns: v.union(v.null(), postedJournalEntry),
  handler: async (ctx, args): Promise<Infer<typeof postedJournalEntry> | null> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.recordOpeningPosition, {
      ...args,
      session,
    });
  },
});

export const setupFinancialAccountProfile = action({
  args: accountSetup,
  returns: accountSetupResult,
  handler: async (ctx, args): Promise<Infer<typeof accountSetupResult>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.setupFinancialAccountProfile, {
      ...args,
      session,
    });
  },
});
