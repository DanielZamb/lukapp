import * as React from "react";
import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  TextInput: "input",
  Platform: { OS: "ios" },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

import { copAmountConvention, usdAmountConvention, type AmountConvention } from "../../../../../src/accounting/currencies";
import type { AmountFormat, AmountPrecision } from "../../../../../src/money/amount";
import { LanguageProvider } from "../../i18n";
import { AmountField } from "./AmountField";
import { nativeInput, type NativeOptions } from "./nativeInput.testSupport";
import { amountMinorUnits, displayedMinorUnits, openAmountIn, type AmountSession } from "./session";

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

let observed: AmountSession;
function Owner({ initial }: { initial: AmountSession }) {
  const [session, setSession] = useState(initial);
  observed = session;
  return createElement(AmountField, { session, onChange: setSession, editable: true, inputAccessibilityLabel: "Amount", sign: {} });
}

const usd = (precision: AmountPrecision): AmountFormat => ({ convention: usdAmountConvention, precision });
const cop = (precision: AmountPrecision): AmountFormat => ({ convention: copAmountConvention, precision });
const input = () => root!.root.find((node) => node.type === "input");
const button = (label: string) => root!.root.find((node) => node.type === "button" && node.props.accessibilityLabel === label);

async function mount(format: AmountFormat, text: string, options: NativeOptions) {
  const currency = format.convention === copAmountConvention ? "COP" : "USD";
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Owner, { initial: openAmountIn(format, currency, text) })));
  });
  return nativeInput(input, options);
}

/** The field's text with its caret written as `|`, or a selection as `[...]`. */
function shown() {
  const { value, selection } = input().props as { value: string; selection: { start: number; end: number } };
  return selection.start === selection.end
    ? `${value.slice(0, selection.start)}|${value.slice(selection.start)}`
    : `${value.slice(0, selection.start)}[${value.slice(selection.start, selection.end)}]${value.slice(selection.end)}`;
}

/** The USD-style literal written in the COP convention: the two marks swap. */
function inConvention(text: string, convention: AmountConvention) {
  return convention === copAmountConvention ? text.replace(/[.,]/g, (mark) => (mark === "," ? "." : ",")) : text;
}

/** Minor units of a USD-style literal, by digit arithmetic that shares nothing with the editor. */
function minorOf(text: string, precision: number) {
  const plain = text.replace(/[|,]/g, "");
  const negative = plain.startsWith("-");
  const [whole, fraction = ""] = plain.replace(/^[+-]/, "").split(".");
  if (fraction.length > precision) return null;
  const value = Number(whole) * 10 ** precision + Number(fraction.padEnd(precision, "0") || "0");
  return negative ? -value : value;
}

/** The person's first keystrokes, which show the field in which order this platform reports an edit. */
async function learnOrder(native: Awaited<ReturnType<typeof mount>>) {
  await native.select(native.text.length);
  await native.type("9");
  await native.backspace();
}

const textFirst: Array<[string, NativeOptions]> = [
  ["iOS", { platform: "ios", order: "text-first" }],
  ["iOS reporting an unmoved caret", { platform: "ios", order: "text-first", reportUnmoved: true }],
  ["Android", { platform: "android", order: "text-first" }],
];

test("the reviewed reproduction: Backspace after one of four equal digits, then 2, gives 1,211", async () => {
  await mount(usd(2), "", { platform: "ios", order: "text-first" });
  for (const character of "1111") await act(async () => input().props.onChangeText(`${input().props.value}${character}`));
  expect(input().props.value).toBe("1,111");
  await act(async () => input().props.onSelectionChange({ nativeEvent: { selection: { start: 3, end: 3 } } }));
  await act(async () => input().props.onChangeText("1,11"));
  await act(async () => input().props.onSelectionChange({ nativeEvent: { selection: { start: 2, end: 2 } } }));
  const { value, selection } = input().props as { value: string; selection: { end: number } };
  await act(async () => input().props.onChangeText(`${value.slice(0, selection.end)}2${value.slice(selection.end)}`));
  expect(input().props.value).toBe("1,211");
  expect(amountMinorUnits(observed)).toBe(121100);
});

