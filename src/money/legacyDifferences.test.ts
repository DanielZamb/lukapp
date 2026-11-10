import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { legacyAmountConvention } from "../accounting/currencies";
import { formatMoneyInput, parseMoney } from "../../apps/mobile/src/features/money";
import { createAmountEditor, parseAmount } from "./amount";
import type { AmountIssue, AmountPrecision } from "./amount";

type Case = readonly [AmountPrecision, string, string, number | "refused", AmountIssue["code"] | number, string];
const cases: readonly Case[] = [
  [2, "letters", "", "refused", "not_a_number", "Characters are retained instead of stripped"],
  [2, "1abc234", "1.234", "refused", "not_a_number", "Characters are retained instead of stripped"],
  [2, "$12", "12", "refused", "not_a_number", "Currency symbols are not numeric input"],
  [2, "1 234,50", "1.234,50", "refused", "not_a_number", "Internal whitespace is not removed"],
  [2, "1e3", "13", "refused", "not_a_number", "Exponent text is not stripped to digits"],
  [2, "1-2", "-12", "refused", "not_a_number", "An internal sign is not relocated"],
  [2, "--1", "-1", "refused", "not_a_number", "Duplicate signs are not collapsed"],
  [2, "+-1", "+1", "refused", "not_a_number", "Competing signs are not resolved"],
  [2, "12.", "12,", "refused", "bad_grouping", "A group mark cannot become a decimal"],
  [2, "12.5", "12,5", "refused", "bad_grouping", "A group mark cannot become a decimal"],
  [2, "12.50", "12,50", "refused", "bad_grouping", "A group mark cannot become a decimal"],
  [2, ".5", ",5", "refused", "bad_grouping", "A leading foreign group mark is not decimal intent"],
  [2, "1.234.", "1.234,", "refused", "bad_grouping", "A second group mark cannot become a decimal"],
  [2, "1.0005", "10.005", "refused", "bad_grouping", "Unknown pasted malformed grouping is not regrouped"],
  [2, "1..2", "12", "refused", "bad_grouping", "Repeated groups are not removed"],
  [2, "1,,2", "1,2", "refused", "wrong_separator", "Repeated decimals are not removed"],
  [2, "1,2.3", "1,23", "refused", "wrong_separator", "Group marks in fractions are not removed"],
  [2, "1,2345", "1,23", "refused", "too_many_decimals", "Excess fraction digits are not truncated"],
  [2, "1.234,567", "1.234,56", "refused", "too_many_decimals", "Excess fraction digits are not truncated"],
  [2, "1,23foo", "1,23", "refused", "not_a_number", "Fraction text is not stripped"],
  [2, "USD 1,234.56", "1,23", "refused", "not_a_number", "Labels and foreign formats are not repaired"],
  [2, "1,234,567", "1,23", "refused", "wrong_separator", "Repeated decimal text is not truncated"],
  [2, "12,", "12,", 1200, "incomplete", "A trailing decimal cannot submit"],
  [2, "0,", "0,", 0, "incomplete", "A trailing decimal cannot submit"],
  [2, "-0", "-0", -0, 0, "Signed financial zero is normalized"],
  [2, "9007199254740992", "9.007.199.254.740.992", "refused", "too_large", "Overflow remains visible and nonpostable"],
  [0, "12,", "12,", 12, "decimals_not_allowed", "Zero-digit currencies reject even bare decimal marks"],
  [0, "12,abc", "12,", "refused", "not_a_number", "Invalid text cannot become an accepted zero-digit amount"],
  [0, "1.0005", "10.005", "refused", "bad_grouping", "Only editor-generated grouping permits digit continuation"],
  [3, "12.5", "12,5", "refused", "bad_grouping", "Foreign decimal guessing is removed for three digits too"],
  [3, "12.50", "12,50", "refused", "bad_grouping", "Foreign decimal guessing is removed for three digits too"],
  [3, "1,2345", "1,234", "refused", "too_many_decimals", "A fourth fractional digit is not truncated"],
  [3, "12,", "12,", 12000, "incomplete", "Trailing decimals are incomplete at every nonzero precision"],
];

const receipts: object[] = [];
function legacyParse(text: string, currency: string): number | "refused" {
  try { return parseMoney(text, currency); } catch { return "refused"; }
}

test.each(cases)("Colombian policy difference p=%s input=%s", (precision, text, oldEditing, oldParsed, expected, why) => {
  const currency = precision === 0 ? "JPY" : precision === 3 ? "BHD" : "COP";
  const format = { convention: legacyAmountConvention, precision };
  expect(formatMoneyInput(text, currency)).toBe(oldEditing);
  expect(legacyParse(text, currency)).toBe(oldParsed);
  const result = parseAmount(text, format);
  if (typeof expected === "number") expect(result).toEqual({ kind: "parsed", minorUnits: expected });
  else expect(result).toMatchObject({ kind: "refused", issue: { code: expected } });
  const state = createAmountEditor(format, text);
  expect(state.text).toBe(text);
  receipts.push({ precision, input: text, oldEditing, oldDirectParse: Object.is(oldParsed, -0) ? "-0" : oldParsed,
    oldParseAfterEditing: legacyParse(oldEditing, currency), newParse: result, newEditing: { text: state.text, kind: state.kind }, why });
});

test("write the reviewed Colombian differences receipt only when requested", () => {
  if (process.env.AMOUNT_RECEIPT !== "1") return;
  const dir = "reports/mvp-2026-11-10";
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/amount-policy-differences.json`, JSON.stringify(receipts, null, 2) + "\n");
});
