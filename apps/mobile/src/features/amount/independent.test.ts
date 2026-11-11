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
import { displayedMinorUnits, openAmountIn, sendableMinorUnits, withAmountSign, type AmountAtPress, type AmountSession } from "./session";
import { reactNativeInput, readsAs } from "./phone.testSupport";
import { useAmountState } from "./useAmountState";

/**
 * The second review's independent emulator and reference model (reports/mvp-2026-11-10/amount-field/
 * r8-independent-emulator.test.ts), adapted to a field that shows the typed text and never writes to it, and holds
 * beside it the sign its owner sets. The person types digits, the phone's decimal mark and, by mistake, a sign. The
 * reference keeps a plain string with "." for decimals and a separate sign, and reads them with its own arithmetic: a
 * sign in the string reads as nothing. The phone keeps the native text and caret.
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
    return createElement("view", null,
      createElement(AmountField, { session: value, onChange: setValue, editable: true, inputAccessibilityLabel: "Amount" }),
      ...(["-", "+"] as const).map((sign) => createElement("button", {
        key: sign, accessibilityLabel: `Owner sets ${sign}`, onPress: () => setValue((now) => withAmountSign(now, sign)),
      })));
  }
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Owner))); });
  if (focus) input().props.onFocus();
  return phoneFor();
}

/** The owner's control that sets the sign beside the field, as the posting editor does from the entry's category. */
const ownerSign = (sign: "-" | "+") =>
  root.root.findAll((node) => node.props.accessibilityLabel === `Owner sets ${sign}` && typeof node.props.onPress === "function")[0];

function phoneFor() {
  let node = input();
  let text = "";
  let start = 0;
  let end = 0;
  /** A new input holds the text it was rendered with; the field never writes to the one the person types in. */
  function settle() {
    if (input() === node) return;
    node = input();
    text = input().props.value as string;
    start = end = text.length;
  }
  return {
    get text() { return text; },
    get caret() { return [start, end]; },
    select(a: number, b = a) { start = a; end = b; settle(); },
    async edit(insert: string, del: 0 | -1 | 1 = 0) {
      let a = start, b = end;
      if (a === b && del === -1) a = Math.max(0, a - 1);
      if (a === b && del === 1) b = Math.min(text.length, b + 1);
      const next = text.slice(0, a) + insert + text.slice(b);
      text = next; start = end = a + insert.length;
      if (next !== (input().props.value as string)) await act(async () => input().props.onChangeText(text));
      settle();
    },
    async sign(sign: "-" | "+") {
      await act(async () => ownerSign(sign).props.onPress());
      settle();
    },
  };
}

