export const accountingErrorMessages = {
  workspace_membership_required: "Workspace Membership required",
  amount_must_be_positive: "amount must be positive",
  functional_currency_required: "Functional Currency required",
  accounting_date_required: "Accounting Date required",
  clock_required: "Clock required",
  idempotency_key_required: "Idempotency key required",
  locked_period: "Locked Period",
  financial_account_profile_not_found: "Financial Account Profile not found",
  accounting_period_not_found: "Accounting Period not found",
  expense_account_not_found: "Expense account not found",
  posted_journal_entry_unbalanced: "Posted Journal Entry must be balanced",
  idempotency_key_conflict: "Idempotency key already used",
} as const;

export type AccountingErrorCode = keyof typeof accountingErrorMessages;

export class AccountingError extends Error {
  readonly code: AccountingErrorCode;

  constructor(code: AccountingErrorCode) {
    super(accountingErrorMessages[code]);
    this.name = "AccountingError";
    this.code = code;
  }
}
