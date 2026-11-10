import { currencyMinorUnitDigits } from "../../../../../src/accounting/currencies";

export type PreCurrencyReading = { kind: "parsed"; minorUnits: number } | { kind: "refused" };

const refused: PreCurrencyReading = { kind: "refused" };

/**
 * A frozen copy of the parser every amount text was saved with before amounts followed the workspace currency:
 * dot groups and comma decimals for every currency, with that currency's precision. It reads stored text only.
 * Typed input never reaches it, and it must not change.
 */
export function readPreCurrencyAmount(text: string, currency: string): PreCurrencyReading {
  const precision = currencyMinorUnitDigits(currency);
  const normalized = text.trim().replace(/^−/, "-");
  const sign = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace(/^[+-]/, "");
  const [whole, fraction = "", ...extra] = unsigned.split(",");
  if (!whole || extra.length || !/^\d*$/.test(fraction) || fraction.length > precision) return refused;
  const groups = whole.split(".");
  if (groups.length > 1 && (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))))
    return refused;
  const digits = groups.join("");
  if (!/^\d+$/.test(digits)) return refused;
  const minorDigits = `${digits}${fraction.padEnd(precision, "0")}`.replace(/^0+/, "") || "0";
  const max = String(Number.MAX_SAFE_INTEGER);
  if (minorDigits.length > max.length || (minorDigits.length === max.length && minorDigits > max)) return refused;
  return { kind: "parsed", minorUnits: sign * Number(minorDigits) };
}
