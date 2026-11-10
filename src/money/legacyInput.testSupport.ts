import { currencyMinorUnitDigits } from "../accounting/currencies";

/** A frozen copy of the sanitizer the amount fields used before the strict editor, kept only as a test oracle. */
export function legacyFormatMoneyInput(raw: string, currency: string): string {
  const digits = currencyMinorUnitDigits(currency);
  const minus = raw.includes("-") || raw.includes("−");
  const plus = raw.includes("+");
  const sign = minus && !plus
    ? "-"
    : plus && !minus
      ? "+"
      : raw.startsWith("-") || raw.startsWith("−")
        ? "-"
        : raw.startsWith("+")
          ? "+"
          : "";

  let rest = raw.replace(/[+\-−]/g, "");
  if (digits === 0 && rest.includes(",")) return `${sign}${rest.replace(/[^\d.,]/g, "")}`;
  if (digits > 0 && !rest.includes(",")) {
    const parts = rest.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 2 && last.length !== 3 && /^\d*$/.test(parts[0] ?? "") && new RegExp(`^\\d{0,${digits}}$`).test(last)) {
      rest = `${parts[0]},${last}`;
    } else if (rest.endsWith(".") && parts.length > 2) {
      rest = `${rest.slice(0, -1)},`;
    }
  }

  const commaAt = rest.indexOf(",");
  const intRaw = (commaAt === -1 ? rest : rest.slice(0, commaAt)).replace(/\D/g, "");
  const decRaw =
    commaAt === -1 ? null : rest.slice(commaAt + 1).replace(/\D/g, "").slice(0, digits);

  if (!intRaw && decRaw === null) {
    return sign;
  }

  const grouped = intRaw.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decRaw === null ? `${sign}${grouped}` : `${sign}${grouped},${decRaw}`;
}
