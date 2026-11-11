import { currencyMinorUnitDigits } from "../../../../src/accounting/currencies";
import { formatMinorUnits } from "../../../../src/money/amount";
import { amountFormat } from "./amount/currencyFormat";

export function currencyDisplayPrefix(currency: string) {
  if (currency === "COP" || currency === "USD") return "$";
  const formatted = new Intl.NumberFormat("es-CO", {
    style: "currency", currency, currencyDisplay: "narrowSymbol",
    useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(0);
  const [before = "", after, extra] = formatted.split("0");
  const prefix = before.trim();
  const suffix = after?.trim() ?? "";
  const symbol = after !== undefined && extra === undefined && !(prefix && suffix)
    ? prefix || suffix || currency : currency;
  return /^[A-Z]{3}$/.test(symbol) ? `${symbol} ` : symbol;
}

export type FormatMoneyOptions = {
  hideZeroDecimals?: boolean;
};

export function minorUnitFactor(currency: string): number {
  return 10 ** currencyMinorUnitDigits(currency);
}

export function toMajorUnits(minorUnits: number, currency: string): number {
  return minorUnits / minorUnitFactor(currency);
}

export function formatAmount(minorUnits: number, currency: string, options?: FormatMoneyOptions): string {
  return formatMinorUnits(minorUnits, amountFormat(currency), options);
}

export function formatMoney(
  amount: { currency: string; minorUnits: number },
  options?: FormatMoneyOptions,
) {
  return `${amount.minorUnits < 0 ? "−" : ""}${amount.currency} ${formatAmount(Math.abs(amount.minorUnits), amount.currency, options)}`;
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
