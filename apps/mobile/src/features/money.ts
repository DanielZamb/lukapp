import { activeTranslator } from "../i18n/active";
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

export function parseMoney(text: string, currency: string): number {
  const precision = currencyMinorUnitDigits(currency);
  const group = ".";
  const decimal = ",";
  const normalized = text.trim().replace(/^−/, "-");
  const sign = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace(/^[+-]/, "");
  const [whole, fraction = "", ...extra] = unsigned.split(decimal);
  if (!whole || extra.length || (!/^\d*$/.test(fraction) || fraction.length > precision))
    throw new Error(activeTranslator().t("posting.amountDecimals", { precision }));
  const groups = whole.split(group);
  if (
    groups.length > 1 &&
    (!/^\d{1,3}$/.test(groups[0]) ||
      groups.slice(1).some((g) => !/^\d{3}$/.test(g)))
  )
    throw new Error(activeTranslator().t("posting.amountSeparators"));
  const digits = groups.join("");
  if (!/^\d+$/.test(digits)) throw new Error(activeTranslator().t("posting.amountInvalid"));
  const minorDigits =
    `${digits}${fraction.padEnd(precision, "0")}`.replace(/^0+/, "") || "0";
  const max = String(Number.MAX_SAFE_INTEGER);
  if (
    minorDigits.length > max.length ||
    (minorDigits.length === max.length && minorDigits > max)
  )
    throw new Error(activeTranslator().t("posting.amountTooLarge"));
  return sign * Number(minorDigits);
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
