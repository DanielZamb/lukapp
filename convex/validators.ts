import { v } from "convex/values";

export const money = v.object({
  currency: v.string(),
  minorUnits: v.number(),
});

export const periodKey = v.object({
  year: v.number(),
  month: v.number(),
});

export const accountingPeriod = v.object({
  year: v.number(),
  month: v.number(),
  status: v.union(
    v.literal("open"),
    v.literal("locked"),
    v.literal("not_opened"),
  ),
});

export const workspace = v.object({
  id: v.string(),
  kind: v.literal("Personal"),
  functionalCurrency: v.string(),
  currentAccountingPeriod: accountingPeriod,
});

export const financialAccountProfile = v.object({
  id: v.string(),
  workspaceId: v.string(),
  name: v.string(),
});

export const journalLine = v.object({
  journalEntryId: v.string(),
  ledgerAccountId: v.string(),
  name: v.string(),
  debitMinorUnits: v.number(),
  creditMinorUnits: v.number(),
});

export const postedCashExpense = v.object({
  id: v.string(),
  financialAccountProfileId: v.string(),
  financialAccountProfileName: v.string(),
  description: v.string(),
  accountingDate: v.string(),
  amount: money,
  accountingPeriod,
  replay: v.boolean(),
  lines: v.array(journalLine),
});

export const accountBalance = v.object({
  financialAccountProfileId: v.string(),
  name: v.string(),
  debitMinusCredit: money,
});

export const trialBalanceRow = v.object({
  name: v.string(),
  debitMinorUnits: v.number(),
  creditMinorUnits: v.number(),
});
