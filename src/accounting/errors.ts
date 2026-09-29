export const accountingErrorMessages = {
  workspace_membership_required: "Workspace Membership required",
  functional_currency_invalid: "Functional Currency must be a three-letter ISO 4217 code",
  currency_mismatch: "Amount must be in the Workspace Functional Currency",
  amount_must_be_positive: "amount must be positive",
  accounting_date_required: "Accounting Date required",
  accounting_period_not_found: "Accounting Period not found",
  accounting_period_invalid: "Accounting Period must be a real year and month",
  clock_required: "Clock required",
  name_required: "Name required",
  idempotency_key_required: "Idempotency key required",
  idempotency_key_conflict: "Idempotency key already used",
  locked_period: "Locked Period",
  financial_account_profile_not_found: "Financial Account Profile not found",
  financial_account_product_kind_unknown: "Financial Account product kind not recognized",
  ledger_account_not_found: "Ledger Account not found",
  system_account_not_found: "Chart of Accounts is missing a required account",
  journal_entry_incomplete: "Posted Journal Entry needs at least two lines",
  journal_line_invalid: "Journal Line needs exactly one positive side",
  posted_journal_entry_unbalanced: "Posted Journal Entry must be balanced",
  journal_entry_not_found: "Journal Entry not found",
  journal_entry_already_reversed: "Journal Entry already reversed",
  reversal_cannot_be_reversed: "A Reversal Entry cannot be reversed; record a new entry instead",
  reversal_date_before_original: "A Reversal Entry cannot precede the entry it reverses",
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
