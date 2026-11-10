import { createUserCategory } from "../src/accounting/commands/createUserCategory";
import type { CategorySelection } from "../src/accounting/categories/types";
import { ConvexError } from "convex/values";
import { createAccountingCore } from "../src/accounting";
import { requireFunctionalCurrencyCode } from "../src/accounting/money";
import { recordOpeningPosition } from "../src/accounting/commands/recordOpeningPosition";
import { calendarDate, requireTimeZone, workspaceTimeZone } from "../src/accounting/timeZone";
import { AccountingError } from "../src/accounting/errors";
import { requireSelectableDefaultPlace } from "../src/accounting/commands/chooseDefaultPlace";
import type { Doc, Id } from "./_generated/dataModel";
import type { Infer } from "convex/values";
import { defaults as defaultsValue, currencyChangeBlock, workspaceSettingReceipt } from "./accountingValues";
import type { Actor } from "../src/accounting";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { convexReadStore, convexStore } from "./store";

export async function readPersonalDefaults(ctx: QueryCtx, actor: Actor) {
  const defaults = await ctx.db
    .query("personalDefaults")
    .withIndex("by_owner", (q) => q.eq("ownerSubject", actor.userId))
    .unique();
  if (!defaults) return null;
  const core = createAccountingCore(convexReadStore(ctx.db));
  const workspace = await core.openWorkspace({
    actor,
    workspaceId: defaults.workspaceId,
  });
  const profiles = await core.listFinancialAccountProfiles({
    actor,
    workspaceId: workspace.id,
  });
  const workspaceDoc = await ctx.db.get(defaults.workspaceId);
  const defaultId = workspaceDoc?.defaultFinancialAccountProfileId ?? defaults.financialAccountProfileId;
  const financialAccountProfile = profiles.find(
    (p) => p.id === defaultId,
  );
  if (!financialAccountProfile)
    throw new ConvexError({ code: "defaults_unavailable" });
  return {
    workspace,
    financialAccountProfile,
    purchaseAlertsConsent: defaults.purchaseAlertsConsent ?? false,
    wantsBudgets: defaults.wantsBudgets ?? false,
    ...(defaults.firstCategoryId
      ? { firstCategoryId: defaults.firstCategoryId }
      : {}),
  };
}

