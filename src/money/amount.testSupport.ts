import type { AmountFormat } from "./amount";

export function naiveRead(text: string, format: AmountFormat): number | null {
  let raw = text.trim();
  let sign = 1;
  if (raw[0] === "-" || raw[0] === "−") { sign = -1; raw = raw.slice(1); }
  else if (raw[0] === "+") raw = raw.slice(1);
  const decimal = format.convention.id === "usd" ? "." : ",";
  const group = format.convention.id === "usd" ? "," : ".";
  const pieces = raw.split(decimal);
  if (pieces.length > 2 || (pieces.length === 2 && (format.precision === 0 || pieces[1].length === 0 || pieces[1].length > format.precision || !/^[0-9]+$/.test(pieces[1])))) return null;
  const chunks = pieces[0].split(group);
  if (chunks.length > 1 && (chunks[0].length < 1 || chunks[0].length > 3 || chunks.slice(1).some(chunk => chunk.length !== 3))) return null;
  if (chunks.some(chunk => !/^[0-9]+$/.test(chunk))) return null;
  let digits = chunks.join("") + (pieces[1] ?? "").padEnd(format.precision, "0");
  while (digits.length > 1 && digits[0] === "0") digits = digits.slice(1);
  if (digits.length > 16 || (digits.length === 16 && digits > "9007199254740991")) return null;
  const value = Number(digits);
  return value === 0 ? 0 : sign * value;
}
