/**
 * Accounting kernel. Convex wraps these commands in `api.accounting.*`.
 *
 * Record, then correct, a cash expense:
 * 1. `createPersonalWorkspace({ actor, functionalCurrency: "COP" })` provisions the
 *    sparse `co-puc-personal@1` Chart of Accounts: 313001 Patrimonio de apertura,
 *    42959595 Otros ingresos, 51959595 Otros gastos personales. Pass `now` (UTC ms)
 *    on the Convex mutation.
 * 2. `createFinancialAccountProfile({ name: "Nu", productKind: "bankAccount" })`.
 *    The product kind decides the PUC parent and so the nature: the profile gets its
 *    own auxiliary Posting Account, such as 11100501 under 111005 Bancos.
 * 3. `recordCashExpense` or `recordCashIncome` with `amount` in Functional Currency,
 *    `accountingDate` as `YYYY-MM-DD`, `description`, an `idempotencyKey`, and an
 *    optional `ledgerAccountCode` such as "530505" (Gastos bancarios). The code must
 *    be a template expense account for an expense and an income account for income;
 *    `listCatalogAccounts` lists them. The account is activated on first use.
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
  CatalogAccountView,
  CatalogUse,
  FinancialAccountProductKind,
  FinancialAccountProfile,
  JournalLineView,
  LedgerAccountView,
  Money,
  NormalSide,
  PeriodStatus,
  PostedJournalEntry,
  PostingPolicy,
  TrialBalanceRow,
  Workspace,
  WorkspaceKind,
} from "./types";
