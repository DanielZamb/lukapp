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

export function symbolAmount(minorUnits: number, symbol: string, mode: "compact" | "grouped") {
  const absolute = Math.abs(minorUnits) / 100;
  const body = mode === "compact" ? compactAmount(absolute) : absolute.toLocaleString("es-CO");
  return `${minorUnits < 0 ? "−" : ""}${symbol}${body}`;
}

export function fullAmount(minorUnits: number, symbol: string) {
  const body = (Math.abs(minorUnits) / 100).toLocaleString("es-CO", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `${minorUnits < 0 ? "−" : ""}${symbol}${body}`;
}