/** USD-style start text with its caret, the key, the field after the key, and after then typing 2. */
const deletions: Array<[string, "Backspace" | "Delete", string, string]> = [
  ["|1,111", "Backspace", "|1,111", "2|1,111"],
  ["1|,111", "Backspace", "|111", "2|,111"],
  ["1,|111", "Backspace", "|111", "2|,111"],
  ["1,1|11", "Backspace", "1|11", "1,2|11"],
  ["1,11|1", "Backspace", "11|1", "1,12|1"],
  ["1,111|", "Backspace", "111|", "1,112|"],
  ["|1,111", "Delete", "|111", "2|,111"],
  ["1|,111", "Delete", "1|11", "1,2|11"],
  ["1,|111", "Delete", "1|11", "1,2|11"],
  ["1,1|11", "Delete", "1|11", "1,2|11"],
  ["1,11|1", "Delete", "11|1", "1,12|1"],
  ["1,111|", "Delete", "1,111|", "11,112|"],
  ["|1,111.11", "Backspace", "|1,111.11", "2|1,111.11"],
  ["1|,111.11", "Backspace", "|111.11", "2|,111.11"],
  ["1,|111.11", "Backspace", "|111.11", "2|,111.11"],
  ["1,1|11.11", "Backspace", "1|11.11", "1,2|11.11"],
  ["1,11|1.11", "Backspace", "11|1.11", "1,12|1.11"],
  ["1,111|.11", "Backspace", "111|.11", "1,112|.11"],
  ["1,111.|11", "Backspace", "111,1|11", "1,111,2|11"],
  ["1,111.1|1", "Backspace", "1,111.|1", "1,111.2|1"],
  ["1,111.11|", "Backspace", "1,111.1|", "1,111.12|"],
  ["|1,111.11", "Delete", "|111.11", "2|,111.11"],
  ["1|,111.11", "Delete", "1|11.11", "1,2|11.11"],
  ["1,|111.11", "Delete", "1|11.11", "1,2|11.11"],
  ["1,1|11.11", "Delete", "1|11.11", "1,2|11.11"],
  ["1,11|1.11", "Delete", "11|1.11", "1,12|1.11"],
  ["1,111|.11", "Delete", "111,1|11", "1,111,2|11"],
  ["1,111.|11", "Delete", "1,111.|1", "1,111.2|1"],
  ["1,111.1|1", "Delete", "1,111.|1", "1,111.2|1"],
  ["1,111.11|", "Delete", "1,111.11|", "1,111.112|"],
  ["|100,000", "Backspace", "|100,000", "2|,100,000"],
  ["1|00,000", "Backspace", "|0", "2|0"],
  ["10|0,000", "Backspace", "1|0,000", "12|0,000"],
  ["100|,000", "Backspace", "10|,000", "102|,000"],
  ["100,|000", "Backspace", "10|,000", "102|,000"],
  ["100,0|00", "Backspace", "10,0|00", "100,2|00"],
  ["100,00|0", "Backspace", "10,00|0", "100,02|0"],
  ["100,000|", "Backspace", "10,000|", "100,002|"],
  ["|100,000", "Delete", "|0", "2|0"],
  ["1|00,000", "Delete", "1|0,000", "12|0,000"],
  ["10|0,000", "Delete", "1|0,000", "12|0,000"],
  ["100|,000", "Delete", "10,0|00", "100,2|00"],
  ["100,|000", "Delete", "10,0|00", "100,2|00"],
  ["100,0|00", "Delete", "10,0|00", "100,2|00"],
  ["100,00|0", "Delete", "10,00|0", "100,02|0"],
  ["100,000|", "Delete", "100,000|", "1,000,002|"],
];

describe.each(textFirst)("%s, text reported before the caret", (_platform, options) => {
  for (const precision of [0, 2, 3] as const) {
    for (const format of [usd(precision), cop(precision)]) {
      const name = `${format.convention === copAmountConvention ? "COP" : "USD"} style, ${precision} decimals`;
      const cases = deletions.filter(([start]) => precision > 0 || !start.includes("."));
      test.each(cases)(`${name}: %s then %s shows %s, then 2 shows %s`, async (start, key, after, typed) => {
        const at = start.indexOf("|");
        const native = await mount(format, inConvention(start.replace("|", ""), format.convention), options);
        await learnOrder(native);
        await native.select(at);
        await (key === "Backspace" ? native.backspace() : native.forwardDelete());
        expect(shown()).toBe(inConvention(after, format.convention));
        expect(native.agrees()).toBe(true);
        await native.type("2");
        expect(shown()).toBe(inConvention(typed, format.convention));
        expect(native.agrees()).toBe(true);
        expect(displayedMinorUnits(observed)).toBe(minorOf(typed, precision));
      });
    }
  }
});

