import type { Language } from "../../../../../src/i18n";
import { compactMoney } from "../amount/compact";
import { formatAmount } from "../money";

export function compactAmount(minorUnits: number, currency: string, language: Language) {
  return compactMoney(minorUnits, currency, language, "overview");
}

export function symbolAmount(minorUnits: number, symbol: string, mode: "compact" | "grouped", currency: string, language: Language) {
  const body = mode === "compact" ? compactAmount(Math.abs(minorUnits), currency, language) : formatAmount(Math.abs(minorUnits), currency, { hideZeroDecimals: true });
  return `${minorUnits < 0 ? "−" : ""}${symbol}${body}`;
}

export function fullAmount(minorUnits: number, symbol: string, currency: string) {
  const body = formatAmount(Math.abs(minorUnits), currency);
  return `${minorUnits < 0 ? "−" : ""}${symbol}${body}`;
}
