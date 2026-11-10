import { undoPlace, undoReceipt, undoPreview, undoOperation } from "./accountingUndoValues";
import { previewUndo, readUndoStatus } from "./accountingUndo";
import { closePlace as closePlaceArgs, closePlaceReceipt, placeClosure as placeClosureValue } from "./accountingPlaceValues";
import { placeClosure as readPlaceClosure } from "../src/accounting/commands/closePlace";
import { placeClosureServices } from "./accountingPlaces";
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
  defaultPlaceChange, timeZoneChange, functionalCurrencyChange, workspaceSettingReceipt,
  accountSetup,
  accountLook,
  accountRename,
  accountTransfer,
  openingPosition,
  categoryCreation,
  categoryRestyle,
  categoryUpdate,
  categoryDelete,
  cashActivity,
  defaults, workspaceSettings as workspaceSettingsValue,
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
import { convexHistoryStore } from "./historyStore";
import { convexReadStore } from "./store";
import { readWorkspaceSettings, readWorkspaceSettingHistory, readPersonalDefaults } from "./personalDefaults";
import {
  accountBalance,
  productKind,
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

export const renameAccount = action({
  args: accountRename,
  returns: financialAccountProfile,
  handler: async (ctx, args): Promise<Infer<typeof financialAccountProfile>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.renameAccount, { ...args, session });
  },
});

export const changeAccountLook = action({
  args: accountLook,
  returns: financialAccountProfile,
  handler: async (ctx, args): Promise<Infer<typeof financialAccountProfile>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.changeAccountLook, { ...args, session });
  },
});

export const listFinancialAccountProfiles = query({
  args: { ...inWorkspace, status: v.optional(v.union(v.literal("open"), v.literal("closed"), v.literal("undone"), v.literal("undoing"), v.literal("all"))) },
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
  args: { ...inWorkspace, journalEntryId: v.string(), financialAccountProfileId: v.optional(v.string()) },
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
  args: { ...inWorkspace, month: v.string(), includeRows: v.optional(v.boolean()), status: v.optional(v.union(v.literal("open"), v.literal("closed"), v.literal("undone"), v.literal("undoing"), v.literal("all"))) },
  returns: v.object({
    accounts: v.array(
      v.object({
        financialAccountProfileId: v.string(),
        name: v.string(),
        nature: accountNature,
        productKind: productKind,
        emoji: v.optional(v.string()),
        trackingFrom: v.union(v.string(), v.null()),
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

export const updateUserCategory = action({
  args: categoryUpdate,
  returns: userCategory,
  handler: async (ctx, args): Promise<Infer<typeof userCategory>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.updateUserCategory, { ...args, session });
  },
});

export const deleteUserCategory = action({
  args: categoryDelete,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.deleteUserCategory, { ...args, session });
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

export const changeDefaultPlace = action({
  args: defaultPlaceChange, returns: workspaceSettingReceipt,
  handler: async (ctx, args): Promise<Infer<typeof workspaceSettingReceipt>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.changeDefaultPlace, { ...args, session });
  },
});

export const changeWorkspaceTimeZone = action({
  args: timeZoneChange, returns: workspaceSettingReceipt,
  handler: async (ctx, args): Promise<Infer<typeof workspaceSettingReceipt>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.changeWorkspaceTimeZone, { ...args, session });
  },
});

export const changeFunctionalCurrency = action({
  args: functionalCurrencyChange, returns: workspaceSettingReceipt,
  handler: async (ctx, args): Promise<Infer<typeof workspaceSettingReceipt>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.changeFunctionalCurrency, { ...args, session });
  },
});

export const workspaceSettings = query({
  args: inWorkspace, returns: workspaceSettingsValue,
  handler: async (ctx, args) => run(async () => readWorkspaceSettings(ctx,
    await requireWorkspacePermission(ctx, { ...args, permission: "workspace:read" }), args.workspaceId)),
});
export const workspaceSettingHistory = query({
  args: inWorkspace, returns: v.array(workspaceSettingReceipt),
  handler: async (ctx, args) => run(async () => readWorkspaceSettingHistory(ctx,
    await requireWorkspacePermission(ctx, { ...args, permission: "workspace:read" }), args.workspaceId)),
});

export const closePlace = action({
  args: closePlaceArgs, returns: closePlaceReceipt,
  handler: async (ctx, args): Promise<Infer<typeof closePlaceReceipt>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.closePlace, { ...args, session });
  },
});

export const placeClosure = query({
  args: { workspaceId: v.string(), financialAccountProfileId: v.string() }, returns: placeClosureValue,
  handler: async (ctx, args) => run(async () => {
    const actor = await requireWorkspacePermission(ctx, { workspaceId: args.workspaceId, permission: "workspace:read" });
    return readPlaceClosure(convexReadStore(ctx.db), { now: () => new Date() }, placeClosureServices(ctx, actor, args.workspaceId), { ...args, actor });
  }),
});

export const startUndoPlace = action({
  args: undoPlace, returns: undoReceipt,
  handler: async (ctx, args): Promise<Infer<typeof undoReceipt>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.accountingWrites.startUndoPlace, { ...args, session });
  },
});
export const previewUndoPlace = query({
  args: { workspaceId: v.string(), financialAccountProfileId: v.string(), cursor: v.optional(v.union(v.string(), v.null())) }, returns: undoPreview,
  handler: async (ctx, args) => run(async () => {
    const actor = await requireWorkspacePermission(ctx, { workspaceId: args.workspaceId, permission: "workspace:read" });
    return previewUndo(ctx, actor, args);
  }),
});
export const placeUndoStatus = query({
  args: { workspaceId: v.string(), financialAccountProfileId: v.string() }, returns: v.union(undoOperation, v.null()),
  handler: async (ctx, args) => run(async () => {
    await requireWorkspacePermission(ctx, { workspaceId: args.workspaceId, permission: "workspace:read" });
    return readUndoStatus(ctx, args.workspaceId, args.financialAccountProfileId);
  }),
});
