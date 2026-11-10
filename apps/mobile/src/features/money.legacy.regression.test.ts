import { expect, test, vi } from "vitest";
import { currencyDisplayPrefix, formatAmount, formatMoney } from "./money";
import { readPreCurrencyAmount } from "./amount/preCurrency";
import { applyNativeText } from "./amount/nativeEdit";
import { amountMinorUnits, openAmount } from "./amount/session";

vi.mock("expo-secure-store", () => ({}));
import { suggest } from "./intake/suggest";
import { factsFromCandidate } from "./intake/facts";
import type { IntakeCandidate } from "./intake/candidates";

const displays = [
  [0, "0,00", "0", "0,000", "0", "0.00", "0"],
  [1, "0,01", "0,01", "0,001", "0,001", "0.01", "0.01"],
  [99, "0,99", "0,99", "0,099", "0,099", "0.99", "0.99"],
  [100, "1,00", "1", "0,100", "0,100", "1.00", "1"],
  [999, "9,99", "9,99", "0,999", "0,999", "9.99", "9.99"],
  [1000, "10,00", "10", "1,000", "1", "10.00", "10"],
  [123450, "1.234,50", "1.234,50", "123,450", "123,450", "1,234.50", "1,234.50"],
  [-1000000, "−10.000,00", "−10.000", "−1.000,000", "−1.000", "−10,000.00", "−10,000"],
  [123456789, "1.234.567,89", "1.234.567,89", "123.456,789", "123.456,789", "1,234,567.89", "1,234,567.89"],
  [9007199254740991, "90.071.992.547.409,91", "90.071.992.547.409,91", "9.007.199.254.740,991", "9.007.199.254.740,991",
    "90,071,992,547,409.91", "90,071,992,547,409.91"],
  [-9007199254740991, "−90.071.992.547.409,91", "−90.071.992.547.409,91", "−9.007.199.254.740,991", "−9.007.199.254.740,991",
    "−90,071,992,547,409.91", "−90,071,992,547,409.91"],
] as const;

for (const currency of ["COP", "USD", "BHD"]) {
  test.each(displays)(`${currency} display fixture %s: COP and BHD unchanged, USD in its own convention`,
    (minor, two, hiddenTwo, three, hiddenThree, us, hiddenUs) => {
      const expected = currency === "BHD" ? three : currency === "USD" ? us : two;
      const hidden = currency === "BHD" ? hiddenThree : currency === "USD" ? hiddenUs : hiddenTwo;
      expect(formatAmount(minor, currency)).toBe(expected);
      expect(formatAmount(minor, currency, { hideZeroDecimals: true })).toBe(hidden);
      const money = (body: string) => body.startsWith("−") ? `−${currency} ${body.slice(1)}` : `${currency} ${body}`;
      expect(formatMoney({ currency, minorUnits: minor })).toBe(money(expected));
      expect(formatMoney({ currency, minorUnits: minor }, { hideZeroDecimals: true })).toBe(money(hidden));
    });
}

type Entered = readonly [text: string, result: number | "incomplete" | "invalid"];
/**
 * Text entered into an empty amount field at once. The old sanitizer rewrote it (`old`); the field now keeps it,
 * normalized only when it is already a valid amount in the currency's own grammar. A raw value of minor units
 * means the field can send it; "incomplete" and "invalid" cannot be sent.
 */
