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
export const defaults = v.object({ workspace, financialAccountProfile });

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
};
export const accountSetup = {
  ...profileCreation,
  amount: money,
  accountingDate: v.string(),
  idempotencyKey: v.string(),
};
