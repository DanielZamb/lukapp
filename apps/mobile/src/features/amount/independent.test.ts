import * as React from "react";
import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", TextInput: "input", Platform: { OS: "android" },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

import { copAmountConvention, usdAmountConvention } from "../../../../../src/accounting/currencies";
import { LanguageProvider } from "../../i18n";
import { AmountField } from "./AmountField";
import { amountMinorUnits, confirmAmount, displayedMinorUnits, openAmountIn, type AmountSession } from "./session";

/**
 * The second review's independent emulator and reference model (reports/mvp-2026-11-10/amount-field/
 * r8-independent-emulator.test.ts), adapted to a field that shows the typed text and controls the caret only after its
 * own keys. The reference keeps a plain string with "." for decimals and reads it with its own arithmetic. The phone
 * keeps the native text and caret; a field write is "dropped" when a keystroke reaches the phone first, as React Native
 * drops a command older than the native text, and that keystroke's event then reaches the field.
 */
type Phone = ReturnType<typeof phoneFor>;
let root: ReactTestRenderer;
let session: AmountSession;
const input = () => root.root.findByType("input" as never);

async function mount(cop: boolean, precision: 0 | 2 | 3): Promise<Phone> {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  function Owner() {
    const [value, setValue] = useState(() => openAmountIn({ convention: cop ? copAmountConvention : usdAmountConvention, precision }, cop ? "COP" : "USD"));
    session = value;
    return createElement(AmountField, { session: value, onChange: setValue, editable: true, inputAccessibilityLabel: "Amount", sign: {} });
  }
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Owner))); });
  return phoneFor(cop);
}

function phoneFor(cop: boolean) {
  let text = "";
  let start = 0;
  let end = 0;
  const shown = () => ({ text: input().props.value as string, selection: input().props.selection as { start: number; end: number } | undefined });
  async function emit(kind: "text" | "selection") {
    await act(async () => {
      if (kind === "text") input().props.onChangeText(text);
      else input().props.onSelectionChange({ nativeEvent: { selection: { start, end } } });
    });
  }
  /** What the field rendered lands on the phone unless a newer keystroke came first. */
  function settle(drop: boolean) {
    const now = shown();
    if (drop) return;
    if (now.text !== text) { text = now.text; start = end = Math.min(end, text.length); }
    if (now.selection) { start = now.selection.start; end = now.selection.end; }
  }
  return {
    get text() { return text; },
    get caret() { return [start, end]; },
    async select(a: number, b = a) { start = a; end = b; await emit("selection"); settle(false); },
    async edit(insert: string, del: 0 | -1 | 1 = 0) {
      let a = start, b = end;
      if (a === b && del === -1) a = Math.max(0, a - 1);
      if (a === b && del === 1) b = Math.min(text.length, b + 1);
      const next = text.slice(0, a) + insert + text.slice(b);
      const moved = a + insert.length !== start || a + insert.length !== end;
      if (next === text && !moved) return;
      text = next; start = end = a + insert.length;
      if (next !== shown().text) await emit("text");
      if (moved) await emit("selection");
      settle(false);
    },
    async key(kind: "sign" | "decimal", drop: boolean) {
      const label = kind === "sign" ? "Switch the amount between minus and plus" : `Type a decimal ${cop ? "comma" : "point"} for ${cop ? "COP" : "USD"}`;
      const button = root.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === "function")[0];
      await act(async () => button.props.onPress());
      settle(drop);
    },
  };
}

class Reference {
  text = ""; a = 0; b = 0;
  constructor(public precision: number, public cop: boolean) {}
  edit(kind: string, inserted = "") {
    if ((kind === "back" && this.a === 0 && this.b === 0) || (kind === "delete" && this.a === this.text.length && this.b === this.a)) return;
    let a = this.a, b = this.b;
    if (kind === "decimal") {
      if (this.text.includes(".")) { this.a = this.b = this.text.indexOf(".") + 1; return; }
      inserted = /^[+-]?$/.test(this.text.slice(0, a)) ? "0." : ".";
    }
    if (kind === "sign") {
      const sign = this.text[0] === "-" ? "+" : "-";
      const had = /^[+-]/.test(this.text);
      const fromEnd = this.text.length - this.b;
      this.text = sign + this.text.slice(had ? 1 : 0);
      this.a = this.b = Math.max(1, this.text.length - fromEnd);
      return;
    }
    if (a === b && kind === "back") a = Math.max(0, a - 1);
    if (a === b && kind === "delete") b = Math.min(this.text.length, b + 1);
    if (kind === "back" || kind === "delete") inserted = "";
    this.text = this.text.slice(0, a) + inserted + this.text.slice(b);
    this.a = this.b = a + inserted.length;
  }
  shown() { return this.cop ? this.text.replace(".", ",") : this.text; }
  value(): number | null {
    if (!/^[+-]?\d+(\.\d+)?$/.test(this.text)) return null;
    const [whole, fraction = ""] = this.text.replace(/^[+-]/, "").split(".");
    if (fraction.length > this.precision || (this.precision === 0 && this.text.includes("."))) return null;
    const v = Number(whole) * 10 ** this.precision + Number(fraction.padEnd(this.precision, "0") || "0");
    return Number.isSafeInteger(v) ? (this.text[0] === "-" && v ? -v : v) : null;
  }
}