export async function ensurePersonalDefaults(
  ctx: MutationCtx,
  actor: Actor,
  args: {
    functionalCurrency: string;
    startingMinorUnits: number;
    categories?: CategorySelection[];
    timeZone: string;
    purchaseAlertsConsent?: boolean;
    wantsBudgets?: boolean;
  },
) {
  requireFunctionalCurrencyCode(args.functionalCurrency);
  if (
    !Number.isSafeInteger(args.startingMinorUnits) ||
    args.startingMinorUnits < 0
  ) {
    throw new ConvexError({ code: "starting_amount_invalid" });
  }
  const purchaseAlertsConsent = args.purchaseAlertsConsent ?? false;
  const wantsBudgets = args.wantsBudgets ?? false;
  const categorySetupSignature = JSON.stringify(
    (args.categories ?? [])
      .map((selection) => [
        selection.kind,
        selection.kind === "preset" ? selection.presetId : selection.name,
        selection.kind === "custom" ? selection.answer : null,
        selection.style.emoji,
        selection.style.tone,
        ...(selection.style.color ? [selection.style.color] : []),
        ...(selection.kind === "preset" && selection.name?.trim() ? [`name:${selection.name.trim()}`] : []),
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
  const timeZone = requireTimeZone(args.timeZone);
  const existing = await readPersonalDefaults(ctx, actor);
  if (existing) {
    const defaults = await ctx.db
      .query("personalDefaults")
      .withIndex("by_owner", (q) => q.eq("ownerSubject", actor.userId))
      .unique();
    if (!defaults) throw new ConvexError({ code: "defaults_unavailable" });
    const original = defaults.setupResult ?? await originalSetupResult(ctx, defaults, existing.workspace);
    if (
      original.workspace.functionalCurrency !== args.functionalCurrency ||
      original.workspace.timeZone !== timeZone ||
      defaults?.startingMinorUnits !== args.startingMinorUnits ||
      original.purchaseAlertsConsent !== purchaseAlertsConsent ||
      original.wantsBudgets !== wantsBudgets ||
      (defaults?.categorySetupSignature ?? "[]") !== categorySetupSignature
    ) {
      throw new ConvexError({
        code: "setup_conflict",
        message: "First setup already completed with different answers",
      });
    }
    return original;
  }
  const store = convexStore(ctx.db);
  const clock = { now: () => new Date() };
  const core = createAccountingCore(store, clock);
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: args.functionalCurrency,
    timeZone,
  });
  let firstCategoryId: string | undefined;
  for (const selection of args.categories ?? []) {
    const result = await createUserCategory(store, {
      actor,
      workspaceId: workspace.id,
      selection,
    });
    if (result.kind === "accountSetupRequired") {
      throw new ConvexError({
        code: "account_setup_required",
        message: "Add a place for this money before continuing",
      });
    }
    firstCategoryId ??= result.category.id;
  }
  const financialAccountProfile = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "My money",
    productKind: "cash",
  });
  await recordOpeningPosition(
    store,
    clock,
    {
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: financialAccountProfile.id,
      amount: {
        currency: workspace.functionalCurrency,
        minorUnits: args.startingMinorUnits,
      },
      accountingDate: calendarDate(clock.now(), timeZone),
      description: "Starting amount",
      idempotencyKey: "personal-defaults-opening@1",
    },
    "start-tracking@1",
  );
  const workspaceId = ctx.db.normalizeId("workspaces", workspace.id);
  const profileId = ctx.db.normalizeId(
    "financialAccountProfiles",
    financialAccountProfile.id,
  );
  if (!workspaceId || !profileId) throw new Error("Core returned invalid IDs");
  const firstCategory = firstCategoryId
    ? ctx.db.normalizeId("userCategories", firstCategoryId)
    : null;
  if (firstCategoryId && !firstCategory)
    throw new Error("Core returned invalid category ID");
  const result = {
    workspace, financialAccountProfile, purchaseAlertsConsent, wantsBudgets,
    ...(firstCategoryId ? { firstCategoryId } : {}),
  };
  await ctx.db.patch(workspaceId, { defaultFinancialAccountProfileId: profileId });
  await ctx.db.insert("personalDefaults", {
    setupResult: result,
    ownerSubject: actor.userId,
    workspaceId,
    financialAccountProfileId: profileId,
    startingMinorUnits: args.startingMinorUnits,
    categorySetupSignature,
    purchaseAlertsConsent,
    wantsBudgets,
    ...(firstCategory ? { firstCategoryId: firstCategory } : {}),
  });
  return result;
}

export async function currencyChangeBlockedReason(
  ctx: Pick<QueryCtx, "db">,
  workspaceId: Id<"workspaces">,
): Promise<Infer<typeof currencyChangeBlock> | null> {
  if (await ctx.db.query("journalEntries").withIndex("by_workspace", q => q.eq("workspaceId", workspaceId)).first())
    return "functional_currency_has_entries";
  const changes = await ctx.db.query("workspaceSettingChanges")
    .withIndex("by_workspace_setting", q => q.eq("workspaceId", workspaceId).eq("setting", "functionalCurrency")).collect();
  if (changes.some(change => change.changed)) return "functional_currency_already_changed";
  for (const table of ["journalLines", "budgetLimitRevisions", "savingsRecoveryPlans", "savingsRecoveryContributions", "savingsRecoveryCorrections"] as const) {
    if (await ctx.db.query(table).withIndex("by_workspace", q => q.eq("workspaceId", workspaceId)).first())
      return "functional_currency_has_records";
  }
  if (await ctx.db.query("ledgerAccountTotals")
    .withIndex("by_workspace_period_account", q => q.eq("workspaceId", workspaceId)).first())
    return "functional_currency_has_records";
  if (await ctx.db.query("notificationIntakeReceipts")
    .withIndex("by_workspace_request", q => q.eq("workspaceId", workspaceId)).first())
    return "functional_currency_has_records";
  for (const table of ["financialAccountOpenings", "financialAccountSetups"] as const) {
    const rows = await ctx.db.query(table).withIndex("by_workspace_idempotency", q => q.eq("workspaceId", workspaceId)).collect();
    if (rows.some(row => row.amount.minorUnits !== 0)) return "functional_currency_has_records";
  }
  return null;
}

