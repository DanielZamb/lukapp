import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", TextInput: "input", Platform: { OS: "android" },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

import { copAmountConvention, usdAmountConvention } from "../../../../../src/accounting/currencies";
import { LanguageProvider } from "../../i18n";
import { AmountField } from "./AmountField";
import { confirmAmount, displayedMinorUnits, openAmountIn, sendableMinorUnits, type AmountAtPress, type AmountSession } from "./session";
import { reactNativeInput, readsAs } from "./phone.testSupport";
import { useAmountState } from "./useAmountState";

/**
 * The second review's independent emulator and reference model (reports/mvp-2026-11-10/amount-field/
 * r8-independent-emulator.test.ts), adapted to a field that shows the typed text, holds the sign beside it, and
 * controls the caret only after its decimal key. The reference keeps a plain string with "." for decimals and a
 * separate sign, and reads them with its own arithmetic. The phone keeps the native text and caret; a field write is
 * "dropped" when a keystroke reaches the phone first, as React Native drops a command older than the native text, and
 * that keystroke's event then reaches the field. The sign key writes nothing, so it has nothing to drop.
 */
type Phone = ReturnType<typeof phoneFor>;
let root: ReactTestRenderer;
let session: AmountSession;
let read: () => AmountAtPress;
const input = () => root.root.findByType("input" as never);
/** The sign the field shows beside the native text. */
const shownSign = () => {
  const label = root.root.findAll((node) => node.type === "text" && ["minus", "plus"].includes(node.props.accessibilityLabel))[0]?.props.accessibilityLabel;
  return label === "minus" ? "-" : label === "plus" ? "+" : "";
};

async function mount(cop: boolean, precision: 0 | 2 | 3, focus = true): Promise<Phone> {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  function Owner() {
    const [value, setValue, readValue] = useAmountState(() => openAmountIn({ convention: cop ? copAmountConvention : usdAmountConvention, precision }, cop ? "COP" : "USD"));
    session = value;
    read = readValue;
    return createElement(AmountField, { session: value, onChange: setValue, editable: true, inputAccessibilityLabel: "Amount", sign: {} });
  }
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Owner))); });
  if (focus) input().props.onFocus();
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
  /**
   * What the field rendered lands on the phone unless a newer keystroke came first. A landed write that placed the
   * caret is reported back as that caret only, as the phone does.
   */
  async function settle(drop: boolean) {
    const now = shown();
    if (drop) return;
    if (now.text !== text) { text = now.text; start = end = Math.min(end, text.length); }
    if (now.selection && (now.selection.start !== start || now.selection.end !== end)) {
      start = now.selection.start; end = now.selection.end;
      await emit("selection");
    }
  }
  return {
    get text() { return text; },
    get caret() { return [start, end]; },
    async select(a: number, b = a) { start = a; end = b; await emit("selection"); await settle(false); },
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
      await settle(false);
    },
    async key(kind: "sign" | "decimal", drop: boolean) {
      const label = kind === "sign" ? "Switch the amount between minus and plus" : `Type a decimal ${cop ? "comma" : "point"} for ${cop ? "COP" : "USD"}`;
      const button = root.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === "function")[0];
      await act(async () => button.props.onPress());
      await settle(drop);
    },
  };
}

class Reference {
  text = ""; sign = ""; a = 0; b = 0;
  constructor(public precision: number, public cop: boolean) {}
  edit(kind: string, inserted = "") {
    if ((kind === "back" && this.a === 0 && this.b === 0) || (kind === "delete" && this.a === this.text.length && this.b === this.a)) return;
    let a = this.a, b = this.b;
    if (kind === "decimal") {
      if (this.text.includes(".")) { this.a = this.b = this.text.indexOf(".") + 1; return; }
      inserted = /^[+-]?$/.test(this.text.slice(0, a)) ? "0." : ".";
    }
    if (kind === "sign") {
      this.sign = this.sign === "-" ? "+" : "-";
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
    if (!/^\d+(\.\d+)?$/.test(this.text)) return null;
    const [whole, fraction = ""] = this.text.split(".");
    if (fraction.length > this.precision || (this.precision === 0 && this.text.includes("."))) return null;
    const v = Number(whole) * 10 ** this.precision + Number(fraction.padEnd(this.precision, "0") || "0");
    return Number.isSafeInteger(v) ? (this.sign === "-" && v ? -v : v) : null;
  }
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
          reference.edit("sign"); await phone.key("sign", false);
        }
        else if (k < 0.94) { const pasted = String(10 + Math.floor(random() * 90)); reference.edit("type", pasted); await phone.edit(pasted); }
        else {
          const pasted = cop ? "1.234" : "1,234";
          reference.a = 0; reference.b = reference.text.length; reference.edit("type", "1234");
          await phone.select(0, phone.text.length); await phone.edit("", -1); await phone.edit(pasted);
          expect(input().props.value).toBe(pasted);
          expect(session.review, "a pasted group mark awaits confirmation").not.toBeNull();
          expect(sendableMinorUnits(read())).toBeNull();
          const confirm = root.root.findAll((node) => String(node.props.accessibilityLabel).startsWith("Confirm ") && typeof node.props.onPress === "function")[0];
          await act(async () => confirm.props.onPress());
          expect(sendableMinorUnits(read())).toBe((reference.sign === "-" ? -1 : 1) * 1234 * 10 ** precision);
          await phone.select(0, phone.text.length); await phone.edit("", -1);
          reference.text = ""; reference.a = reference.b = 0;
        }
        actions++;
        const visible = phone.text;
        expect(input().props.value, `field shows the phone's text after step ${step}`).toBe(visible);
        expect(displayedMinorUnits(session), `value of ${JSON.stringify(visible)}`).toBe(readsAs(shownSign() + visible, cop, precision));
        if (session.review) expect(sendableMinorUnits(read())).toBeNull();
        else expect(sendableMinorUnits(read()), `sendable once the phone shows ${JSON.stringify(visible)}`).toBe(displayedMinorUnits(session));
        if (intact) compared++;
        if (intact && (visible !== reference.shown() || shownSign() !== reference.sign || displayedMinorUnits(session) !== reference.value()
          || phone.caret[0] !== reference.a || phone.caret[1] !== reference.b)) { divergences++; intact = false; }
      }
      await act(async () => { root?.unmount(); });
    }
    console.log(`independent cop=${cop} precision=${precision} dropped=${dropped}: ${actions} actions, ${drops} dropped writes, ${compared} steps compared with the reference's intent, ${divergences} sequences left the reference's intent unexplained`);
    if (!dropped) expect(divergences).toBe(0);
  },
  120_000,
);

