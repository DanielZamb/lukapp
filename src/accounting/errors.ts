export const accountingErrorMessages = {
  planning_read_limit: "Too much Posted activity for one complete planning evaluation",
  category_not_found: "User Category not found",
  category_preset_unknown: "Category Preset not found",
  category_unresolved: "Confirm the Category Nature before posting",
  category_inactive: "Category is archived or converted",
  category_nature_mismatch: "Category Nature does not match this flow",
  category_revision_stale: "Category revision changed",
  category_confirmation_required: "Explicit confirmation required",
  category_suggestion_invalid: "This nature is not a current lexicon suggestion",
  category_merge_invalid: "Merge requires different active categories of the same nature",
  reclassification_date_before_source: "Catch-up cannot precede a locked source Accounting Date",
  reclassification_stale: "Reclassification preview changed; preview again",
  reclassification_current_period_required: "Locked corrections require a current open Accounting Period",
  reclassification_target_invalid: "Reclassification target is inconsistent",

  profile_classification_answers_required: "Required profile classification answers are missing or inconsistent",
  activity_before_opening: "Activity cannot precede the profile Start Tracking date",
  opening_already_recorded: "Reverse the active opening before recording a replacement; a zero opening requires its replacement key",
  opening_replacement_conflict: "The replacement must identify the current opening",
  opening_amount_invalid: "Opening amount must be nonnegative whole minor units",
  opening_balance_account_invalid: "Opening counterpart must be Opening Balance Equity",
  account_transfer_same_profile: "Account Transfer requires two different profiles",
  workspace_permission_required: "Workspace permission required",
  personal_workspace_configuration_conflict: "Personal Workspace configuration already selected",
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
  chart_of_accounts_template_not_applicable: "Chart of Accounts template does not apply to this Workspace Kind",
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
