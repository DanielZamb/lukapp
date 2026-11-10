import { v } from "convex/values";
import { categorySelection, categoryStyle } from "./categoryValidators";
import {
  financialAccountProfile,
  money,
  periodKey,
  productKind,
  workspace,
} from "./validators";

export const inWorkspace = { workspaceId: v.string() };
export const workspaceCreation = {
  functionalCurrency: v.string(),
  chartOfAccountsTemplate: v.optional(v.string()),
  timeZone: v.optional(v.string()),
};
export const cashActivity = {
  ...inWorkspace,
  financialAccountProfileId: v.string(),
  amount: money,
  accountingDate: v.string(),
  description: v.string(),
  idempotencyKey: v.string(),
  ledgerAccountCode: v.optional(v.string()),
  userCategoryId: v.optional(v.string()),
  userCategoryIds: v.optional(v.array(v.string())),
  primaryUserCategoryId: v.optional(v.string()),
};
export const profileCreation = {
  ...inWorkspace,
  name: v.string(),
  productKind,
  emoji: v.optional(v.string()),
};
export const periodLock = {
  ...inWorkspace,
  period: periodKey,
  reason: v.optional(v.string()),
};
export const reversal = {
  ...inWorkspace,
  journalEntryId: v.string(),
  accountingDate: v.optional(v.string()),
  description: v.optional(v.string()),
  idempotencyKey: v.string(),
};
export const personalSetup = {
  functionalCurrency: v.string(),
  startingMinorUnits: v.number(),
  categories: v.optional(v.array(categorySelection)),
  timeZone: v.string(),
  purchaseAlertsConsent: v.optional(v.boolean()),
  wantsBudgets: v.optional(v.boolean()),
};
export const categoryCreation = {
  ...inWorkspace,
  selection: categorySelection,
};
export const categoryRestyle = {
  ...inWorkspace,
  categoryId: v.string(),
  style: categoryStyle,
};
export const categoryUpdate = { ...categoryRestyle, name: v.string() };
export const categoryDelete = { ...inWorkspace, categoryId: v.string() };
export const defaults = v.object({
  workspace,
  financialAccountProfile,
  purchaseAlertsConsent: v.optional(v.boolean()),
  wantsBudgets: v.optional(v.boolean()),
  firstCategoryId: v.optional(v.string()),
});

export const openingPosition = {
  ...inWorkspace,
  financialAccountProfileId: v.string(),
  amount: money,
  accountingDate: v.string(),
  description: v.string(),
  idempotencyKey: v.string(),
};
export const accountTransfer = {
  ...inWorkspace,
  sourceFinancialAccountProfileId: v.string(),
  destinationFinancialAccountProfileId: v.string(),
  amount: money,
  accountingDate: v.string(),
  description: v.string(),
  idempotencyKey: v.string(),
  userCategoryId: v.optional(v.string()),
  userCategoryIds: v.optional(v.array(v.string())),
  primaryUserCategoryId: v.optional(v.string()),
};
export const accountRename = {
  workspaceId: v.string(), financialAccountProfileId: v.string(),
  name: v.string(), expectedName: v.string(),
};
export const accountLook = {
  ...inWorkspace,
  financialAccountProfileId: v.string(),
  emoji: v.string(),
};
export const accountSetup = {
  ...profileCreation,
  amount: money,
  accountingDate: v.string(),
  idempotencyKey: v.string(),
};

export const defaultPlaceChange = {
  ...inWorkspace, financialAccountProfileId: v.string(),
  expectedFinancialAccountProfileId: v.string(), idempotencyKey: v.string(),
};
export const timeZoneChange = {
  ...inWorkspace, timeZone: v.string(), expectedTimeZone: v.string(), idempotencyKey: v.string(),
};
export const functionalCurrencyChange = {
  ...inWorkspace, functionalCurrency: v.string(), expectedFunctionalCurrency: v.string(), idempotencyKey: v.string(),
};
export const workspaceSettingFields = {
  workspaceId: v.string(),
  setting: v.union(v.literal("defaultPlace"), v.literal("timeZone"), v.literal("functionalCurrency")),
  previousValue: v.string(), value: v.string(), requestedValue: v.string(), expectedValue: v.string(), changed: v.boolean(),
  idempotencyKey: v.string(), changedBy: v.string(), changedAt: v.number(),
};
export const workspaceSettingReceipt = v.object({ ...workspaceSettingFields, id: v.string() });
export const currencyChangeBlock = v.union(
  v.literal("functional_currency_has_entries"), v.literal("functional_currency_has_records"),
  v.literal("functional_currency_already_changed"),
);
export const workspaceSettings = v.object({
  workspaceId: v.string(), defaultFinancialAccountProfileId: v.string(), timeZone: v.string(),
  functionalCurrency: v.string(), today: v.string(), canChangeFunctionalCurrency: v.boolean(),
  currencyChangeBlockedReason: v.union(v.null(), currencyChangeBlock),
});
