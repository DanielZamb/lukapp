import { currencyAmountConvention, currencyMinorUnitDigits } from "../../../../../src/accounting/currencies";
import type { AmountFormat } from "../../../../../src/money/amount";
import { amountTextFormatOf, type AmountTextFormat } from "./storedText";

/** The format amounts in `currency` are shown and typed in, whatever the app language. An unsupported currency throws. */
export function amountFormat(currency: string): AmountFormat {
  return { convention: currencyAmountConvention(currency), precision: currencyMinorUnitDigits(currency) };
}

/** The grammar text typed today in `currency` is saved with. */
export function currentAmountTextFormat(currency: string): AmountTextFormat {
  return amountTextFormatOf(currencyAmountConvention(currency));
}