test.each(textFirst)("%s: a digit typed at every position of a grouped amount lands there", async (_platform, options) => {
  const expected = ["9|1,234,567", "19|,234,567", "19|,234,567", "12,9|34,567", "12,39|4,567", "12,349|,567", "12,349|,567",
    "12,345,9|67", "12,345,69|7", "12,345,679|"];
  for (const format of [usd(2), cop(2)]) {
    for (const [at, result] of expected.entries()) {
      const native = await mount(format, inConvention("1,234,567", format.convention), options);
      await native.select(at);
      await native.type("9");
      expect(shown(), `${at}`).toBe(inConvention(result, format.convention));
      expect(native.agrees()).toBe(true);
      expect(displayedMinorUnits(observed)).toBe(minorOf(result, 2));
      await act(async () => root?.unmount());
    }
  }
});

/** A selection typed over or deleted: start text with the range in brackets, the key, and the result. */
const ranges: Array<[string, string | null, string]> = [
  ["1[,2]34,567", "9", "1,9|34,567"],
  ["1[,2]34,567", null, "1|34,567"],
  ["1,23[4,5]67", "9", "123,9|67"],
  ["1,23[4.5]6", "9", "12,39|6"],
  ["1,23[4.5]6", null, "1,23|6"],
  ["[1,234.56]", "7", "7|"],
  ["[1,234.56]", null, "|"],
  ["12.[34]", "9", "12.9|"],
];

test.each(textFirst)("%s: a selection typed over or deleted, across a separator or the decimal mark", async (_platform, options) => {
  for (const format of [usd(2), cop(2)]) {
    for (const [start, key, result] of ranges) {
      const from = start.indexOf("[");
      const to = start.indexOf("]") - 1;
      const native = await mount(format, inConvention(start.replace(/[[\]]/g, ""), format.convention), options);
      await native.select(from, to);
      expect(shown()).toBe(inConvention(start, format.convention));
      await (key === null ? native.backspace() : native.type(key));
      expect(shown(), `${start} ${key}`).toBe(inConvention(result, format.convention));
      expect(native.agrees()).toBe(true);
      await act(async () => root?.unmount());
    }
  }
});

/** Edits inside the fraction at three decimals: start text with caret, the edit, and the result. */
const fractions: Array<[string, string, string]> = [
  ["12.|34", "type 9", "12.9|34"],
  ["12.3|4", "type 9", "12.39|4"],
  ["12.34|", "type 9", "12.349|"],
  ["12.|34", "Backspace", "1,2|34"],
  ["12.3|4", "Backspace", "12.|4"],
  ["12.34|", "Backspace", "12.3|"],
  ["12.|34", "Delete", "12.|4"],
  ["12.3|4", "Delete", "12.3|"],
  ["12.[3]4", "type 9", "12.9|4"],
  ["12.3[4]", "type 9", "12.39|"],
  ["12.[34]", "type 9", "12.9|"],
];

test.each(textFirst)("%s: inserting, deleting and replacing inside the fraction", async (_platform, options) => {
  for (const format of [usd(3), cop(3)]) {
    for (const [start, edit, result] of fractions) {
      const native = await mount(format, inConvention(start.replace(/[|[\]]/g, ""), format.convention), options);
      const caret = start.indexOf("|");
      if (caret >= 0) await native.select(caret);
      else await native.select(start.indexOf("["), start.indexOf("]") - 1);
      if (edit === "Backspace") await native.backspace();
      else if (edit === "Delete") await native.forwardDelete();
      else await native.type(edit.slice(-1));
      expect(shown(), `${start} ${edit}`).toBe(inConvention(result, format.convention));
      expect(native.agrees()).toBe(true);
      expect(displayedMinorUnits(observed)).toBe(minorOf(result, 3));
      await act(async () => root?.unmount());
    }
  }
});

test.each(textFirst)("%s: deleting the sign keeps the digits and makes the amount positive", async (_platform, options) => {
  for (const key of ["Backspace", "Delete"] as const) {
    const native = await mount(usd(2), "-1,234", options);
    await native.select(key === "Backspace" ? 1 : 0);
    await (key === "Backspace" ? native.backspace() : native.forwardDelete());
    expect(shown()).toBe("|1,234");
    expect(native.agrees()).toBe(true);
    expect(amountMinorUnits(observed)).toBe(123400);
    await native.type("5");
    expect(shown()).toBe("5|1,234");
    await act(async () => root?.unmount());
  }
});

