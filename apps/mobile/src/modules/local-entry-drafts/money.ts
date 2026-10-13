import { functionalCurrencyCodes, functionalCurrencyDigits } from "../../../../../src/accounting/currencies";
import { periodFromAccountingDate } from "../../../../../src/accounting/period";

export function validAccountingDate(value: string): boolean {
  try { periodFromAccountingDate(value); return true; } catch { return false; }
}

export function parseAmount(text: string, currency: string): number | null {
  if (!functionalCurrencyCodes.has(currency) || !/^\d+(\.\d+)?$/.test(text.trim())) return null;
  const digits = functionalCurrencyDigits(currency);
  const [whole = "", fraction = ""] = text.trim().split(".");
  if (fraction.length > digits) return null;
  const value = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function today() {
  const now = new Date();
  return String(now.getFullYear()) + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}
