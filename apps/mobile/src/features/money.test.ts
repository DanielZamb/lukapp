import { expect, test, vi } from "vitest";
import { formatMoney, currencyDisplayPrefix } from "./money";
import { createTranslator } from "../../../../src/i18n";
import { amountHint } from "./amount/hints";
import { sendableMinorUnits, openAmount, withNativeText } from "./amount/session";
import { pressed } from "./amount/pressed.testSupport";

function typed(currency: string, keys: string) {
  let session = openAmount(currency);
  for (const key of keys) session = withNativeText(session, session.editor.text + key);
  return session;
}

test.each([
  ["-012500", "-012500", -1250000],
  ["+12500", "+12500", 1250000],
  ["−12500", "−12500", -1250000],
  ["-1.234,56", "-1.234,56", -123456],
])("typing %s in a COP field shows exactly %s", (keys, text, minorUnits) => {
  const session = typed("COP", keys);
  expect(session.editor.text).toBe(text);
  expect(sendableMinorUnits(pressed(session), "COP")).toBe(minorUnits);
});

test("typing and reading an amount work without Intl on Hermes", () => {
  vi.stubGlobal("Intl", undefined);
  try {
    expect(sendableMinorUnits(pressed(typed("COP", "-012500")), "COP")).toBe(-1250000);
    expect(sendableMinorUnits(pressed(typed("USD", "-1,234.5")), "USD")).toBe(-123450);
  } finally {
    vi.unstubAllGlobals();
  }
});

test.each([
  ["-1.234,50", -123450],
  ["−1.234,50", -123450],
  ["-1500", -150000],
  ["0,01", 1],
  ["1.234.567,89", 123456789],
  ["+12,5", 1250],
  [" 0 ", 0],
])("COP %s reads as exactly %i minor units", (input, expected) => {
  expect(sendableMinorUnits(pressed(openAmount("COP", input)), "COP")).toBe(expected);
});
test("a dot groups thousands in COP, without guessing", () => {
  expect(sendableMinorUnits(pressed(openAmount("COP", "1.234")), "COP")).toBe(123400);
});
test("parses exact safe-integer boundaries without BigInt on Hermes", () => {
  vi.stubGlobal("BigInt", undefined);
  try {
    const read = (text: string) => sendableMinorUnits(pressed(openAmount("COP", text)), "COP");
    expect(read("90.071.992.547.409,91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(read("-90.071.992.547.409,91")).toBe(-Number.MAX_SAFE_INTEGER);
    expect(read("00090071992547409,90")).toBe(Number.MAX_SAFE_INTEGER - 1);
    expect(read("90.071.992.547.409,92")).toBeNull();
    expect(amountHint(openAmount("COP", "90.071.992.547.409,92"), createTranslator("en").t)).toBe("This amount is too large.");
    expect(read("000,01")).toBe(1);
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
  expect(sendableMinorUnits(pressed(openAmount("COP", input)), "COP")).toBeNull();
});
test.each([["COP", "$"], ["USD", "$"], ["EUR", "€"], ["JPY", "¥"], ["AED", "AED "]])("currency %s has display prefix %s without formatToParts", (currency, expected) => {
  const formatToParts = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, "formatToParts");
  Reflect.deleteProperty(Intl.NumberFormat.prototype, "formatToParts");
  try {
    expect(currencyDisplayPrefix(currency)).toBe(expected);
  } finally {
    if (formatToParts) Object.defineProperty(Intl.NumberFormat.prototype, "formatToParts", formatToParts);
  }
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


test.each([
  ["JPY", "100", 100, "JPY 100"],
  ["BHD", "1,234", 1234, "BHD 1,234"],
  ["USD", "1.23", 123, "USD 1.23"],
])("%s input and display preserve ISO minor-unit precision", (currency, text, minorUnits, formatted) => {
  expect(sendableMinorUnits(pressed(openAmount(currency, text)), currency)).toBe(minorUnits);
  expect(formatMoney({ currency, minorUnits })).toBe(formatted);
});

test.each([["JPY", "1,1"], ["BHD", "1,2345"]])("%s rejects fractional digits beyond its precision", (currency, text) => {
  expect(sendableMinorUnits(pressed(openAmount(currency, text)), currency)).toBeNull();
});


test("currency-aware editing preserves three decimal places and rejects fractions for yen", () => {
  expect(typed("BHD", "1,234").editor.text).toBe("1,234");
  expect(sendableMinorUnits(pressed(typed("BHD", "1,234")), "BHD")).toBe(1234);
  const yen = typed("JPY", "100,5");
  expect(yen.editor.text).toBe("100,5");
  expect(sendableMinorUnits(pressed(yen), "JPY")).toBeNull();
});

test("full monetary display preserves exact safe-integer boundaries without Intl", () => {
  vi.stubGlobal("Intl", undefined);
  try {
    expect(formatMoney({ currency: "COP", minorUnits: Number.MAX_SAFE_INTEGER })).toBe("COP 90.071.992.547.409,91");
    expect(formatMoney({ currency: "BHD", minorUnits: Number.MAX_SAFE_INTEGER })).toBe("BHD 9.007.199.254.740,991");
    expect(formatMoney({ currency: "JPY", minorUnits: Number.MAX_SAFE_INTEGER })).toBe("JPY 9.007.199.254.740.991");
  } finally { vi.unstubAllGlobals(); }
});


test("typing in zero- and three-decimal currencies keeps the text exactly as typed", () => {
  expect(typed("JPY", "10005").editor.text).toBe("10005");
  expect(sendableMinorUnits(pressed(typed("JPY", "10005")), "JPY")).toBe(10005);
  expect(sendableMinorUnits(pressed(typed("BHD", "1.234")), "BHD")).toBe(1_234_000);
});