const interleavings = Number(process.env.AMOUNT_INTERLEAVINGS ?? 40);
const interleavingSteps = Number(process.env.AMOUNT_INTERLEAVING_STEPS ?? 100);

/**
 * Finding A of the fourth review. The person types, taps, ends editing and presses the field's keys and Save, while
 * React Native holds, runs or drops the field's writes and delivers the phone's events late, in any order the platform
 * allows (`reactNativeInput`). Whenever Save sends while every edit the phone made has reached JavaScript, the amount
 * is what the phone's text reads at that moment, sign beside it included, by the independent reader. Writes the field
 * sent and the phone holds, runs or drops are exactly what this checks; a keystroke still on its way is beyond any
 * app. Once nothing is in flight, a text that reads as an amount is sent, after the person confirms it if asked.
 */
test.each((["android", "ios"] as const).flatMap((platform) => [false, true].map((cop) => [platform, cop] as const)))(
  "every interleaving on %s, cop=%s: Save sends what the phone's text reads or nothing, and a quiet phone's amount is sent",
  async (platform, cop) => {
    const precision = 2;
    const random = rng(7717 + (platform === "ios" ? 31 : 0) + (cop ? 600 : 0));
    const decimalKey = `Type a decimal ${cop ? "comma" : "point"} for ${cop ? "COP" : "USD"}`;
    const control = (label: string) => root.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === "function")[0];
    let saves = 0;
    let sent = 0;
    let dropped = 0;
    for (let sequence = 0; sequence < interleavings; sequence++) {
      await mount(cop, precision, false);
      const phone = reactNativeInput(input, platform);
      phone.tap(0);
      const shown = () => shownSign() + phone.text;
      const save = (when: string) => {
        if (phone.reporting) return null;
        const amount = sendableMinorUnits(read());
        saves++;
        if (amount === null) return null;
        sent++;
        expect(amount, `${when}: sent while the phone shows ${JSON.stringify(shown())}`).toBe(readsAs(shown(), cop, precision));
        return amount;
      };
      for (let step = 0; step < interleavingSteps; step++) {
        const k = random();
        const digit = String(Math.floor(random() * 10));
        if (k < 0.22) phone.key(digit);
        else if (k < 0.25) phone.key(random() < 0.5 ? "." : ",");
        else if (k < 0.31) phone.backspace();
        else if (k < 0.39) phone.tap(Math.floor(random() * (phone.text.length + 1)));
        else if (k < 0.42) phone.done();
        else if (k < 0.58) await phone.deliver();
        else if (k < 0.7) phone.apply();
        else if (k < 0.8) await phone.press(control(decimalKey));
        else if (k < 0.83) await phone.press(control("Switch the amount between minus and plus"));
        else save(`sequence ${sequence} step ${step}`);
      }
      await phone.quiesce();
      dropped += phone.dropped;
      const confirm = root.root.findAll((node) => String(node.props.accessibilityLabel).startsWith("Confirm ") && typeof node.props.onPress === "function")[0];
      if (confirm) await act(async () => confirm.props.onPress());
      expect(sendableMinorUnits(read()), `sequence ${sequence}, quiet, the phone shows ${JSON.stringify(shown())}`).toBe(readsAs(shown(), cop, precision));
      await act(async () => { root?.unmount(); });
    }
    console.log(`interleavings ${platform} cop=${cop}: ${saves} saves, ${sent} sent, ${dropped} writes dropped`);
    expect(sent).toBeGreaterThan(0);
  },
  120_000,
);