const entered: ReadonlyArray<readonly [raw: string, oldTwo: string, oldThree: string, cop: Entered, usd: Entered, bhd: Entered]> = [
  ["", "", "", ["", "incomplete"], ["", "incomplete"], ["", "incomplete"]],
  ["-", "-", "-", ["-", "incomplete"], ["-", "incomplete"], ["-", "incomplete"]],
  ["+", "+", "+", ["+", "incomplete"], ["+", "incomplete"], ["+", "incomplete"]],
  ["-012500", "-12.500", "-12.500", ["-12.500", -1250000], ["-12,500", -1250000], ["-12.500", -12500000]],
  ["12abc500", "12.500", "12.500", ["12abc500", "invalid"], ["12abc500", "invalid"], ["12abc500", "invalid"]],
  ["letters", "", "", ["letters", "invalid"], ["letters", "invalid"], ["letters", "invalid"]],
  ["+12500", "+12.500", "+12.500", ["+12.500", 1250000], ["+12,500", 1250000], ["+12.500", 12500000]],
  ["−12500", "-12.500", "-12.500", ["-12.500", -1250000], ["-12,500", -1250000], ["-12.500", -12500000]],
  ["1-2", "-12", "-12", ["1-2", "invalid"], ["1-2", "invalid"], ["1-2", "invalid"]],
  ["--1", "-1", "-1", ["--1", "invalid"], ["--1", "invalid"], ["--1", "invalid"]],
  ["+-1", "+1", "+1", ["+-1", "invalid"], ["+-1", "invalid"], ["+-1", "invalid"]],
  ["12.", "12,", "12,", ["12.", "invalid"], ["12.", "incomplete"], ["12.", "invalid"]],
  ["12.5", "12,5", "12,5", ["12.5", "invalid"], ["12.5", 1250], ["12.5", "invalid"]],
  ["12.50", "12,50", "12,50", ["12.50", "invalid"], ["12.50", 1250], ["12.50", "invalid"]],
  ["1.234", "1.234", "1.234", ["1.234", 123400], ["1.234", "invalid"], ["1.234", 1234000]],
  ["1.234.", "1.234,", "1.234,", ["1.234.", "invalid"], ["1.234.", "invalid"], ["1.234.", "invalid"]],
  ["1.0005", "10.005", "10.005", ["1.0005", "invalid"], ["1.0005", "invalid"], ["1.0005", "invalid"]],
  [",5", ",5", ",5", [",5", "invalid"], [",5", "invalid"], [",5", "invalid"]],
  [".5", ",5", ",5", [".5", "invalid"], [".5", "invalid"], [".5", "invalid"]],
  ["1,2345", "1,23", "1,234", ["1,2345", "invalid"], ["1,2345", "invalid"], ["1,2345", "invalid"]],
  ["1,,2", "1,2", "1,2", ["1,,2", "invalid"], ["1,,2", "invalid"], ["1,,2", "invalid"]],
  ["1..2", "12", "12", ["1..2", "invalid"], ["1..2", "invalid"], ["1..2", "invalid"]],
  ["USD 1,234.56", "1,23", "1,234", ["USD 1,234.56", "invalid"], ["USD 1,234.56", "invalid"], ["USD 1,234.56", "invalid"]],
  ["1 234,50", "1.234,50", "1.234,50", ["1 234,50", "invalid"], ["1 234,50", "invalid"], ["1 234,50", "invalid"]],
  ["000,01", "0,01", "0,01", ["0,01", 1], ["000,01", "invalid"], ["0,01", 10]],
  ["1.234,5", "1.234,5", "1.234,5", ["1.234,5", 123450], ["1.234,5", "invalid"], ["1.234,5", 1234500]],
];

test.each(entered)("text %s entered into an empty field (old sanitizer gave %s, %s)", (raw, _oldTwo, _oldThree, cop, usd, bhd) => {
  for (const [currency, [text, result]] of [["COP", cop], ["USD", usd], ["BHD", bhd]] as const) {
    const session = applyNativeText(openAmount(currency), raw);
    expect(session.editor.text, currency).toBe(text);
    if (typeof result === "number") expect(amountMinorUnits(session), currency).toBe(result);
    else {
      expect(session.editor.kind, currency).toBe(result);
      expect(amountMinorUnits(session), currency).toBeNull();
    }
  }
});

const preCurrency = [
  ["0", 0, 0], ["-0", -0, -0], ["+0", 0, 0], [" 000,01 ", 1, 10],
  ["1.234", 123400, 1234000], ["1.234,5", 123450, 1234500], ["−1.234,50", -123450, -1234500],
  ["+12,5", 1250, 12500], ["12,", 1200, 12000], ["1,234", null, 1234],
  ["1,2345", null, null], ["12.34", null, null], ["1..2", null, null],
  ["1,,2", null, null], ["1-2", null, null], ["1e3", null, null],
  [",5", null, null], [".5", null, null], ["COP 12", null, null],
  ["", null, null], ["-", null, null], ["90.071.992.547.409,92", null, null],
] as const;

test.each(preCurrency)("the old parser survives unchanged as the frozen reader of saved text: %s", (raw, two, three) => {
  for (const currency of ["COP", "USD", "BHD"]) {
    const expected = currency === "BHD" ? three : two;
    expect(readPreCurrencyAmount(raw, currency)).toEqual(expected === null ? { kind: "refused" } : { kind: "parsed", minorUnits: expected });
  }
});

