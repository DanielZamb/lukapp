/**
 * Accounting kernel. Convex wraps these commands in `api.accounting.*`.
 *
 * Post a cash expense:
 * 1. `createPersonalWorkspace({ actor, functionalCurrency })` — pass `now` (UTC ms)
 *    on the Convex mutation; queries cannot call `Date.now()`.
 * 2. `createFinancialAccountProfile({ workspaceId, name: "Daily" })`.
 * 3. `recordCashExpense` with `amount` in that Functional Currency, `accountingDate`
 *    as UTC `YYYY-MM-DD`, `description`, and an `idempotencyKey`.
 * 4. Read `listPostedCashExpenses` or `balances`.
 *
 * A cash expense debits Expenses and credits the profile's Posting Account, so
 * `balances[]` shows `creditMinorUnits: 150000` and `debitMinusCredit: -150000`.
 * Reuse the same idempotency key only for the same command; a different date,
 * amount, profile, description, or currency returns `idempotency_key_conflict`.
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
  Actor,
  FinancialAccountProfile,
  JournalLine,
  Money,
  PeriodStatus,
  PostedCashExpense,
  TrialBalanceRow,
  Workspace,
  WorkspaceKind,
} from "./types";
