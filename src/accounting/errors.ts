export const accountingErrorMessages = {
  transfer_profiles_must_differ: "Choose two different places for an Account Transfer",
  opening_already_exists: "Reverse the active starting amount before replacing it",
  activity_before_opening: "Activity cannot be dated before this place's starting date",
  opening_after_activity: "The starting date cannot follow existing activity",
  opening_amount_invalid: "Enter zero or a positive starting amount on the account's normal side",
  account_setup_conflict: "This account setup was already submitted with different answers",
  category_selection_invalid: "Choose each category once using one selection format",
  category_limit_exceeded: "Choose up to three categories, or create one that encompasses the concept",
  category_primary_invalid: "The primary category must belong to the selection",
  category_primary_required: "Choose which category best describes this expense",
  category_not_found: "Category not found",
  category_nature_required: "Choose what happens to the money before posting",
  category_nature_mismatch: "Category does not match the money direction",
  category_preset_unknown: "Category suggestion not found",
  category_name_conflict: "A category with this name already has a different classification",
  workspace_membership_required: "Workspace Membership required",
  functional_currency_invalid: "Functional Currency must be an active ISO 4217 currency code",
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
  chart_of_accounts_template_unknown: "Chart of Accounts template not recognized",
  ledger_account_code_unknown: "Account code is not in the Chart of Accounts template",
  cash_expense_account_invalid: "Account cannot record a cash expense",
  cash_income_account_invalid: "Account cannot record cash income",
  auxiliary_accounts_exhausted: "No auxiliary account codes left under this account",
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
