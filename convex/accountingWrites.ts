import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { liveSession } from "./lib/securityValues";
import {
  requirePersonalSetup,
  requireSubmission,
} from "./lib/deviceAuthorization";
import { createAccountingCore } from "../src/accounting";
import { createUserCategory as createCategory } from "../src/accounting/commands/createUserCategory";
import { restyleUserCategory as restyleCategory } from "../src/accounting/commands/restyleUserCategory";
import { ensurePersonalDefaults as ensureDefaults } from "./personalDefaults";
import { convexStore } from "./store";
import { run } from "./accountingErrors";
import {
  accountSetup,
  accountTransfer,
  openingPosition,
  categoryCreation,
  categoryRestyle,
  cashActivity,
  defaults,
  periodLock,
  personalSetup,
  profileCreation,
  reversal,
} from "./accountingValues";
import {
  accountSetupResult,
  accountingPeriod,
  financialAccountProfile,
  postedJournalEntry,
} from "./validators";
import { createCategoryResult, userCategory } from "./categoryValidators";

export const createFinancialAccountProfile = internalMutation({
  args: { ...profileCreation, session: liveSession },
  returns: financialAccountProfile,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "workspace:admin",
    });
    return run(() =>
      createAccountingCore(convexStore(ctx.db)).createFinancialAccountProfile({
        ...args,
        actor,
      }),
    );
  },
});
export const lockAccountingPeriod = internalMutation({
  args: { ...periodLock, session: liveSession },
  returns: accountingPeriod,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "period:lock",
    });
    return run(() =>
      createAccountingCore(convexStore(ctx.db)).lockAccountingPeriod({
        ...args,
        actor,
      }),
    );
  },
});
export const recordCashExpense = internalMutation({
  args: { ...cashActivity, session: liveSession },
  returns: postedJournalEntry,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "accounting:post",
    });
    return run(() =>
      createAccountingCore(convexStore(ctx.db)).recordCashExpense({
        ...args,
        actor,
      }),
    );
  },
});
export const recordCashIncome = internalMutation({
  args: { ...cashActivity, session: liveSession },
  returns: postedJournalEntry,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "accounting:post",
    });
    return run(() =>
      createAccountingCore(convexStore(ctx.db)).recordCashIncome({
        ...args,
        actor,
      }),
    );
  },
});
export const reversePostedEntry = internalMutation({
  args: { ...reversal, session: liveSession },
  returns: postedJournalEntry,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "accounting:correct",
    });
    return run(() =>
      createAccountingCore(convexStore(ctx.db)).reversePostedEntry({
        ...args,
        actor,
      }),
    );
  },
});
export const ensurePersonalDefaults = internalMutation({
  args: { ...personalSetup, session: liveSession },
  returns: defaults,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requirePersonalSetup(ctx, session);
    return run(() => ensureDefaults(ctx, actor, args));
  },
});
export const createUserCategory = internalMutation({
  args: { ...categoryCreation, session: liveSession },
  returns: createCategoryResult,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "category:manage",
    });
    return run(() => createCategory(convexStore(ctx.db), { ...args, actor }));
  },
});
export const restyleUserCategory = internalMutation({
  args: { ...categoryRestyle, session: liveSession },
  returns: userCategory,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "category:manage",
    });
    return run(() => restyleCategory(convexStore(ctx.db), { ...args, actor }));
  },
});

export const recordAccountTransfer = internalMutation({
  args: { ...accountTransfer, session: liveSession },
  returns: postedJournalEntry,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "accounting:post",
    });
    return run(() =>
      createAccountingCore(convexStore(ctx.db)).recordAccountTransfer({ ...args, actor }),
    );
  },
});

export const recordOpeningPosition = internalMutation({
  args: { ...openingPosition, session: liveSession },
  returns: v.union(v.null(), postedJournalEntry),
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "accounting:post",
    });
    return run(() =>
      createAccountingCore(convexStore(ctx.db)).recordOpeningPosition({ ...args, actor }),
    );
  },
});

export const setupFinancialAccountProfile = internalMutation({
  args: { ...accountSetup, session: liveSession },
  returns: accountSetupResult,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "workspace:admin",
    });
    await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "accounting:post",
    });
    return run(() =>
      createAccountingCore(convexStore(ctx.db)).setupFinancialAccountProfile({ ...args, actor }),
    );
  },
});
