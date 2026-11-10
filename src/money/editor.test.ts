import { naiveRead } from "./amount.testSupport";
import { expect, test } from "vitest";
import { copAmountConvention, usdAmountConvention, legacyAmountConvention } from "../accounting/currencies";
import { createAmountEditor, editAmount, formatMinorUnits, parseAmount } from "./amount";
import type { AmountEdit, AmountEditorState, AmountFormat } from "./amount";

const formats: AmountFormat[] = [copAmountConvention, usdAmountConvention, legacyAmountConvention]
  .flatMap(convention => ([0, 2, 3] as const).map(precision => ({ convention, precision })));

function typeText(state: AmountEditorState, text: string): AmountEditorState {
  for (const character of text) state = editAmount(state, { kind: "type", character });
  return state;
}

function at(state: AmountEditorState, start: number, end = start) {
  return editAmount(state, { kind: "select", selection: { start, end } });
}

for (const format of formats) {
  const label = `${format.convention.id}/${format.precision}`;
  const g = format.convention.id === "usd" ? "," : ".";
  const d = format.convention.id === "usd" ? "." : ",";
  test(`${label} digits insert grouping, decimal is semantic, excess digits remain visible`, () => {
    let state = createAmountEditor(format);
    expect(state.kind).toBe("incomplete");
    const steps = ["1", "12", "123", `1${g}234`, `12${g}345`, `123${g}456`, `1${g}234${g}567`];
    for (const [index, character] of [..."1234567"].entries()) {
      state = editAmount(state, { kind: "type", character });
      expect(state.text).toBe(steps[index]);
      expect(state.kind).toBe("complete");
      expect(state.selection).toEqual({ start: state.text.length, end: state.text.length });
    }
    state = editAmount(state, { kind: "decimal" });
    expect(state.text).toBe(`1${g}234${g}567${d}`);
    expect(state.kind).toBe(format.precision === 0 ? "invalid" : "incomplete");
    if (state.kind !== "complete") expect(state.issue.code).toBe(format.precision === 0 ? "decimals_not_allowed" : "incomplete");
    for (const ch of "567") state = editAmount(state, { kind: "type", character: ch });
    expect(state.text).toBe(`1${g}234${g}567${d}567`);
    expect(state.kind).toBe(format.precision === 3 ? "complete" : "invalid");
    state = editAmount(state, { kind: "type", character: "8" });
    expect(state.text).toBe(`1${g}234${g}567${d}5678`);
    expect(state.kind).toBe("invalid");
    expect(state).not.toHaveProperty("minorUnits");
  });

  test(`${label} manually typed groups never become decimals`, () => {
    let state = createAmountEditor(format);
    for (const [character, text, kind] of [
      ["1", "1", "complete"], [g, `1${g}`, "incomplete"],
      ["2", `1${g}2`, "incomplete"], ["3", `1${g}23`, "incomplete"], ["4", `1${g}234`, "complete"],
    ]) {
      state = editAmount(state, { kind: "type", character });
      expect(state.text).toBe(text); expect(state.kind).toBe(kind);
    }
    expect(state.generatedGroups).toEqual([]);
    state = editAmount(state, { kind: "type", character: "5" });
    expect(state.text).toBe(`1${g}2345`); expect(state.kind).toBe("invalid");
  });

  test(`${label} literal workspace decimal and semantic decimal have the same meaning`, () => {
    for (const initial of ["", "-", "+", "−"]) {
      const semantic = editAmount(createAmountEditor(format, initial), { kind: "decimal" });
      const literal = editAmount(createAmountEditor(format, initial), { kind: "type", character: d });
      expect(semantic).toEqual(literal);
      expect(semantic.text).toBe(`${initial === "−" && format.precision > 0 ? "-" : initial}0${d}`);
      expect(semantic.kind).toBe(format.precision === 0 ? "invalid" : "incomplete");
      const withDigit = editAmount(semantic, { kind: "type", character: "5" });
      expect(withDigit.text.endsWith(`${d}5`)).toBe(true);
      expect(withDigit.kind).toBe(format.precision === 0 ? "invalid" : "complete");
    }
    const value = format.precision === 0 ? `12${d}` : `12${d}5`;
    const state = editAmount(at(createAmountEditor(format, value), 0), { kind: "decimal" });
    expect(state.text).toBe(value);
    expect(state.selection).toEqual({ start: 3, end: 3 });
  });

  test(`${label} paste validates its whole literal text and never strips or truncates`, () => {
    const valid = editAmount(createAmountEditor(format), { kind: "paste", text: "0001234" });
    expect(valid.text).toBe(`1${g}234`); expect(valid.kind).toBe("complete");
    const complete = format.precision === 0 ? `1${g}234` : `1${g}234${d}5`;
    expect(editAmount(createAmountEditor(format), { kind: "paste", text: complete }).text).toBe(complete);
    for (const raw of [`12${g}34`, `1${g}`, `1${g}0005`, `1${d}2345`, "1-2", "1e3", "$12", "1 234", "1..2", "1,,2", "12345678901234567890"]) {
      const state = editAmount(createAmountEditor(format, "12"), { kind: "paste", text: raw });
      expect(state.text).toBe("12" + raw); expect(state.kind).toBe("invalid"); expect(state).not.toHaveProperty("minorUnits");
      const replaced = editAmount(at(createAmountEditor(format, "12"), 0, 2), { kind: "paste", text: raw });
      expect(replaced.text).toBe(raw); expect(replaced.kind).toBe("invalid");
    }
    for (const raw of ["", "-", "+", "−"]) expect(editAmount(createAmountEditor(format), { kind: "paste", text: raw }).kind).toBe("incomplete");
    const trailing = editAmount(createAmountEditor(format), { kind: "paste", text: `12${d}` });
    expect(trailing.kind).toBe(format.precision === 0 ? "invalid" : "incomplete");
  });

  test(`${label} automatic grouping permits continued typing and deletion on either side`, () => {
    const generated = typeText(createAmountEditor(format), "12345");
    expect(generated.text).toBe(`12${g}345`); expect(generated.generatedGroups).toEqual([2]);
    const back = editAmount(at(generated, 3), { kind: "delete", direction: "backward" });
    expect(back.text).toBe(`1${g}345`); expect(back.selection).toEqual({ start: 1, end: 1 });
    const forward = editAmount(at(generated, 2), { kind: "delete", direction: "forward" });
    expect(forward.text).toBe(`1${g}245`); expect(forward.selection).toEqual({ start: 3, end: 3 });
    const skipped = editAmount(at(generated, 2), { kind: "type", character: g });
    expect(skipped.text).toBe(generated.text); expect(skipped.selection).toEqual({ start: 3, end: 3 });
    const manual = typeText(createAmountEditor(format), `1${g}23`);
    const removed = editAmount(at(manual, 2), { kind: "delete", direction: "backward" });
    expect(removed.text).toBe("123"); expect(removed.selection).toEqual({ start: 1, end: 1 });
  });

  test(`${label} selection replacement and middle edits preserve digit order and decimal position`, () => {
    const grouped = typeText(createAmountEditor(format), "12345");
    const inserted = editAmount(at(grouped, 4), { kind: "type", character: "9" });
    expect(inserted.text).toBe(`123${g}945`); expect(inserted.selection).toEqual({ start: 5, end: 5 });
    const replaced = editAmount(at(grouped, 1, 4), { kind: "type", character: "8" });
    expect(replaced.text).toBe(`1${g}845`); expect(replaced.selection).toEqual({ start: 3, end: 3 });
    const empty = editAmount(at(grouped, 0, grouped.text.length), { kind: "delete", direction: "backward" });
    expect(empty.text).toBe(""); expect(empty.kind).toBe("incomplete");
    const decimal = editAmount(at(typeText(createAmountEditor(format), "1234"), 3), { kind: "decimal" });
    expect(decimal.text).toBe(format.precision === 0 ? `1${g}2${d}34` : `12${d}34`); expect(decimal.kind).toBe(format.precision === 0 ? "invalid" : "complete");
    if (format.precision > 0) {
      const fraction = createAmountEditor(format, `1${g}234${d}56`);
      const changed = editAmount(at(fraction, fraction.text.length - 1, fraction.text.length), { kind: "type", character: "9" });
      expect(changed.text).toBe(`1${g}234${d}59`);
    }
  });

  test(`${label} signed zero survives editing and invalid edits cannot retain an old parsed value`, () => {
    expect(typeText(createAmountEditor(format), "00012").text).toBe("12");
    expect(typeText(createAmountEditor(format), "-0").text).toBe("-0");
    expect(typeText(createAmountEditor(format), "+0").text).toBe("+0");
    const invalid = editAmount(createAmountEditor(format, "12"), { kind: "type", character: "x" });
    expect(invalid.text).toBe("12x"); expect(invalid.kind).toBe("invalid"); expect(invalid).not.toHaveProperty("minorUnits");
    const recovered = editAmount(invalid, { kind: "delete", direction: "backward" });
    expect(recovered.text).toBe("12"); expect(recovered.kind).toBe("complete");
  });

  test(`${label} canonical character streams, semantic decimal, and every intermediate state agree`, () => {
    const values = new Set([0, 1, 9, 99, 100, 999, 1000, 9999, 10000, 99999, 100000, 999999, 1000000, 123456789, 9007199254740991]);
    for (let i = 0; i <= 2000; i++) values.add(i);
    for (let exponent = 3; exponent <= 15; exponent += 3) {
      const boundary = Number("1" + "0".repeat(exponent));
      for (let delta = -2; delta <= 2; delta++) values.add(boundary + delta);
    }
    for (const value of values) for (const sign of [1, -1]) for (const manualGroups of [true, false]) {
      const minorUnits = value === 0 ? 0 : value * sign;
      const canonical = formatMinorUnits(minorUnits, format);
      let state = createAmountEditor(format);
      for (const character of canonical) {
        if (!manualGroups && character === g) continue;
        const edit: AmountEdit = character === d ? { kind: "decimal" } : { kind: "type", character };
        state = editAmount(state, edit);
        if (state.kind === "complete") {
          const result = parseAmount(state.text, format);
          if (result.kind !== "parsed" || result.minorUnits !== state.minorUnits || naiveRead(state.text, format) !== state.minorUnits) throw new Error(`Unstable intermediate ${state.text}`);
        } else if (state.kind !== "incomplete") throw new Error(`Invalid canonical prefix ${state.text}`);
      }
      if (state.kind !== "complete" || state.minorUnits !== minorUnits || state.text.replace(/^-/, "−") !== canonical) {
        throw new Error(`${label}: ${canonical} became ${JSON.stringify(state)}`);
      }
    }
  }, 30000);
}

