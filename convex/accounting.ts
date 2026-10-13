import { categorySelection, categoryChange, reclassificationTarget, reclassificationPreview, reclassificationResult, userCategory } from "./categoryValidators";
import { natureAnswer } from "./categoryAnnotationValidators";
import { ConvexError, v } from "convex/values";
import { ownerMutation, ownerQuery } from "./lib/owner";
import {
  bootstrapPersonalWorkspace,
  personalWorkspaceLink,
  requirePersonalWorkspaceOwner,
} from "./lib/personalWorkspace";
import { AccountingError, createAccountingCore } from "../src/accounting";
import { requireWorkspace } from "../src/accounting/membership";
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
  profileClassificationAnswers,
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
  categoryRevision: v.optional(v.number()),
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
  operation: "accounting.createPersonalWorkspace",
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
  operation: "accounting.createHouseholdWorkspace",
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
  operation: "accounting.listOwnedWorkspaces",
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
  operation: "accounting.personalWorkspace",
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

export const localInputAuthority = ownerQuery({
  operation: "accounting.localInputAuthority",
  args: { workspaceId: v.optional(v.string()) },
  returns: v.union(
    v.object({ kind: v.literal("provisioning-required") }),
    v.object({ kind: v.literal("ready"), workspaceId: v.string() }),
  ),
  handler: async (ctx, args) =>
    run(async () => {
      const workspaceId = args.workspaceId ??
        (await personalWorkspaceLink(ctx, ctx.actor.userId))?.workspaceId;
      if (workspaceId === undefined) return { kind: "provisioning-required" } as const;
      await requireWorkspace(convexReadStore(ctx.db), workspaceId, ctx.actor, "prepare");
      return { kind: "ready", workspaceId } as const;
    }),
});

export const openWorkspace = ownerQuery({
  operation: "accounting.openWorkspace",
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
  operation: "accounting.createFinancialAccountProfile",
  args: { ...inWorkspace, name: v.string(), productKind, classificationAnswers: v.optional(profileClassificationAnswers), idempotencyKey: v.optional(v.string()) },
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
  operation: "accounting.listFinancialAccountProfiles",
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
  operation: "accounting.listLedgerAccounts",
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
  operation: "accounting.listCatalogAccounts",
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
  operation: "accounting.lockAccountingPeriod",
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
  operation: "accounting.recordCashExpense",
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
  operation: "accounting.recordCashIncome",
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
  operation: "accounting.reversePostedEntry",
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
  operation: "accounting.listJournalEntries",
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
  operation: "accounting.balances",
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
  operation: "accounting.trialBalance",
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
  operation: "accounting.recordOpeningPosition",
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
  operation: "accounting.setupFinancialAccount",
  args: { ...openingPositionArgs, name: v.string(), productKind, classificationAnswers: v.optional(profileClassificationAnswers) },
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
  operation: "accounting.recordAccountTransfer",
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

export const createUserCategory = ownerMutation({
  operation: "accounting.createUserCategory",
  args: { ...inWorkspace, name: v.string(), selection: categorySelection, idempotencyKey: v.string() },
  returns: v.union(v.object({ kind: v.literal("category"), category: userCategory, replay: v.boolean() }),
    v.object({ kind: v.literal("profileRequired"), answer: v.union(v.literal("stillMine"), v.literal("payingDebt")) })),
  handler: (ctx, args) => run(() => createAccountingCore(convexStore(ctx.db)).createUserCategory({ ...args, actor: ctx.actor })),
});
export const suggestCategoryNature = ownerQuery({
  operation: "accounting.suggestCategoryNature",
  args: { ...inWorkspace, name: v.string() },
  returns: v.object({ policy: v.string(), suggestions: v.array(natureAnswer), requiresConfirmation: v.literal(true) }),
  handler: (ctx, args) => run(() => createAccountingCore(convexReadStore(ctx.db)).suggestCategoryNature({ ...args, actor: ctx.actor })),
});
export const listUserCategories = ownerQuery({
  operation: "accounting.listUserCategories", args: inWorkspace, returns: v.array(userCategory),
  handler: (ctx, args) => run(() => createAccountingCore(convexReadStore(ctx.db)).listUserCategories({ ...args, actor: ctx.actor })),
});
export const categoryTotals = ownerQuery({
  operation: "accounting.categoryTotals", args: inWorkspace,
  returns: v.array(v.object({ categoryId: v.string(), year: v.number(), month: v.number(), expense: money, income: money })),
  handler: (ctx, args) => run(() => createAccountingCore(convexReadStore(ctx.db)).categoryTotals({ ...args, actor: ctx.actor })),
});
export const changeUserCategory = ownerMutation({
  operation: "accounting.changeUserCategory",
  args: { ...inWorkspace, categoryId: v.string(), revision: v.number(), change: categoryChange, confirmed: v.literal(true), idempotencyKey: v.string() },
  returns: v.object({ category: userCategory, replay: v.boolean() }),
  handler: (ctx, args) => run(() => createAccountingCore(convexStore(ctx.db)).changeUserCategory({ ...args, actor: ctx.actor })),
});
const reclassificationArgs = { ...inWorkspace, categoryId: v.string(), target: reclassificationTarget, currentDate: v.string() };
export const previewCategoryReclassification = ownerQuery({
  operation: "accounting.previewCategoryReclassification", args: reclassificationArgs, returns: reclassificationPreview,
  handler: (ctx, args) => run(() => createAccountingCore(convexReadStore(ctx.db)).previewCategoryReclassification({ ...args, actor: ctx.actor })),
});
export const confirmCategoryReclassification = ownerMutation({
  operation: "accounting.confirmCategoryReclassification",
  args: { ...reclassificationArgs, revisionToken: v.string(), confirmed: v.literal(true), idempotencyKey: v.string() }, returns: reclassificationResult,
  handler: (ctx, args) => run(() => createAccountingCore(convexStore(ctx.db)).confirmCategoryReclassification({ ...args, actor: ctx.actor })),
});
