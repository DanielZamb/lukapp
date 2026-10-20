import { currencyMinorUnitDigits } from "../../../../src/accounting/currencies";

export function formatMoneyInput(raw: string, currency: string): string {
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

function localeSeparators(locale: string): { group: string; decimal: string } {
  if (locale === "en-US") {
    return { group: ",", decimal: "." };
  }
  return { group: ".", decimal: "," };
}

export function parseMoney(text: string, locale = "es-CO", currency = "COP"): number {
  const precision = currencyMinorUnitDigits(currency);
  const { group, decimal } = localeSeparators(locale);
  const normalized = text.trim().replace(/^−/, "-");
  const sign = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace(/^[+-]/, "");
  const [whole, fraction = "", ...extra] = unsigned.split(decimal);
  if (!whole || extra.length || (!/^\d*$/.test(fraction) || fraction.length > precision))
    throw new Error(`Enter an amount with up to ${precision} decimal places.`);
  const groups = whole.split(group);
  if (
    groups.length > 1 &&
    (!/^\d{1,3}$/.test(groups[0]) ||
      groups.slice(1).some((g) => !/^\d{3}$/.test(g)))
  )
    throw new Error("Check the thousands separators.");
  const digits = groups.join("");
  if (!/^\d+$/.test(digits)) throw new Error("Enter a valid amount.");
  const minorDigits =
    `${digits}${fraction.padEnd(precision, "0")}`.replace(/^0+/, "") || "0";
  const max = String(Number.MAX_SAFE_INTEGER);
  if (
    minorDigits.length > max.length ||
    (minorDigits.length === max.length && minorDigits > max)
  )
    throw new Error("Amount is too large.");
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
  const digits = currencyMinorUnitDigits(currency);
  const raw = String(Math.abs(minorUnits)).padStart(digits + 1, "0");
  const whole = digits === 0 ? raw : raw.slice(0, -digits);
  const fraction = digits === 0 ? "" : raw.slice(-digits);
  const showFraction = digits > 0 && !(options?.hideZeroDecimals && Number(fraction) === 0);
  return `${minorUnits < 0 ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${showFraction ? `,${fraction}` : ""}`;
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