test("invalid selections and multi-character typing fail at the edit boundary", () => {
  const state = createAmountEditor({ convention: copAmountConvention, precision: 2 }, "12");
  for (const selection of [{ start: -1, end: 0 }, { start: 2, end: 1 }, { start: 0, end: 3 }, { start: 0.5, end: 1 }]) {
    expect(() => editAmount(state, { kind: "select", selection })).toThrow(RangeError);
  }
  expect(() => editAmount(state, { kind: "type", character: "12" })).toThrow(RangeError);
});

for (const format of formats) {
  test(`${format.convention.id}/${format.precision} overflowing paste never retains a previous complete value`, () => {
    const max = formatMinorUnits(9007199254740991, format);
    const overflow = max.slice(0, -1) + "2";
    for (const sign of ["", "-", "−"]) {
      const previous = createAmountEditor(format, "12");
      const state = editAmount(at(previous, 0, 2), { kind: "paste", text: sign + overflow });
      expect(state.text).toBe(sign + overflow);
      expect(state.kind).toBe("invalid");
      expect(state).not.toHaveProperty("minorUnits");
      if (state.kind === "invalid") expect(state.issue.code).toBe("too_large");
    }
  });
}

test("selection and generated separator offsets use UTF-16 even while invalid Unicode stays visible", () => {
  const format: AmountFormat = { convention: copAmountConvention, precision: 2 };
  const generated = typeText(createAmountEditor(format), "1234");
  const invalid = editAmount(at(generated, 0), { kind: "paste", text: "😀" });
  expect(invalid.text).toBe("😀1.234");
  expect(invalid.generatedGroups).toEqual([3]);
  const unchangedInvalid = editAmount(at(invalid, invalid.text.length), { kind: "type", character: "5" });
  expect(unchangedInvalid.text).toBe("😀1.2345");
  expect(unchangedInvalid.kind).toBe("invalid");
  const recovered = editAmount(at(invalid, 0, 2), { kind: "delete", direction: "forward" });
  expect(recovered.text).toBe("1.234");
  expect(recovered.kind).toBe("complete");
});
