import { formatAmount, toMajorUnits } from "../money";
export function compactAmount(amount: number) {
  const absolute = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  const scale = absolute >= 1_000_000 ? 1_000_000 : absolute >= 1000 ? 1000 : 1;
  if (scale === 1) return `${sign}${absolute}`;
  const scaled = absolute / scale;
  const body = scaled.toFixed(scaled >= 10 || Number.isInteger(scaled) ? 0 : 1);
  return `${sign}${body}${scale === 1_000_000 ? "M" : "K"}`;
}

export function currencySymbol(currency: string) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
    .formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
}

export function symbolAmount(minorUnits: number, symbol: string, mode: "compact" | "grouped", currency: string) {
  const absolute = toMajorUnits(Math.abs(minorUnits), currency);
  const body = mode === "compact" ? compactAmount(absolute) : formatAmount(Math.abs(minorUnits), currency, { hideZeroDecimals: true });
  return `${minorUnits < 0 ? "−" : ""}${symbol}${body}`;
}

export function fullAmount(minorUnits: number, symbol: string, currency: string) {
  const body = formatAmount(Math.abs(minorUnits), currency);
  return `${minorUnits < 0 ? "−" : ""}${symbol}${body}`;
}
