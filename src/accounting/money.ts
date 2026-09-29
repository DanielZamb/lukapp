import { functionalCurrencyCodes } from "./currencies";
import { AccountingError } from "./errors";
import type { Money, StoredWorkspace } from "./types";

export function requireFunctionalCurrencyCode(currency: string): string {
  if (!functionalCurrencyCodes.has(currency)) {
    throw new AccountingError("functional_currency_invalid");
  }
  return currency;
}

/** A positive whole number of minor units in the Workspace Functional Currency. */
export function requireFunctionalAmount(
  workspace: StoredWorkspace,
  amount: Money,
): number {
  if (!Number.isSafeInteger(amount.minorUnits) || amount.minorUnits <= 0) {
    throw new AccountingError("amount_must_be_positive");
  }
  if (amount.currency !== workspace.functionalCurrency) {
    throw new AccountingError("currency_mismatch");
  }
  return amount.minorUnits;
}
