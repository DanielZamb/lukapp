import { v } from "convex/values";

export const accountNature = v.union(
  v.literal("Asset"),
  v.literal("Liability"),
  v.literal("Equity"),
  v.literal("Revenue"),
  v.literal("Expense"),
);

export const systemAccountKey = v.union(
  v.literal("expenses"),
  v.literal("income"),
  v.literal("openingBalanceEquity"),
);

export const productKind = v.union(
  v.literal("cash"),
  v.literal("bankAccount"),
  v.literal("creditCard"),
  v.literal("loan"),
);

export const postingPolicy = v.union(
  v.literal("cash-expense@1"),
  v.literal("cash-income@1"),
  v.literal("reversal@1"),
);

export const periodStatus = v.union(v.literal("open"), v.literal("locked"));

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
  chartOfAccountsTemplate: v.string(),
  currentAccountingPeriod: accountingPeriod,
});

export const financialAccountProfile = v.object({
  id: v.string(),
  workspaceId: v.string(),
  name: v.string(),
  productKind,
  ledgerAccountId: v.string(),
});

export const ledgerAccount = v.object({
  id: v.string(),
  name: v.string(),
  nature: accountNature,
  role: v.literal("Posting"),
  systemKey: v.optional(systemAccountKey),
  financialAccountProfileId: v.optional(v.string()),
});

export const journalLine = v.object({
  ledgerAccountId: v.string(),
  name: v.string(),
  nature: accountNature,
  debitMinorUnits: v.number(),
  creditMinorUnits: v.number(),
});

export const postedJournalEntry = v.object({
  id: v.string(),
  policy: postingPolicy,
  description: v.string(),
  accountingDate: v.string(),
  accountingPeriod,
  amount: money,
  financialAccountProfileId: v.optional(v.string()),
  financialAccountProfileName: v.optional(v.string()),
  reversesEntryId: v.optional(v.string()),
  reversedByEntryId: v.optional(v.string()),
  postedBy: v.string(),
  postedAt: v.number(),
  replay: v.boolean(),
  lines: v.array(journalLine),
});

export const accountBalance = v.object({
  financialAccountProfileId: v.string(),
  name: v.string(),
  nature: accountNature,
  debitMinorUnits: v.number(),
  creditMinorUnits: v.number(),
  balance: money,
});

export const trialBalanceRow = v.object({
  ledgerAccountId: v.string(),
  name: v.string(),
  nature: accountNature,
  debitMinorUnits: v.number(),
  creditMinorUnits: v.number(),
});