/** The amount a person reads in the visible text, by an independent strict reading of the convention. */
function reads(visible: string, cop: boolean, precision: number): number | null {
  const group = cop ? "\\." : ",";
  const decimal = cop ? "," : "\\.";
  const match = new RegExp(`^([+−-]?)(\\d{1,3}(?:${group}\\d{3})+|\\d+)(?:${decimal}(\\d+))?$`).exec(visible.trim());
  if (!match || (match[3] !== undefined && (precision === 0 || match[3].length > precision))) return null;
  const v = Number(match[2].replace(/[.,]/g, "")) * 10 ** precision + Number((match[3] ?? "").padEnd(precision, "0") || "0");
  if (!Number.isSafeInteger(v)) return null;
  return match[1] && match[1] !== "+" && v ? -v : v;
}

function rng(seed: number) { let x = seed; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }

const sequences = Number(process.env.AMOUNT_FUZZ_SEQUENCES ?? 12);
const steps = Number(process.env.AMOUNT_FUZZ_STEPS ?? 80);

test.each([false, true].flatMap((cop) => ([0, 2, 3] as const).flatMap((precision) => [false, true].map((dropped) => [cop, precision, dropped] as const))))(
  "random actions, cop=%s precision=%s dropped writes=%s: the value is always the visible text's reading, and without drops it is the person's intent",
  async (cop, precision, dropped) => {
    const random = rng(12239 + precision * 7919 + (cop ? 600 : 0) + (dropped ? 999 : 0));
    let divergences = 0;
    let actions = 0;
    let drops = 0;
    let compared = 0;
    for (let sequence = 0; sequence < sequences; sequence++) {
      const phone = await mount(cop, precision);
      const reference = new Reference(precision, cop);
      let intact = true;
      for (let step = 0; step < steps; step++) {
        const k = random();
        const digit = String(Math.floor(random() * 10));
        const drop = dropped && step % 3 !== 2;
        if (reference.text.replace(/\D/g, "").length > 10) { reference.edit("back"); await phone.edit("", -1); }
        else if (k < 0.39) { reference.edit("type", digit); await phone.edit(digit); }
        else if (k < 0.51) { reference.edit("back"); await phone.edit("", -1); }
        else if (k < 0.58) { reference.edit("delete"); await phone.edit("", 1); }
        else if (k < 0.69) { const a = Math.floor(random() * (phone.text.length + 1)); reference.a = reference.b = a; await phone.select(a); }
        else if (k < 0.77) {
          const a = Math.floor(random() * (phone.text.length + 1)), b = Math.floor(random() * (phone.text.length + 1));
          reference.a = Math.min(a, b); reference.b = Math.max(a, b);
          await phone.select(Math.min(a, b), Math.max(a, b));
          reference.edit("type", digit); await phone.edit(digit);
        } else if (k < 0.82 && precision > 0) {
          reference.edit("decimal"); await phone.key("decimal", drop);
          if (drop) { intact = false; drops++; await phone.edit(digit); }
        } else if (k < 0.87) {
          reference.edit("sign"); await phone.key("sign", drop);
          if (drop) { intact = false; drops++; await phone.edit(digit); }
        }
        else if (k < 0.94) { const pasted = String(10 + Math.floor(random() * 90)); reference.edit("type", pasted); await phone.edit(pasted); }
        else {
          const pasted = cop ? "1.234" : "1,234";
          reference.a = 0; reference.b = reference.text.length; reference.edit("type", "1234");
          await phone.select(0, phone.text.length); await phone.edit("", -1); await phone.edit(pasted);
          expect(input().props.value).toBe(pasted);
          expect(session.review, "a pasted group mark awaits confirmation").not.toBeNull();
          expect(amountMinorUnits(session)).toBeNull();
          const confirm = root.root.findAll((node) => String(node.props.accessibilityLabel).startsWith("Confirm ") && typeof node.props.onPress === "function")[0];
          await act(async () => confirm.props.onPress());
          expect(amountMinorUnits(session)).toBe(1234 * 10 ** precision);
          await phone.select(0, phone.text.length); await phone.edit("", -1);
          reference.text = ""; reference.a = reference.b = 0;
        }
        actions++;
        const visible = phone.text;
        expect(input().props.value, `field shows the phone's text after step ${step}`).toBe(visible);
        expect(displayedMinorUnits(session), `value of ${JSON.stringify(visible)}`).toBe(reads(visible, cop, precision));
        if (session.review) expect(amountMinorUnits(session)).toBeNull();
        if (intact) compared++;
        if (intact && (visible !== reference.shown() || displayedMinorUnits(session) !== reference.value()
          || phone.caret[0] !== reference.a || phone.caret[1] !== reference.b)) { divergences++; intact = false; }
      }
      await act(async () => { root?.unmount(); });
    }
    console.log(`independent cop=${cop} precision=${precision} dropped=${dropped}: ${actions} actions, ${drops} dropped writes, ${compared} steps compared with the reference's intent, ${divergences} sequences left the reference's intent unexplained`);
    if (!dropped) expect(divergences).toBe(0);
  },
  120_000,
);