test.each(textFirst)("%s: the sign key keeps the caret's place among the digits", async (_platform, options) => {
  const native = await mount(usd(2), "1,111", options);
  await native.select(3);
  await native.press(() => button("Switch the amount between minus and plus").props.onPress());
  expect(shown()).toBe("-1,1|11");
  expect(native.agrees()).toBe(true);
  await native.type("2");
  expect(shown()).toBe("-11,2|11");
  expect(amountMinorUnits(observed)).toBe(-1121100);
});

test.each(textFirst)("%s: several characters replaced at once by an input method or autocorrect", async (_platform, options) => {
  const native = await mount(usd(2), "1,234", options);
  await native.replaceSpan(2, 5, "567");
  expect(shown()).toBe("1,567|");
  expect(native.agrees()).toBe(true);
  expect(amountMinorUnits(observed)).toBe(156700);
  await native.select(1);
  await native.replaceSpan(1, 1, "99");
  expect(shown()).toBe("199|,567");
  expect(native.agrees()).toBe(true);
  expect(amountMinorUnits(observed)).toBe(19956700);
});

test.each(textFirst)("%s: an identical text report changes nothing", async (_platform, options) => {
  const native = await mount(usd(2), "1,111", options);
  await native.select(3);
  await native.repeat();
  expect(shown()).toBe("1,1|11");
  await native.type("2");
  expect(shown()).toBe("11,2|11");
  expect(native.agrees()).toBe(true);
});

test.each(textFirst)("%s: a one-character paste is a keystroke and needs no confirmation", async (_platform, options) => {
  const native = await mount(usd(2), "1,234", options);
  await native.select(1);
  await native.paste("5");
  expect(shown()).toBe("15|,234");
  expect(amountMinorUnits(observed)).toBe(1523400);
  await native.paste(",");
  expect(shown()).toBe("15,|234");
  expect(amountMinorUnits(observed)).toBe(1523400);
  expect(observed.review).toBeNull();
  expect(native.agrees()).toBe(true);
});

test.each(textFirst)("%s: an undo that puts back earlier text shows that text with the caret at its end", async (_platform, options) => {
  const native = await mount(usd(2), "1,234", options);
  await native.type("5");
  expect(shown()).toBe("12,345|");
  await native.restore("1,234", 5);
  expect(shown()).toBe("1,234|");
  expect(native.agrees()).toBe(true);
  expect(amountMinorUnits(observed)).toBe(123400);
  await native.select(2);
  await native.type("9");
  expect(shown()).toBe("19|,234");
  expect(amountMinorUnits(observed)).toBe(1923400);
});

test.each(textFirst)("%s: a caret moved before an edit is where the edit lands, for both readings of a repeated digit", async (_platform, options) => {
  const native = await mount(usd(2), "1,111", options);
  await native.select(2);
  await native.select(4);
  await native.backspace();
  expect(shown()).toBe("11|1");
  await native.type("2");
  expect(shown()).toBe("1,12|1");
  expect(amountMinorUnits(observed)).toBe(112100);
  expect(native.agrees()).toBe(true);
});

const selectionFirst: Array<[string, NativeOptions]> = [
  ["iOS", { platform: "ios", order: "selection-first" }],
  ["Android", { platform: "android", order: "selection-first" }],
];

describe.each([...textFirst, ...selectionFirst])("%s, before any keystroke shows the order", (_platform, options) => {
  test("a Backspace that either order could explain keeps the amount both agree on, with the caret not guessed", async () => {
    const native = await mount(usd(2), "1,111", options);
    await native.select(4);
    await native.backspace();
    expect(input().props.value).toBe("111");
    expect(native.agrees()).toBe(true);
    expect(amountMinorUnits(observed)).toBe(11100);
  });

  test("a Backspace after a separator deletes the digit before it, or nothing when the order could change which digit", async () => {
    const native = await mount(usd(2), "1,234", options);
    await native.select(2);
    await native.backspace();
    expect(native.agrees()).toBe(true);
    expect(shown()).toBe(options.order === "text-first" ? "|234" : "1,234|");
    expect(amountMinorUnits(observed)).toBe(options.order === "text-first" ? 23400 : 123400);
  });
});