class Reference {
  text = ""; sign = ""; a = 0; b = 0;
  constructor(public precision: number, public cop: boolean) {}
  edit(kind: "type" | "back" | "delete", inserted = "") {
    if ((kind === "back" && this.a === 0 && this.b === 0) || (kind === "delete" && this.a === this.text.length && this.b === this.a)) return;
    let a = this.a, b = this.b;
    if (a === b && kind === "back") a = Math.max(0, a - 1);
    if (a === b && kind === "delete") b = Math.min(this.text.length, b + 1);
    if (kind === "back" || kind === "delete") inserted = "";
    this.text = this.text.slice(0, a) + inserted + this.text.slice(b);
    this.a = this.b = a + inserted.length;
  }
  shown() { return this.cop ? this.text.replaceAll(".", ",") : this.text; }
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

const signs = ["-", "+", "−"] as const;

test.each([false, true].flatMap((cop) => ([0, 2, 3] as const).flatMap((precision) => [false, true].map((typedSigns) => [cop, precision, typedSigns] as const))))(
  "random actions, cop=%s precision=%s typed signs=%s: the value is always the visible text's reading, and it is the person's intent",
  async (cop, precision, typedSigns) => {
    const random = rng(12239 + precision * 7919 + (cop ? 600 : 0) + (typedSigns ? 999 : 0));
    let divergences = 0;
    let actions = 0;
    let refused = 0;
    const mark = cop ? "," : ".";
    for (let sequence = 0; sequence < sequences; sequence++) {
      const phone = await mount(cop, precision);
      const reference = new Reference(precision, cop);
      let intact = true;
      for (let step = 0; step < steps; step++) {
        const k = random();
        const digit = String(Math.floor(random() * 10));
        if (reference.text.replace(/\D/g, "").length > 10) { reference.edit("back"); await phone.edit("", -1); }
        else if (k < 0.39) { reference.edit("type", digit); await phone.edit(digit); }
        else if (k < 0.51) { reference.edit("back"); await phone.edit("", -1); }
        else if (k < 0.58) { reference.edit("delete"); await phone.edit("", 1); }
        else if (k < 0.69) { const a = Math.floor(random() * (phone.text.length + 1)); reference.a = reference.b = a; phone.select(a); }
        else if (k < 0.77) {
          const a = Math.floor(random() * (phone.text.length + 1)), b = Math.floor(random() * (phone.text.length + 1));
          reference.a = Math.min(a, b); reference.b = Math.max(a, b);
          phone.select(Math.min(a, b), Math.max(a, b));
          reference.edit("type", digit); await phone.edit(digit);
        } else if (k < 0.82) { reference.edit("type", "."); await phone.edit(mark); }
        else if (k < 0.87) {
          if (typedSigns) {
            const typed = signs[Math.floor(random() * signs.length)];
            reference.edit("type", typed); await phone.edit(typed);
          } else {
            const sign = random() < 0.5 ? "-" : "+";
            reference.sign = sign; await phone.sign(sign);
          }
        }
        else if (k < 0.94) { const pasted = String(10 + Math.floor(random() * 90)); reference.edit("type", pasted); await phone.edit(pasted); }
        else {
          const pasted = cop ? "1.234" : "1,234";
          reference.a = 0; reference.b = reference.text.length; reference.edit("type", "1234");
          phone.select(0, phone.text.length); await phone.edit("", -1); await phone.edit(pasted);
          expect(input().props.value).toBe(pasted);
          expect(session.review, "a pasted group mark awaits confirmation").not.toBeNull();
          expect(sendableMinorUnits(read(), cop ? "COP" : "USD")).toBeNull();
          const confirm = root.root.findAll((node) => String(node.props.accessibilityLabel).startsWith("Confirm ") && typeof node.props.onPress === "function")[0];
          await act(async () => confirm.props.onPress());
          expect(sendableMinorUnits(read(), cop ? "COP" : "USD")).toBe((reference.sign === "-" ? -1 : 1) * 1234 * 10 ** precision);
          phone.select(0, phone.text.length); await phone.edit("", -1);
          reference.text = ""; reference.a = reference.b = 0;
        }
        actions++;
        const visible = phone.text;
        if (/[+−-]/.test(visible)) {
          refused++;
          expect(sendableMinorUnits(read(), cop ? "COP" : "USD"), `a typed sign in ${JSON.stringify(visible)} is never sent`).toBeNull();
        }
        expect(input().props.value, `field shows the phone's text after step ${step}`).toBe(visible);
        expect(shownSign(), "the sign beside the field is the owner's").toBe(reference.sign);
        expect(displayedMinorUnits(session), `value of ${JSON.stringify(visible)}`).toBe(readsAs(shownSign(), visible, cop, precision));
        if (session.review) expect(sendableMinorUnits(read(), cop ? "COP" : "USD")).toBeNull();
        else expect(sendableMinorUnits(read(), cop ? "COP" : "USD"), `sendable once the phone shows ${JSON.stringify(visible)}`).toBe(displayedMinorUnits(session));
        if (intact && (visible !== reference.shown() || displayedMinorUnits(session) !== reference.value()
          || phone.caret[0] !== reference.a || phone.caret[1] !== reference.b)) { divergences++; intact = false; }
      }
      await act(async () => { root?.unmount(); });
    }
    console.log(`independent cop=${cop} precision=${precision} typed signs=${typedSigns}: ${actions} actions, ${refused} steps showed a typed sign, ${divergences} sequences left the reference's intent unexplained`);
    expect(divergences).toBe(0);
    if (typedSigns) expect(refused, "typed signs were exercised").toBeGreaterThan(0);
  },
  120_000,
);

const interleavings = Number(process.env.AMOUNT_INTERLEAVINGS ?? 60);
const interleavingSteps = Number(process.env.AMOUNT_INTERLEAVING_STEPS ?? 100);

/**
 * Finding A of the fourth review. The person types digits, either mark and now and then a sign, taps, ends editing and
 * presses Save while the owner sets the sign beside the field, and React Native delivers the phone's events late, in
 * any order the platform allows (`reactNativeInput`). Whenever Save sends while every edit the phone made has reached
 * JavaScript, the amount is what the phone's text reads at that moment, with the sign beside it, by the independent
 * reader; a keystroke still on its way is beyond any app. Once nothing is in flight, a text that reads as an amount is
 * sent, after the person confirms it if asked.
 */
test.each((["android", "ios"] as const).flatMap((platform) => [false, true].map((cop) => [platform, cop] as const)))(
  "every interleaving on %s, cop=%s: Save sends what the phone's text reads or nothing, and a quiet phone's amount is sent",
  async (platform, cop) => {
    const precision = 2;
    const random = rng(7717 + (platform === "ios" ? 31 : 0) + (cop ? 600 : 0));
    const mark = cop ? "," : ".";
    let saves = 0;
    let sent = 0;
    let dropped = 0;
    for (let sequence = 0; sequence < interleavings; sequence++) {
      await mount(cop, precision, false);
      const phone = reactNativeInput(input, platform);
      phone.tap(0);
      const shown = () => shownSign() + phone.text;
      const reads = () => readsAs(shownSign(), phone.text, cop, precision);
      const save = (when: string) => {
        if (phone.reporting) return null;
        const amount = sendableMinorUnits(read(), cop ? "COP" : "USD");
        saves++;
        if (amount === null) return null;
        sent++;
        expect(amount, `${when}: sent while the phone shows ${JSON.stringify(shown())}`).toBe(reads());
        return amount;
      };
      for (let step = 0; step < interleavingSteps; step++) {
        const k = random();
        const digit = String(Math.floor(random() * 10));
        if (k < 0.2) phone.key(digit);
        else if (k < 0.21) phone.key(random() < 0.5 ? "." : ",");
        else if (k < 0.25) phone.backspace();
        else if (k < 0.3) phone.tap(Math.floor(random() * (phone.text.length + 1)));
        else if (k < 0.32) phone.tap(phone.caret.end + 1);
        else if (k < 0.34) phone.done();
        else if (k < 0.64) await phone.deliver();
        else if (k < 0.74) phone.apply();
        else if (k < 0.76) phone.key(mark);
        else if (k < 0.765) phone.key(signs[Math.floor(random() * signs.length)]);
        else if (k < 0.86) await phone.press(ownerSign(random() < 0.5 ? "-" : "+"));
        else save(`sequence ${sequence} step ${step}`);
      }
      await phone.quiesce();
      dropped += phone.dropped;
      const confirm = root.root.findAll((node) => String(node.props.accessibilityLabel).startsWith("Confirm ") && typeof node.props.onPress === "function")[0];
      if (confirm) await act(async () => confirm.props.onPress());
      expect(sendableMinorUnits(read(), cop ? "COP" : "USD"), `sequence ${sequence}, quiet, the phone shows ${JSON.stringify(shown())}`).toBe(reads());
      await act(async () => { root?.unmount(); });
    }
    console.log(`interleavings ${platform} cop=${cop}: ${saves} saves, ${sent} sent, ${dropped} writes dropped`);
    expect(sent, "Save sent an amount in a fair share of the checks").toBeGreaterThan(saves / 5);
    expect(dropped, "the field never writes to the text the person types in, so the phone drops nothing").toBe(0);
  },
  120_000,
);