test.each(preCurrency)("COP and BHD fields read correct Colombian text %s as the old parser did", (raw, two, three) => {
  for (const [currency, old] of [["COP", two], ["BHD", three]] as const) {
    const session = openAmount(currency, raw);
    const changed: Record<string, number | "incomplete"> = { "-0": 0, "12,": "incomplete" };
    const expected = raw in changed ? changed[raw] : old;
    if (expected === "incomplete") expect(session.editor.kind).toBe("incomplete");
    else if (expected === null) expect(amountMinorUnits(session)).toBeNull();
    else expect(amountMinorUnits(session)).toBe(expected);
  }
});

test.each([["COP", "$"], ["USD", "$"], ["BHD", "BHD "], ["EUR", "€"], ["JPY", "¥"]])("legacy prefix %s stays %s", (currency, expected) => {
  expect(currencyDisplayPrefix(currency)).toBe(expected);
});

test.each([
  ["Compraste $45.900 en Tienda", 4590000, null, "−45.900,00", "−45,900.00"],
  ["Pagaste USD 1,234.56 en Shop", 123456, "USD", "−1.234,56", "−1,234.56"],
  ["Pagaste COP 1.234,56 en Tienda", 123456, "COP", "−1.234,56", "−1,234.56"],
  ["Pagaste $12.50 en Tienda", 1250, null, "−12,50", "−12.50"],
  ["Pagaste $12,50 en Tienda", 1250, null, "−12,50", "−12.50"],
  ["Pagaste $1.234 en Tienda", 123400, null, "−1.234,00", "−1,234.00"],
  ["Pagaste $1,234 en Tienda", 123400, null, "−1.234,00", "−1,234.00"],
  ["Recibiste COP 1.234.567,89 de Ana", 123456789, "COP", "1.234.567,89", "1,234,567.89"],
] as const)("bank source grammar stays independent of workspace amount conventions: %s", (text, minor, sourceCurrency, copText, usdText) => {
  const result = suggest({ text });
  expect(result.amount?.minor).toBe(minor);
  expect(result.amount?.currency).toBe(sourceCurrency);
  for (const currency of ["COP", "USD"] as const) {
    const candidate: IntakeCandidate = {
      id: "baseline", createdAt: 0, expiresAt: 1, workspaceId: "baseline", currency,
      parserVersion: "baseline", consentVersion: "baseline",
      suggestion: { direction: result.direction?.value ?? null, amountMinorUnits: minor,
        description: "", accountingDate: "2026-11-10", financialAccountProfileId: "",
        userCategoryIds: [], primaryUserCategoryId: null },
    };
    expect(factsFromCandidate(candidate).amountText).toBe(currency === "COP" ? copText : usdText);
    expect(factsFromCandidate(candidate).amountFormat).toBe(currency === "COP" ? "cop/1" : "usd/1");
    expect(factsFromCandidate({ ...candidate, reviewAmount: { text: "kept 12.50", format: "pre-currency" } }).amountText).toBe("kept 12.50");
    expect(factsFromCandidate({ ...candidate, suggestion: { ...candidate.suggestion, amountMinorUnits: null } }).amountText).toBe("");
  }
});

test("bank extraction and its fact projection keep source-format values in English and Spanish", async () => {
  const { activeTranslator, setActiveTranslator } = await import("../i18n/active");
  const { createTranslator } = await import("../../../../src/i18n");
  const original = activeTranslator();
  try {
    for (const language of ["en", "es"] as const) {
      setActiveTranslator(createTranslator(language));
      const extracted = suggest({ text: "Pagaste USD 1,234.56 en Shop. Saldo COP 9.876,54" });
      expect(extracted.amounts.map(mention => [mention.minor, mention.currency])).toEqual([[123456, "USD"], [987654, "COP"]]);
      for (const currency of ["COP", "USD"] as const) {
        const candidate: IntakeCandidate = {
          id: "language-baseline", createdAt: 0, expiresAt: 1, workspaceId: "baseline", currency,
          parserVersion: "baseline", consentVersion: "baseline",
          suggestion: { direction: "out", amountMinorUnits: 123456, description: "", accountingDate: "2026-11-10",
            financialAccountProfileId: "", userCategoryIds: [], primaryUserCategoryId: null },
        };
        expect(factsFromCandidate(candidate).amountText).toBe(currency === "COP" ? "−1.234,56" : "−1,234.56");
      }
    }
  } finally { setActiveTranslator(original); }
});
