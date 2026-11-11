import type { Language } from "../../../../../src/i18n";
import { amountFormat } from "./currencyFormat";

/**
 * A short amount such as "1.23M" or "354 mil". The decimal mark follows the currency; only the suffix follows the
 * language. Budget shows up to two decimals of a million; Overview and History show one. The rounding is
 * JavaScript's `toFixed`, as it always was, so ties such as 1,150 still read 1.1K.
 */
export function compactMoney(minorUnits: number, currency: string, language: Language, style: "budget" | "overview") {
  const format = amountFormat(currency);
  const { decimal } = format.convention;
  const amount = Math.abs(minorUnits) / 10 ** format.precision;
  const sign = minorUnits < 0 ? "−" : "";
  const scale = amount >= 1_000_000 ? "millions" : amount >= 1000 ? "thousands" : null;
  if (scale === null) return `${sign}${String(amount).replace(".", decimal)}`;
  const value = amount / (scale === "millions" ? 1_000_000 : 1000);
  const body = value >= 10 || value % 1 === 0 ? value.toFixed(0)
    : style === "budget" && scale === "millions" && Math.round(value * 100) % 10 !== 0 ? value.toFixed(2) : value.toFixed(1);
  const suffix = language === "es" ? `\u00a0${scale === "millions" ? "M" : "mil"}` : scale === "millions" ? "M" : "K";
  return `${sign}${body.replace(".", decimal)}${suffix}`;
}
