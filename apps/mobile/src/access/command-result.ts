import { ConvexError } from "convex/values";

const commandDomainCodes = [
  "opening_amount_invalid", "opening_already_recorded", "opening_replacement_conflict",
  "financial_account_profile_not_found", "profile_classification_answers_required", "activity_before_opening",
  "locked_period", "idempotency_key_conflict", "first_run_already_completed", "personal_workspace_configuration_conflict",
  "first_run_categories_invalid", "first_run_spend_category_required",
  "functional_currency_invalid", "currency_mismatch", "amount_must_be_positive", "accounting_date_required",
  "accounting_period_not_found", "accounting_period_invalid", "name_required", "cash_expense_account_invalid",
  "category_not_found", "category_unresolved", "category_inactive", "category_nature_mismatch",
] as const;
export type CommandDomainCode = typeof commandDomainCodes[number];
export async function commandResult<T>(request: () => Promise<T>): Promise<
  { kind: "accepted"; value: T } | { kind: "rejected"; code: CommandDomainCode }
> {
  try { return { kind: "accepted", value: await request() }; }
  catch (error) {
    const data = error instanceof ConvexError ? error.data : null;
    if (typeof data === "object" && data !== null && "code" in data) {
      const code = commandDomainCodes.find(code => code === data.code);
      if (code) return { kind: "rejected", code };
    }
    throw error;
  }
}
export function commandErrorCopy(code: CommandDomainCode) {
  switch (code) {
    case "locked_period": return "That date is in a closed month. Your confirmed details are unchanged.";
    case "idempotency_key_conflict": return "These details conflict with a previous submission. Check the earlier result before retrying.";
    case "financial_account_profile_not_found": return "That account is no longer available. Your confirmed details are unchanged.";
    case "first_run_already_completed": return "Setup is already complete. Return to your money to refresh.";
    case "personal_workspace_configuration_conflict": return "Your existing setup uses different settings. Your money was not changed.";
    default: return "Those details could not be accepted. Your confirmed details are unchanged.";
  }
}
