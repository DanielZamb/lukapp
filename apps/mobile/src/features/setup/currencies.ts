import { functionalCurrencyCodes } from "../../../../../src/accounting/currencies";

export const commonCurrencies = ["COP", "USD", "EUR", "MXN", "BRL", "ARS"];
const names = new Intl.DisplayNames(["en"], { type: "currency" });
export function currencyName(code: string) {
  return names.of(code) ?? code;
}
export const currencyOptions = [
  ...commonCurrencies,
  ...[...functionalCurrencyCodes].filter(
    (code) => !commonCurrencies.includes(code),
  ),
].map((code) => ({ code, name: currencyName(code) }));
