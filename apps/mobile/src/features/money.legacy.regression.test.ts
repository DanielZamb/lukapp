import { expect, test, vi } from "vitest";
import { currencyDisplayPrefix, formatAmount, formatMoney, formatMoneyInput, parseMoney } from "./money";

vi.mock("expo-secure-store", () => ({}));
import { suggest } from "./intake/suggest";
import { factsFromCandidate } from "./intake/facts";
import type { IntakeCandidate } from "./intake/candidates";

const displays = [
  [0, "0,00", "0", "0,000", "0"],
  [1, "0,01", "0,01", "0,001", "0,001"],
  [99, "0,99", "0,99", "0,099", "0,099"],
  [100, "1,00", "1", "0,100", "0,100"],
  [999, "9,99", "9,99", "0,999", "0,999"],
  [1000, "10,00", "10", "1,000", "1"],
  [123450, "1.234,50", "1.234,50", "123,450", "123,450"],
  [-1000000, "−10.000,00", "−10.000", "−1.000,000", "−1.000"],
  [123456789, "1.234.567,89", "1.234.567,89", "123.456,789", "123.456,789"],
  [9007199254740991, "90.071.992.547.409,91", "90.071.992.547.409,91", "9.007.199.254.740,991", "9.007.199.254.740,991"],
  [-9007199254740991, "−90.071.992.547.409,91", "−90.071.992.547.409,91", "−9.007.199.254.740,991", "−9.007.199.254.740,991"],
] as const;

for (const currency of ["COP", "USD", "BHD"]) {
  test.each(displays)(`legacy ${currency} display fixture %s`, (minor, two, hiddenTwo, three, hiddenThree) => {
    const expected = currency === "BHD" ? three : two;
    const hidden = currency === "BHD" ? hiddenThree : hiddenTwo;
    expect(formatAmount(minor, currency)).toBe(expected);
    expect(formatAmount(minor, currency, { hideZeroDecimals: true })).toBe(hidden);
    const money = (body: string) => body.startsWith("−") ? `−${currency} ${body.slice(1)}` : `${currency} ${body}`;
    expect(formatMoney({ currency, minorUnits: minor })).toBe(money(expected));
    expect(formatMoney({ currency, minorUnits: minor }, { hideZeroDecimals: true })).toBe(money(hidden));
  });
  test.each([
    ["", "", ""], ["-", "-", "-"], ["+", "+", "+"],
    ["-012500", "-12.500", "-12.500"], ["12abc500", "12.500", "12.500"],
    ["letters", "", ""], ["+12500", "+12.500", "+12.500"], ["−12500", "-12.500", "-12.500"],
    ["1-2", "-12", "-12"], ["--1", "-1", "-1"], ["+-1", "+1", "+1"],
    ["12.", "12,", "12,"], ["12.5", "12,5", "12,5"], ["12.50", "12,50", "12,50"],
    ["1.234", "1.234", "1.234"], ["1.234.", "1.234,", "1.234,"],
    ["1.0005", "10.005", "10.005"], [",5", ",5", ",5"], [".5", ",5", ",5"],
    ["1,2345", "1,23", "1,234"], ["1,,2", "1,2", "1,2"], ["1..2", "12", "12"],
    ["USD 1,234.56", "1,23", "1,234"], ["1 234,50", "1.234,50", "1.234,50"],
    ["000,01", "0,01", "0,01"], ["1.234,5", "1.234,5", "1.234,5"],
  ])(`legacy ${currency} input fixture %s`, (raw, two, three) => {
    expect(formatMoneyInput(raw, currency)).toBe(currency === "BHD" ? three : two);
  });
  test.each([
    ["0", 0, 0], ["-0", -0, -0], ["+0", 0, 0], [" 000,01 ", 1, 10],
    ["1.234", 123400, 1234000], ["1.234,5", 123450, 1234500], ["−1.234,50", -123450, -1234500],
    ["+12,5", 1250, 12500], ["12,", 1200, 12000], ["1,234", null, 1234],
    ["1,2345", null, null], ["12.34", null, null], ["1..2", null, null],
    ["1,,2", null, null], ["1-2", null, null], ["1e3", null, null],
    [",5", null, null], [".5", null, null], ["COP 12", null, null],
    ["", null, null], ["-", null, null], ["90.071.992.547.409,92", null, null],
  ])(`legacy ${currency} parser fixture %s`, (raw, two, three) => {
    const expected = currency === "BHD" ? three : two;
    if (expected === null) expect(() => parseMoney(raw, "es-CO", currency)).toThrow();
    else expect(parseMoney(raw, "es-CO", currency)).toBe(expected);
  });
}

test.each([["COP", "$"], ["USD", "$"], ["BHD", "BHD "], ["EUR", "€"], ["JPY", "¥"]])("legacy prefix %s stays %s", (currency, expected) => {
  expect(currencyDisplayPrefix(currency)).toBe(expected);
});

test.each([
  ["Compraste $45.900 en Tienda", 4590000, null, "−45.900,00"],
  ["Pagaste USD 1,234.56 en Shop", 123456, "USD", "−1.234,56"],
  ["Pagaste COP 1.234,56 en Tienda", 123456, "COP", "−1.234,56"],
  ["Pagaste $12.50 en Tienda", 1250, null, "−12,50"],
  ["Pagaste $12,50 en Tienda", 1250, null, "−12,50"],
  ["Pagaste $1.234 en Tienda", 123400, null, "−1.234,00"],
  ["Pagaste $1,234 en Tienda", 123400, null, "−1.234,00"],
  ["Recibiste COP 1.234.567,89 de Ana", 123456789, "COP", "1.234.567,89"],
] as const)("bank source grammar stays independent of workspace amount conventions: %s", (text, minor, sourceCurrency, amountText) => {
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
    expect(factsFromCandidate(candidate).amountText).toBe(amountText);
    expect(factsFromCandidate({ ...candidate, reviewAmountText: "kept 12.50" }).amountText).toBe("kept 12.50");
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
        expect(factsFromCandidate(candidate).amountText).toBe("−1.234,56");
      }
    }
  } finally { setActiveTranslator(original); }
});
