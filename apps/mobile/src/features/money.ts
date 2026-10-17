// The pilot supports COP and USD, both with two minor-unit digits.
export function parseMoney(text: string, locale = "es-CO"): number {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const group = parts.find((p) => p.type === "group")?.value ?? ".";
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ",";
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
  const minor = BigInt(digits) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Amount is too large.");
  return sign * Number(minor);
}

export function formatMoney(amount: { currency: string; minorUnits: number }) {
  return `${amount.minorUnits < 0 ? "−" : ""}${amount.currency} ${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount.minorUnits) / 100)}`;
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