describe.each(selectionFirst)("%s, caret reported before the text", (_platform, options) => {
  test("typing and deleting give the edit the person made", async () => {
    const native = await mount(usd(2), "1,234,567", options);
    for (const [at, action, result] of [
      [2, "type 9", "19|,234,567"], [4, "Backspace", "1,9|34,567"], [1, "Delete", "1|34,567"], [7, "type 0", "1,345,670|"],
    ] as const) {
      await native.select(at);
      if (action === "Backspace") await native.backspace();
      else if (action === "Delete") await native.forwardDelete();
      else await native.type(action.slice(-1));
      expect(shown(), `${at} ${action}`).toBe(result);
      expect(native.agrees()).toBe(true);
    }
  });

  test("the reviewed reproduction gives 1,211", async () => {
    const native = await mount(usd(2), "1,111", options);
    await native.select(3);
    await native.backspace();
    expect(shown()).toBe("1|11");
    await native.type("2");
    expect(shown()).toBe("1,2|11");
    expect(amountMinorUnits(observed)).toBe(121100);
    expect(native.agrees()).toBe(true);
  });

  test("once a keystroke shows the caret arrives first, Backspace among equal digits and beside a separator lands where it was pressed", async () => {
    const native = await mount(usd(2), "111", options);
    await native.type("1");
    expect(shown()).toBe("1,111|");
    await native.select(4);
    await native.backspace();
    expect(shown()).toBe("11|1");
    await native.type("2");
    expect(shown()).toBe("1,12|1");
    expect(amountMinorUnits(observed)).toBe(112100);
    await native.select(2);
    await native.backspace();
    expect(shown()).toBe("|121");
    expect(amountMinorUnits(observed)).toBe(12100);
    expect(native.agrees()).toBe(true);
  });
});

/** A person's key, chosen at random, and what it does to a plain string of digits and one decimal point. */
type Key =
  | { kind: "digit"; digit: string }
  | { kind: "Backspace" | "Delete" | "decimal key" | "typed decimal" }
  | { kind: "tap"; at: number }
  | { kind: "range"; from: number; to: number; then: "digit" | "Backspace"; digit: string };

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The reference: the visible text without group marks, with the caret counted in its characters. It knows nothing
 * of separators, so it states where each key must land and what amount must result.
 */
function referenceAfter(plain: string, caret: { start: number; end: number }, key: Key, tie: boolean, precision: number) {
  let text = plain;
  let start = caret.start;
  let end = caret.end;
  const replace = (inserted: string) => {
    text = text.slice(0, start) + inserted + text.slice(end);
    start = end = start + inserted.length;
  };
  if (key.kind === "range") { start = key.from; end = key.to; }
  if (key.kind === "digit" || (key.kind === "range" && key.then === "digit")) replace(key.digit);
  else if (key.kind === "typed decimal") replace(".");
  else if (key.kind === "decimal key") {
    if (text.includes(".")) start = end = text.indexOf(".") + 1;
    else replace(".");
  } else if (key.kind === "range" && key.then === "Backspace") replace("");
  else if (key.kind === "Backspace" || (key.kind === "Delete" && tie)) {
    if (start !== end) replace("");
    else if (start > 0) { text = text.slice(0, start - 1) + text.slice(start); start = end = start - 1; }
  } else if (key.kind === "Delete") {
    if (start !== end) replace("");
    else if (end < text.length) text = text.slice(0, start) + text.slice(start + 1);
  } else if (key.kind === "tap") start = end = key.at;
  if ((key.kind === "typed decimal" || (key.kind === "decimal key" && !plain.includes("."))) && text === ".") { text = "0."; start = end = 2; }
  const parts = text.split(".");
  const valid = parts[0] !== "" && /^\d*$/.test(parts[0]) && (parts.length === 1 || (parts.length === 2 && precision > 0 && /^\d*$/.test(parts[1]) && parts[1].length <= precision));
  if (valid && key.kind !== "tap" && !(key.kind === "decimal key" && plain.includes("."))) {
    const whole = parts[0].replace(/^0+(?=\d)/, "");
    const removed = parts[0].length - whole.length;
    const normalized = parts.length === 2 ? `${whole}.${parts[1]}` : whole;
    const atEnd = start === text.length;
    start = end = atEnd ? normalized.length : start > parts[0].length ? start - removed : Math.max(0, start - removed);
    text = normalized;
  }
  return { text, caret: start };
}

