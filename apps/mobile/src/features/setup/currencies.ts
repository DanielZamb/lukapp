import { functionalCurrencyCodes } from "../../../../../src/accounting/currencies";
import { setup } from "../../../../../src/i18n/catalog/en/setup";
import type { MessageKey, Translator } from "../../../../../src/i18n";

export const commonCurrencies = ["COP", "USD", "EUR", "MXN", "BRL", "ARS"];

/** Names come from the catalog, not the platform: Hermes has no Intl.DisplayNames. */
export function currencyName(code: string, { t }: Translator) {
  const key = `currency.${code}`;
  return key in setup ? t(`setup.${key}` as MessageKey) : code;
}

export function currencyOptions(translator: Translator) {
  return [
    ...commonCurrencies,
    ...[...functionalCurrencyCodes].filter((code) => !commonCurrencies.includes(code)),
  ].map((code) => ({ code, name: currencyName(code, translator) }));
}
