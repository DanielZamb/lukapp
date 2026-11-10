import { expect, test, vi } from "vitest";
import { copAmountConvention, usdAmountConvention, legacyAmountConvention } from "../accounting/currencies";
import { naiveRead } from "./amount.testSupport";
import { formatAmount, parseMoney } from "../../apps/mobile/src/features/money";
import { formatCompactBody, formatMinorUnits, parseAmount } from "./amount";
import type { AmountFormat, AmountIssue, AmountPrecision } from "./amount";

const formats: AmountFormat[] = [copAmountConvention, usdAmountConvention, legacyAmountConvention]
  .flatMap(convention => ([0, 2, 3] as const).map(precision => ({ convention, precision })));

type Expectation = number | AmountIssue["code"];
const matrix: readonly (readonly [string, readonly [Expectation, Expectation, Expectation], readonly [Expectation, Expectation, Expectation]])[] = [
  ["1.234", [1234, 123400, 1234000], ["decimals_not_allowed", "too_many_decimals", 1234]],
  ["1,234", ["decimals_not_allowed", "too_many_decimals", 1234], [1234, 123400, 1234000]],
  ["12.34", ["bad_grouping", "bad_grouping", "bad_grouping"], ["decimals_not_allowed", 1234, 12340]],
  ["12,34", ["decimals_not_allowed", 1234, 12340], ["bad_grouping", "bad_grouping", "bad_grouping"]],
  ["1.234.567", [1234567, 123456700, 1234567000], ["decimals_not_allowed", "wrong_separator", "wrong_separator"]],
  ["1,234,567", ["decimals_not_allowed", "wrong_separator", "wrong_separator"], [1234567, 123456700, 1234567000]],
  ["1,234,567.89", ["decimals_not_allowed", "wrong_separator", "wrong_separator"], ["decimals_not_allowed", 123456789, 1234567890]],
  ["1.234.567,89", ["decimals_not_allowed", 123456789, 1234567890], ["decimals_not_allowed", "wrong_separator", "wrong_separator"]],
  ["1.234,5", ["decimals_not_allowed", 123450, 1234500], ["decimals_not_allowed", "wrong_separator", "wrong_separator"]],
  ["1,234.5", ["decimals_not_allowed", "wrong_separator", "wrong_separator"], ["decimals_not_allowed", 123450, 1234500]],
  ["0,5", ["decimals_not_allowed", 50, 500], ["bad_grouping", "bad_grouping", "bad_grouping"]],
  [".5", ["bad_grouping", "bad_grouping", "bad_grouping"], ["decimals_not_allowed", "not_a_number", "not_a_number"]],
  ["1..2", ["bad_grouping", "bad_grouping", "bad_grouping"], ["decimals_not_allowed", "wrong_separator", "wrong_separator"]],
  ["1,,2", ["decimals_not_allowed", "wrong_separator", "wrong_separator"], ["bad_grouping", "bad_grouping", "bad_grouping"]],
];

for (const format of formats) {
  const label = `${format.convention.id}/${format.precision}`;
  const index = format.precision === 0 ? 0 : format.precision === 2 ? 1 : 2;
  test.each(matrix)(`${label} literal thousand-confusion %s`, (text, cop, usd) => {
    const expected = (format.convention.id === "usd" ? usd : cop)[index];
    const result = parseAmount(text, format);
    if (typeof expected === "number") expect(result).toEqual({ kind: "parsed", minorUnits: expected });
    else expect(result).toMatchObject({ kind: "refused", issue: { code: expected } });
  });
}

