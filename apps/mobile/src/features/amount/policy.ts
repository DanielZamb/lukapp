import {
  currencyAmountConvention,
  currencyMinorUnitDigits,
  legacyAmountConvention,
} from "../../../../../src/accounting/currencies";
import type { AmountFormat } from "../../../../../src/money/amount";

/** Whether amounts are shown and typed in the workspace currency's convention instead of the Colombian style for all. */
export const amountsFollowCurrency: boolean = false;

/** The format amounts in `currency` are shown and typed in. An unsupported currency throws. */
export function amountFormat(currency: string): AmountFormat {
  const convention = currencyAmountConvention(currency);
  return { convention: amountsFollowCurrency ? convention : legacyAmountConvention, precision: currencyMinorUnitDigits(currency) };
}
