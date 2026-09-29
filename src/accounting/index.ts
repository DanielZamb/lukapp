/**
 * Accounting kernel. Convex wraps these commands in `api.accounting.*`.
 *
 * Record, then correct, a cash expense:
 * 1. `createPersonalWorkspace({ actor, functionalCurrency: "COP" })` provisions the
 *    `personal@1` Chart of Accounts (Expenses, Income, Opening Balance Equity). Pass
 *    `now` (UTC ms) on the Convex mutation.
 * 2. `createFinancialAccountProfile({ name: "Daily", productKind: "bankAccount" })`.
 *    The product kind decides the Posting Account nature: cash and bank accounts are
 *    Assets, credit cards and loans are Liabilities.
 * 3. `recordCashExpense` or `recordCashIncome` with `amount` in Functional Currency,
 *    `accountingDate` as `YYYY-MM-DD`, `description`, and an `idempotencyKey`.
 * 4. `reversePostedEntry({ journalEntryId, idempotencyKey })` posts the mirror entry,
 *    so the pair nets to zero. Then record the corrected activity as a new entry.
 * 5. Read `listJournalEntries`, `balances` (normal-side `balance`), or `trialBalance`.
 *
 * Every write goes through `postJournalEntry` in `posting.ts`. Reuse an idempotency key
 * only for the same command; anything else returns `idempotency_key_conflict`.
 * Failures are `AccountingError` (`code` + `message`), wrapped as ConvexError on the API.
 * Actor `userId` is still caller-supplied until the auth ticket.
 */
export { createAccountingCore } from "./core";
export {
  AccountingError,
  accountingErrorMessages,
  type AccountingErrorCode,
} from "./errors";
export type {
  AccountBalance,
  AccountingCore,
  AccountingPeriod,
  AccountNature,
  Actor,
  CashActivityInput,
  FinancialAccountProductKind,
  FinancialAccountProfile,
  JournalLineView,
  LedgerAccountView,
  Money,
  PeriodStatus,
  PostedJournalEntry,
  PostingPolicy,
  TrialBalanceRow,
  Workspace,
  WorkspaceKind,
} from "./types";