describe.each([...textFirst, ...selectionFirst])("%s: random edit sequences agree with the plain reference after every step", (_platform, options) => {
  for (const precision of [0, 2, 3] as const) {
    for (const format of [usd(precision), cop(precision)]) {
      const { group, decimal } = format.convention;
      test(`${format.convention === copAmountConvention ? "COP" : "USD"} style, ${precision} decimals`, async () => {
        const next = random(precision * 7919 + (group === "." ? 104729 : 0) + options.platform.length * 31 + options.order.length);
        let readingsLost = 0;
        let steps = 0;
        for (let sequence = 0; sequence < 25; sequence++) {
          const native = await mount(format, "", options);
          let previous: Key | null = null;
          for (let step = 0; step < 24; step++) {
            const text = native.text;
            const toPlain = (offset: number) => [...text.slice(0, offset)].filter((character) => character !== group).length;
            const plainOf = (shown: string) => [...shown].filter((character) => character !== group).join("").split(decimal).join(".");
            const plain = plainOf(text);
            const caret = { start: toPlain(native.selection.start), end: toPlain(native.selection.end) };
            const roll = next();
            const digit = String(1 + Math.floor(next() * 9));
            const key: Key = plain.replace(".", "").length > 9 ? { kind: "Backspace" }
              : roll < 0.45 ? { kind: "digit", digit }
              : roll < 0.58 ? { kind: "Backspace" }
              : roll < 0.66 ? { kind: "Delete" }
              : roll < 0.72 && precision > 0 ? { kind: "decimal key" }
              : roll < 0.75 && precision > 0 ? { kind: "typed decimal" }
              : roll < 0.9 ? { kind: "tap", at: Math.floor(next() * (text.length + 1)) }
              : { kind: "range", from: 0, to: 0, then: next() < 0.5 ? "digit" : "Backspace", digit };
            if (key.kind === "range") {
              const a = Math.floor(next() * (text.length + 1));
              const b = Math.floor(next() * (text.length + 1));
              if (a === b) continue;
              await native.select(Math.min(a, b), Math.max(a, b));
              key.from = toPlain(Math.min(a, b));
              key.to = toPlain(Math.max(a, b));
            }
            const at = native.selection.start;
            const tie = key.kind === "Delete" && native.selection.start === native.selection.end && at > 0 && text[at - 1] === text[at];
            const fieldBefore = input().props.selection as { end: number };
            const logged = native.log.length;
            if (key.kind === "digit" || (key.kind === "range" && key.then === "digit")) await native.type(key.digit);
            else if (key.kind === "typed decimal") await native.type(decimal);
            else if (key.kind === "decimal key") await native.press(() => button(`Type a decimal ${decimal === "," ? "comma" : "point"} for ${group === "." ? "COP" : "USD"}`).props.onPress());
            else if (key.kind === "Backspace" || (key.kind === "range" && key.then === "Backspace")) await native.backspace();
            else if (key.kind === "Delete") await native.forwardDelete();
            else if (key.kind === "tap") await native.select(key.at);
            const plainKey: Key = key.kind === "tap" ? { kind: "tap", at: toPlain(key.at) } : key;
            const from = key.kind === "range" ? { start: key.from, end: key.to } : caret;
            const readings = [referenceAfter(plain, from, plainKey, false, precision), ...(tie ? [referenceAfter(plain, from, plainKey, true, precision)] : [])];
            const reported = native.log.slice(logged).filter((line) => line.startsWith("text ")).map((line) => plainOf(JSON.parse(line.slice(5)) as string));
            const field = input().props as { value: string; selection: { start: number; end: number } };
            const fieldPlain = plainOf(field.value);
            const fieldCaret = [...field.value.slice(0, field.selection.end)].filter((character) => character !== group).length;
            const context = `${options.platform} ${options.order} ${JSON.stringify(text)} ${JSON.stringify(key)} -> ${JSON.stringify(field.value)} @${field.selection.end} after ${native.log.slice(-40).join("\n")}`;
            expect(native.agrees(), context).toBe(true);
            const exact = readings.some((reading) => fieldPlain === reading.text && fieldCaret === reading.caret);
            const undoneTap = key.kind === "tap" && previous?.kind === "Delete" && field.selection.end === fieldBefore.end;
            if (!exact && !undoneTap) {
              const notGuessed = readings.some((reading) => reading.text === fieldPlain) || reported.includes(fieldPlain);
              expect(notGuessed, context).toBe(true);
              readingsLost++;
            }
            steps++;
            if (observed.editor.kind === "complete") expect(displayedMinorUnits(observed), context).toBe(minorOf(fieldPlain, precision));
            previous = key;
          }
          await act(async () => root?.unmount());
        }
        expect(readingsLost / steps).toBeLessThan(options.order === "text-first" ? 0.005 : 0.05);
      });
    }
  }
});
