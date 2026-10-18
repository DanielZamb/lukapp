import { expect, test, vi } from "vitest";
import { formatMoney, parseMoney } from "./money";

test.each([
  ["-1.234,50", -123450],
  ["−1.234,50", -123450],
  ["-1500", -150000],
  ["0,01", 1],
  ["1.234.567,89", 123456789],
  ["+12,5", 1250],
  [" 0 ", 0],
])("es-CO %s parses to exactly %i minor units", (input, expected) => {
  expect(parseMoney(input, "es-CO")).toBe(expected);
});
test("locale determines decimal and grouping, without guessing", () => {
  expect(parseMoney("-1,234.50", "en-US")).toBe(-123450);
  expect(parseMoney("1.234", "es-CO")).toBe(123400);
});
test("parses exact safe-integer boundaries without BigInt on Hermes", () => {
  vi.stubGlobal("BigInt", undefined);
  try {
    expect(parseMoney("90.071.992.547.409,91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMoney("-90.071.992.547.409,91")).toBe(-Number.MAX_SAFE_INTEGER);
    expect(parseMoney("00090071992547409,90")).toBe(
      Number.MAX_SAFE_INTEGER - 1,
    );
    expect(() => parseMoney("90.071.992.547.409,92")).toThrow(
      "Amount is too large.",
    );
    expect(parseMoney("000,01")).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
test.each([
  "",
  "-",
  "1,234",
  "12.34,50",
  "1.234,567",
  "1,2,3",
  "1e3",
  "NaN",
  "1 234,50",
  "1.23.456",
  "90071992547410",
])("rejects malformed or unsafe input %s", (input) => {
  expect(() => parseMoney(input)).toThrow();
});
test("formats the ledger balance with its currency and two decimal digits", () => {
  expect(formatMoney({ currency: "COP", minorUnits: -150000 })).toBe(
    "−COP 1.500,00",
  );
});
test("hideZeroDecimals drops ,00 when minor units are whole", () => {
  expect(
    formatMoney(
      { currency: "COP", minorUnits: 300_000 },
      { hideZeroDecimals: true },
    ),
  ).toBe("COP 3.000");
  expect(
    formatMoney(
      { currency: "COP", minorUnits: 150_050 },
      { hideZeroDecimals: true },
    ),
  ).toBe("COP 1.500,50");
});