test("refusals include the detail needed for correction hints", () => {
  const format: AmountFormat = { convention: usdAmountConvention, precision: 2 };
  expect(parseAmount("1.2,3", format)).toEqual({ kind: "refused", issue: { code: "wrong_separator", separator: ",", group: ",", decimal: "." } });
  expect(parseAmount("12,34", format)).toEqual({ kind: "refused", issue: { code: "bad_grouping", group: ",", primaryGroupSize: 3, secondaryGroupSize: 3 } });
  expect(parseAmount("12.345", format)).toEqual({ kind: "refused", issue: { code: "too_many_decimals", precision: 2, actual: 3 } });
  expect(parseAmount("1x2", format)).toEqual({ kind: "refused", issue: { code: "not_a_number", character: "x", index: 1 } });
  expect(parseAmount("9007199254740992", { ...format, precision: 0 })).toEqual({ kind: "refused", issue: { code: "too_large", maxMinorUnits: "9007199254740991" } });
});

for (const format of formats) {
  test(`${format.convention.id}/${format.precision} empty, incomplete, signs, zeros and forbidden input`, () => {
    const d = format.convention.decimal;
    expect(parseAmount("  ", format)).toMatchObject({ kind: "refused", issue: { code: "empty" } });
    for (const sign of ["+", "-", "−"]) {
      expect(parseAmount(sign, format)).toMatchObject({ kind: "refused", issue: { code: "incomplete" } });
      expect(parseAmount(`${sign}000`, format)).toEqual({ kind: "parsed", minorUnits: 0 });
    }
    expect(parseAmount(`12${d}`, format)).toMatchObject({ kind: "refused", issue: { code: format.precision === 0 ? "decimals_not_allowed" : "incomplete" } });
    for (const raw of ["--1", "+-1", "1-2", "1−2", "1+2", "1abc234", "1e3", "1 234", "1\u00a0234", "1\u202f234", "1\t234", "1\n234", "1'234", "1’234", "١٢", "１２", "$123", "COP 123", "(123)", "1%", "1M", "NaN", "Infinity"]) {
      expect(parseAmount(raw, format), raw).toMatchObject({ kind: "refused", issue: { code: "not_a_number" } });
    }
    expect(parseAmount("  +00012  ", format)).toEqual({ kind: "parsed", minorUnits: format.precision === 0 ? 12 : format.precision === 2 ? 1200 : 12000 });
  });
}

test("safe bounds are tested as strings before conversion, without Intl or BigInt", () => {
  vi.stubGlobal("Intl", undefined);
  vi.stubGlobal("BigInt", undefined);
  try {
    const cop = ["9.007.199.254.740.991", "90.071.992.547.409,91", "9.007.199.254.740,991"];
    const usd = ["9,007,199,254,740,991", "90,071,992,547,409.91", "9,007,199,254,740.991"];
    for (const format of formats) {
      const index = format.precision === 0 ? 0 : format.precision === 2 ? 1 : 2;
      const max = (format.convention.id === "usd" ? usd : cop)[index];
      for (const sign of ["", "-", "−", "+"]) {
        const value = sign === "-" || sign === "−" ? -9007199254740991 : 9007199254740991;
        expect(parseAmount(sign + max, format)).toEqual({ kind: "parsed", minorUnits: value });
        expect(parseAmount(sign + max.slice(0, -1) + "2", format)).toMatchObject({ kind: "refused", issue: { code: "too_large" } });
        expect(formatMinorUnits(value, format)).toBe((value < 0 ? "−" : "") + max);
      }
    }
  } finally { vi.unstubAllGlobals(); }
});

test.each([NaN, Infinity, -Infinity, 1.5, 9007199254740992, -9007199254740992])("formatters refuse invalid minor units %s", value => {
  const format: AmountFormat = { convention: copAmountConvention, precision: 2 };
  expect(() => formatMinorUnits(value, format)).toThrow(RangeError);
  expect(() => formatCompactBody(value, format, { scale: 6, fractionDigits: 2 })).toThrow(RangeError);
});

