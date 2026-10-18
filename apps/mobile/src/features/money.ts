// The pilot supports COP and USD, both with two minor-unit digits.
function localeSeparators(locale: string): { group: string; decimal: string } {
  if (locale === "en-US") {
    return { group: ",", decimal: "." };
  }
  // es-CO and the mobile default: dots group thousands, comma is decimal.
  return { group: ".", decimal: "," };
}

export function parseMoney(text: string, locale = "es-CO"): number {
  const { group, decimal } = localeSeparators(locale);
  const normalized = text.trim().replace(/^−/, "-");
  const sign = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace(/^[+-]/, "");
  const [whole, fraction = "", ...extra] = unsigned.split(decimal);
  if (!whole || extra.length || !/^\d{0,2}$/.test(fraction))
    throw new Error("Enter an amount with up to two decimal places.");
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
    `${digits}${fraction.padEnd(2, "0")}`.replace(/^0+/, "") || "0";
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

export function formatMoney(
  amount: { currency: string; minorUnits: number },
  options?: FormatMoneyOptions,
) {
  const absMinor = Math.abs(amount.minorUnits);
  const hideZeroDecimals =
    options?.hideZeroDecimals === true && absMinor % 100 === 0;
  const fractionDigits = hideZeroDecimals
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `${amount.minorUnits < 0 ? "−" : ""}${amount.currency} ${new Intl.NumberFormat("es-CO", fractionDigits).format(absMinor / 100)}`;
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
