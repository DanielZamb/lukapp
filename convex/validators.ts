import { v } from "convex/values";

export const accountNature = v.union(
  v.literal("Asset"),
  v.literal("Liability"),
  v.literal("Equity"),
  v.literal("Revenue"),
  v.literal("Expense"),
);

export const normalSide = v.union(v.literal("Debit"), v.literal("Credit"));

export const catalogUse = v.union(
  v.literal("expense"),
  v.literal("income"),
  v.literal("openingBalance"),
  v.literal("general"),
);

export const productKind = v.union(
  v.literal("cash"),
  v.literal("bankAccount"),
  v.literal("savingsAccount"),
  v.literal("creditCard"),
  v.literal("loan"),
);

export const postingPolicy = v.union(
  v.literal("cash-expense@1"),
  v.literal("cash-income@1"),
  v.literal("reversal@1"),
  v.literal("account-transfer@1"),
  v.literal("opening-position@1"),
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
  kind: v.union(v.literal("Personal"), v.literal("Household")),
  functionalCurrency: v.string(),
  chartOfAccountsTemplate: v.string(),
  currentAccountingPeriod: accountingPeriod,
});

export const storedOpening = v.union(
  v.object({
    kind: v.literal("zero"),
    accountingDate: v.string(),
    idempotencyKey: v.string(),
    amount: money,
  }),
  v.object({
    kind: v.literal("posted"),
    accountingDate: v.string(),
    idempotencyKey: v.string(),
    amount: money,
    journalEntryId: v.string(),
  }),
);

export const openingStatus = v.union(
  v.object({ status: v.literal("not_started") }),
  v.object({
    status: v.literal("zero"),
    accountingDate: v.string(),
    idempotencyKey: v.string(),
    amount: money,
  }),
  v.object({
    status: v.union(v.literal("posted"), v.literal("reversed")),
    accountingDate: v.string(),
    idempotencyKey: v.string(),
    amount: money,
    journalEntryId: v.string(),
  }),
);

export const financialAccountProfile = v.object({
  id: v.string(),
  workspaceId: v.string(),
  name: v.string(),
  productKind,
  ledgerAccountId: v.string(),
  opening: openingStatus,
});

export const ledgerAccount = v.object({
  id: v.string(),
  code: v.string(),
  name: v.string(),
  nature: accountNature,
  normalSide,
  role: v.literal("Posting"),
  financialAccountProfileId: v.optional(v.string()),
});

export const catalogAccount = v.object({
  code: v.string(),
  name: v.string(),
  nature: accountNature,
  normalSide,
  use: catalogUse,
  reportingConcept: v.optional(v.string()),
  ancestors: v.array(v.object({ code: v.string(), name: v.string() })),
  ledgerAccountId: v.optional(v.string()),
});

export const journalLine = v.object({
  ledgerAccountId: v.string(),
  financialAccountProfileId: v.optional(v.string()),
  code: v.string(),
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
  accountTransfer: v.optional(
    v.object({
      sourceFinancialAccountProfileId: v.string(),
      destinationFinancialAccountProfileId: v.string(),
      sourceNature: accountNature,
      destinationNature: accountNature,
    }),
  ),
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
  code: v.string(),
  name: v.string(),
  nature: accountNature,
  debitMinorUnits: v.number(),
  creditMinorUnits: v.number(),
});

export const openingPositionResult = v.object({
  profile: financialAccountProfile,
  journalEntry: v.union(postedJournalEntry, v.null()),
  replay: v.boolean(),
});