async function settingsWorkspace(ctx: QueryCtx, actor: Actor, workspaceId: string) {
  const id = ctx.db.normalizeId("workspaces", workspaceId);
  const workspace = id && await ctx.db.get(id);
  const defaults = await ctx.db.query("personalDefaults")
    .withIndex("by_owner", q => q.eq("ownerSubject", actor.userId)).unique();
  if (!workspace || defaults?.workspaceId !== workspace._id)
    throw new ConvexError({ code: "defaults_unavailable" });
  return { workspace, defaults };
}

export async function readWorkspaceSettings(ctx: QueryCtx, actor: Actor, workspaceId: string) {
  const { workspace, defaults } = await settingsWorkspace(ctx, actor, workspaceId);
  const blocked = await currencyChangeBlockedReason(ctx, workspace._id);
  const timeZone = workspaceTimeZone(workspace);
  return {
    workspaceId, defaultFinancialAccountProfileId: workspace.defaultFinancialAccountProfileId ?? defaults.financialAccountProfileId,
    timeZone, today: calendarDate(new Date(), timeZone), functionalCurrency: workspace.functionalCurrency,
    canChangeFunctionalCurrency: blocked === null, currencyChangeBlockedReason: blocked,
  };
}

function settingReceipt({ _id, _creationTime, ...change }: Doc<"workspaceSettingChanges">): Infer<typeof workspaceSettingReceipt> {
  return { id: _id, ...change };
}

export async function readWorkspaceSettingHistory(ctx: QueryCtx, actor: Actor, workspaceId: string) {
  const { workspace } = await settingsWorkspace(ctx, actor, workspaceId);
  return (await ctx.db.query("workspaceSettingChanges")
    .withIndex("by_workspace_request", q => q.eq("workspaceId", workspace._id)).collect())
    .map(settingReceipt).sort((a, b) => a.changedAt - b.changedAt || a.id.localeCompare(b.id));
}

type SettingIntent = Pick<Infer<typeof workspaceSettingReceipt>, "setting" | "value" | "expectedValue">;