for (const convention of [copAmountConvention, usdAmountConvention, legacyAmountConvention]) {
  test(`${convention.id} compact numeric body follows currency, independent of suffix language`, () => {
    const format: AmountFormat = { convention, precision: 2 };
    const d = convention.id === "usd" ? "." : ",";
    expect(formatCompactBody(123456789, format, { scale: 6, fractionDigits: 2 })).toBe(`1${d}23`);
    expect(formatCompactBody(125000000, format, { scale: 6, fractionDigits: 1 })).toBe(`1${d}3`);
    expect(formatCompactBody(-125000000, format, { scale: 6, fractionDigits: 1 })).toBe(`−1${d}3`);
    expect(formatCompactBody(99995000, format, { scale: 3, fractionDigits: 0 })).toBe("1000");
    expect(formatCompactBody(100000000, format, { scale: 6, fractionDigits: 2, trimTrailingZeros: true })).toBe("1");
    expect(formatCompactBody(-1, format, { scale: 6, fractionDigits: 2 })).toBe(`0${d}00`);
    expect(formatCompactBody(9007199254740991, format, { scale: 6, fractionDigits: 2 })).toBe(`90071992${d}55`);
  });
}


function assertReading(text: string, format: AmountFormat, expected: number) {
  const parsed = parseAmount(text, format);
  if (parsed.kind !== "parsed" || parsed.minorUnits !== expected || naiveRead(text, format) !== expected) {
    throw new Error(`${format.convention.id}/${format.precision} ${text} expected ${expected}, got ${JSON.stringify(parsed)}`);
  }
}

function generatedSpread(): number[] {
  const values = new Set<number>([0, 9007199254740991]);
  for (let i = 0; i <= 100; i++) values.add(9007199254740991 - i);
  for (let exponent = 0; exponent <= 15; exponent++) {
    const boundary = Number("1" + "0".repeat(exponent));
    for (let delta = -2; delta <= 2; delta++) if (boundary + delta >= 0) values.add(boundary + delta);
  }
  let seed = 4187;
  for (let sample = 0; sample < 3000; sample++) {
    let digits = "";
    for (let i = 0; i < 1 + sample % 16; i++) {
      seed = (seed * 48271) % 2147483647;
      digits += String(seed % 10);
    }
    digits = digits.replace(/^0+/, "") || "0";
    if (digits.length < 16 || digits <= "9007199254740991") values.add(Number(digits));
  }
  return [...values];
}

for (const format of formats) {
  test(`${format.convention.id}/${format.precision} exhaustive signed 0..200000 exact round trips and independent reading`, () => {
    for (let value = -200000; value <= 200000; value++) {
      assertReading(formatMinorUnits(value, format), format, value);
      assertReading(formatMinorUnits(value, format, { hideZeroDecimals: true }), format, value);
    }
    for (const value of generatedSpread()) for (const sign of [1, -1]) {
      const signed = value === 0 ? 0 : value * sign;
      assertReading(formatMinorUnits(signed, format), format, signed);
      assertReading(formatMinorUnits(signed, format, { hideZeroDecimals: true }), format, signed);
    }
  }, 30000);
  test(`${format.convention.id}/${format.precision} accepted generated strings agree with a separate reader`, () => {
    const pieces = ["", "+", "-", "−", "0", "1", "12", "123", "000", "1234", ".", ",", " ", "x"];
    for (const a of pieces) for (const b of pieces) for (const c of pieces) {
      const raw = a + b + c;
      const result = parseAmount(raw, format);
      const expected = naiveRead(raw, format);
      if (expected === null) expect(result, raw).toMatchObject({ kind: "refused" });
      else expect(result, raw).toEqual({ kind: "parsed", minorUnits: expected });
    }
  });
}

for (const precision of [0, 2, 3] as const) {
  test(`every canonical Colombian string agrees with today's parser, precision ${precision}`, () => {
    const format: AmountFormat = { convention: copAmountConvention, precision };
    const currency = precision === 0 ? "JPY" : precision === 2 ? "COP" : "BHD";
    for (let value = -200000; value <= 200000; value++) {
      const text = formatAmount(value, currency);
      assertReading(text, format, value);
      if (parseMoney(text, currency) !== value) throw new Error(`Legacy mismatch for ${text}`);
    }
    for (const value of generatedSpread()) for (const sign of [1, -1]) {
      const text = formatAmount(value * sign, currency);
      expect(parseAmount(text, format)).toEqual({ kind: "parsed", minorUnits: parseMoney(text, currency) || 0 });
    }
  }, 30000);
}

