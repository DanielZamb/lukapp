/**
 * Accounting kernel. Public `api.accounting.*` wrappers derive Actor from the
 * authenticated Owner identity and run each command in one Convex transaction.
 *
 * Start Tracking, record activity, then correct:
 * 1. `createPersonalWorkspace` provisions the selected Chart of Accounts in
 *    Functional Currency. The default is `co-puc-personal@1`; callers may choose
 *    `us-gaap-personal@1`. The public mutation takes `now` in UTC milliseconds.
 * 2. `setupFinancialAccount({ workspaceId, name, productKind, amount, accountingDate,
 *    description, idempotencyKey })` creates the profile and opening atomically.
 *    Use `recordOpeningPosition` with `financialAccountProfileId` for an existing
 *    profile. A zero amount establishes the date without a Journal Entry.
 * 3. `recordCashExpense`, `recordCashIncome`, or `recordAccountTransfer` posts
 *    activity in Functional Currency. Transfers debit the destination and credit
 *    the source, including liability profiles. Every linked profile enforces its
 *    opening date. `listCatalogAccounts` supplies expense and income choices.
 * 4. `reversePostedEntry({ journalEntryId, idempotencyKey })` posts the mirror
 *    entry. Replace an opening with a fresh key and a date that leaves ordinary
 *    profile activity on or after the cutover. A zero correction also requires
 *    `replacesOpeningKey` identifying the current receipt.
 * 5. Read `listFinancialAccountProfiles` for opening state, `listJournalEntries`
 *    with an optional profile filter, `balances`, or `trialBalance`.
 *
 * Every General Ledger write goes through `postJournalEntry` in `posting.ts`.
 * Opening receipts and profile snapshots share the command transaction. Opening
 * retries return the original receipt and current profile state. Changed command
 * facts return `idempotency_key_conflict`. Failures are `AccountingError`, mapped
 * to ConvexError with `code` and `message` by the public wrappers.
 */
export { createAccountingCore } from "./core";
export {
  AccountingError,
  accountingErrorMessages,
  type AccountingErrorCode,
} from "./errors";
export type {
  AccountBalance,
  AccountTransferInput,
  OpeningPositionInput,
  OpeningPositionResult,
  OpeningStatus,
  SetupFinancialAccountInput,
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