export async function changeWorkspaceSetting(
  ctx: MutationCtx,
  actor: Actor,
  input: SettingIntent & { workspaceId: string; idempotencyKey: string },
): Promise<Infer<typeof workspaceSettingReceipt>> {
  if (!input.idempotencyKey.trim()) throw new AccountingError("idempotency_key_required");
  const { workspace, defaults } = await settingsWorkspace(ctx, actor, input.workspaceId);
  const prior = await ctx.db.query("workspaceSettingChanges")
    .withIndex("by_workspace_request", q => q.eq("workspaceId", workspace._id).eq("idempotencyKey", input.idempotencyKey)).unique();
  if (prior) {
    if (prior.setting !== input.setting || prior.requestedValue !== input.value || prior.expectedValue !== input.expectedValue)
      throw new AccountingError("idempotency_key_conflict");
    return settingReceipt(prior);
  }
  const value = input.setting === "timeZone" ? requireTimeZone(input.value)
    : input.setting === "functionalCurrency" ? requireFunctionalCurrencyCode(input.value) : input.value;
  const current = {
    defaultPlace: workspace.defaultFinancialAccountProfileId ?? defaults.financialAccountProfileId,
    timeZone: workspaceTimeZone(workspace), functionalCurrency: workspace.functionalCurrency,
  }[input.setting];
  if (input.setting === "functionalCurrency") {
    const blocked = await currencyChangeBlockedReason(ctx, workspace._id);
    if (blocked) throw new AccountingError(blocked);
  }
  if (input.setting === "defaultPlace") {
    await requireSelectableDefaultPlace(convexReadStore(ctx.db), {
      actor, workspaceId: input.workspaceId, financialAccountProfileId: value,
    });
  }
  if (current !== input.expectedValue && !(input.setting === "defaultPlace" && current === value)) {
    const code = { defaultPlace: "default_place_stale", timeZone: "time_zone_stale", functionalCurrency: "functional_currency_stale" } as const;
    throw new AccountingError(code[input.setting]);
  }
  if (input.setting === "timeZone" && value !== current) {
    const now = new Date();
    if (calendarDate(now, value).slice(0, 7) < calendarDate(now, current).slice(0, 7))
      throw new AccountingError("time_zone_month_behind");
  }
  if (!defaults.setupResult) {
    const original = await readPersonalDefaults(ctx, actor);
    if (!original) throw new ConvexError({ code: "defaults_unavailable" });
    await ctx.db.patch(defaults._id, { setupResult: await originalSetupResult(ctx, defaults, original.workspace) });
  }
  if (input.setting === "timeZone") {
    const profiles = await ctx.db.query("financialAccountProfiles").withIndex("by_workspace", q => q.eq("workspaceId", workspace._id)).collect();
    for (const profile of profiles) {
      if (!profile.createdAccountingDate) await ctx.db.patch(profile._id, {
        createdAccountingDate: calendarDate(new Date(profile._creationTime), workspaceTimeZone(workspace)),
      });
    }
    await ctx.db.patch(workspace._id, { timeZone: value });
  } else if (input.setting === "functionalCurrency") {
    await ctx.db.patch(workspace._id, { functionalCurrency: value });
    for (const table of ["financialAccountOpenings", "financialAccountSetups"] as const) {
      const rows = await ctx.db.query(table).withIndex("by_workspace_idempotency", q => q.eq("workspaceId", workspace._id)).collect();
      for (const row of rows) await ctx.db.patch(row._id, { originalCurrency: row.originalCurrency ?? row.amount.currency, amount: { ...row.amount, currency: value } });
    }
  } else {
    const id = ctx.db.normalizeId("financialAccountProfiles", value);
    if (!id) throw new AccountingError("financial_account_profile_not_found");
    await ctx.db.patch(workspace._id, { defaultFinancialAccountProfileId: id });
  }
  const receipt = {
    workspaceId: workspace._id, setting: input.setting, previousValue: current, value, requestedValue: input.value,
    expectedValue: input.expectedValue, changed: current !== value, idempotencyKey: input.idempotencyKey,
    changedBy: actor.userId, changedAt: Date.now(),
  };
  const id = await ctx.db.insert("workspaceSettingChanges", receipt);
  return { id, ...receipt };
}

async function originalSetupResult(
  ctx: QueryCtx,
  defaults: Doc<"personalDefaults">,
  workspace: Infer<typeof defaultsValue>["workspace"],
): Promise<Infer<typeof defaultsValue>> {
  const profile = await ctx.db.get(defaults.financialAccountProfileId);
  if (!profile) throw new ConvexError({ code: "defaults_unavailable" });
  const date = calendarDate(new Date(defaults._creationTime), workspace.timeZone);
  return {
    workspace: { ...workspace, currentAccountingPeriod: {
      year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), status: "open",
    } },
    financialAccountProfile: {
      id: profile._id, workspaceId: profile.workspaceId, name: "My money",
      productKind: "cash", ledgerAccountId: profile.postingAccountId,
    },
    purchaseAlertsConsent: defaults.purchaseAlertsConsent ?? false,
    wantsBudgets: defaults.wantsBudgets ?? false,
    ...(defaults.firstCategoryId ? { firstCategoryId: defaults.firstCategoryId } : {}),
  };
}