test("the ambiguous class has one mark, 1..3 whole digits, exactly three fractional digits, and requires precision 3", () => {
  for (const precision of [0, 2, 3] as const) {
    const cop: AmountFormat = { convention: copAmountConvention, precision };
    const usd: AmountFormat = { convention: usdAmountConvention, precision };
    for (let whole = 0; whole <= 999; whole++) for (const tail of ["000", "001", "010", "234", "999"]) {
      for (const sign of ["", "+", "-", "−"]) for (const mark of [".", ","]) {
        const text = sign + whole + mark + tail;
        const a = parseAmount(text, cop);
        const b = parseAmount(text, usd);
        if (precision === 3) {
          expect(a.kind).toBe("parsed"); expect(b.kind).toBe("parsed");
          if (a.kind === "parsed" && b.kind === "parsed") {
            expect(a.minorUnits).toBe(naiveRead(text, cop)); expect(b.minorUnits).toBe(naiveRead(text, usd));
            const grouped = mark === "." ? a.minorUnits : b.minorUnits;
            const decimal = mark === "." ? b.minorUnits : a.minorUnits;
            expect(grouped).toBe(decimal * 1000);
          }
        } else {
          expect(mark === "." ? a.kind : b.kind).toBe("parsed");
          expect(mark === "." ? b.kind : a.kind).toBe("refused");
        }
      }
    }
  }
});

for (const format of formats) {
  test(`${format.convention.id}/${format.precision} compact numeric bodies preserve precision and scale choices`, () => {
    const d = format.convention.id === "usd" ? "." : ",";
    const minor = format.precision === 0 ? 1234567 : format.precision === 2 ? 123456700 : 1234567000;
    expect(formatCompactBody(minor, format, { scale: 6, fractionDigits: 2 })).toBe(`1${d}23`);
    expect(formatCompactBody(minor, format, { scale: 6, fractionDigits: 1 })).toBe(`1${d}2`);
    expect(formatCompactBody(minor, format, { scale: 6, fractionDigits: 0 })).toBe("1");
    expect(formatCompactBody(minor, format, { scale: 3, fractionDigits: 2 })).toBe(`1234${d}57`);
    expect(formatCompactBody(minor, format, { scale: 0, fractionDigits: 2 })).toBe(`1234567${d}00`);
    expect(formatCompactBody(minor, format, { scale: 9, fractionDigits: 2 })).toBe(`0${d}00`);
    expect(formatCompactBody(minor, format, { scale: 12, fractionDigits: 2, trimTrailingZeros: true })).toBe("0");
    expect(parseAmount(",5", format)).toMatchObject({ kind: "refused", issue: { code: format.convention.id === "usd" ? "bad_grouping" : format.precision === 0 ? "decimals_not_allowed" : "not_a_number" } });
  });
}

test("dual-valid generated strings either have equal values or belong to the precision-three ambiguity class", () => {
  const fragments = ["", "0", "000", "001", "1", "12", "123", "1234", ".", ",", "1.234", "1,234", ".00", ",00"];
  for (const precision of [0, 2, 3] as const) {
    const cop: AmountFormat = { convention: copAmountConvention, precision };
    const usd: AmountFormat = { convention: usdAmountConvention, precision };
    for (const sign of ["", "+", "-", "−"]) for (const a of fragments) for (const b of fragments) for (const c of fragments) {
      const text = sign + a + b + c;
      const colombian = naiveRead(text, cop);
      const american = naiveRead(text, usd);
      if (colombian === null || american === null) continue;
      expect(parseAmount(text, cop)).toEqual({ kind: "parsed", minorUnits: colombian });
      expect(parseAmount(text, usd)).toEqual({ kind: "parsed", minorUnits: american });
      if (colombian !== american) {
        expect(precision).toBe(3);
        expect(text).toMatch(/^[+−-]?\d{1,3}[.,]\d{3}$/);
      }
    }
  }
});
