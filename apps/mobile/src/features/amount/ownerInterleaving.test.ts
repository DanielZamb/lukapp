import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", TextInput: "input", Platform: { OS: "android" },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

import { LanguageProvider } from "../../i18n";
import { confirmShown, showing, type Shown } from "../confirmation";
import { AmountField } from "./AmountField";
import { reactNativeInput, readsAs } from "./phone.testSupport";
import { nativeText, openAmount, sendableMinorUnits, withAmountSign, type AmountAtPress, type AmountSession } from "./session";
import { useFormState, withFields } from "./useAmountState";

type Currency = "COP" | "USD" | "JPY";
/** How the independent reader reads each currency: its separators, how many decimals it has, and its decimal mark. */
const grammar: Record<Currency, { cop: boolean; precision: number; mark: string }> = {
  COP: { cop: true, precision: 2, mark: "," },
  USD: { cop: false, precision: 2, mark: "." },
  JPY: { cop: true, precision: 0, mark: "," },
};
type Sent = { currency: Currency; minorUnits: number };
/** An owner of one amount whose currency, amount and an open confirmation all change while the phone types. */
type Form = { currency: Currency; amount: AmountSession; shown: Shown<Sent> | null };

let root: ReactTestRenderer | undefined;
let owner: { read: () => Form; set: (next: (now: Form) => Form) => boolean; rendered: Form };
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

function Owner({ start }: { start: Currency }) {
  const [form, setForm, readForm] = useFormState<Form>(() => ({ currency: start, amount: openAmount(start), shown: null }));
  owner = { read: readForm as unknown as () => Form, set: setForm, rendered: form };
  return createElement(AmountField, {
    session: form.amount, editable: true, inputAccessibilityLabel: "Amount",
    onChange: (amount: AmountSession) => { setForm((now) => withFields(now, { amount })); },
  });
}

function rng(seed: number) { let x = seed; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
const input = () => root!.root.findByType("input" as never);
const shownSign = () => {
  const label = root!.root.findAll((node) => node.type === "text" && ["minus", "plus"].includes(node.props.accessibilityLabel))[0]?.props.accessibilityLabel;
  return label === "minus" ? "-" : label === "plus" ? "+" : "";
};
/** What the owner would send now, in its own currency. */
function sendable(): Sent | null {
  const now = owner.read();
  const minorUnits = sendableMinorUnits(now.amount as AmountAtPress, now.currency);
  return minorUnits === null ? null : { currency: now.currency, minorUnits };
}

const runs = Number(process.env.AMOUNT_OWNER_INTERLEAVINGS ?? 40);
const steps = Number(process.env.AMOUNT_OWNER_INTERLEAVING_STEPS ?? 120);

/**
 * The fourth review's finding 1, generalized. Between the phone's native events the owner changes its currency,
 * replaces its amount, sets the sign beside it, or opens a confirmation of the amount it would send; each change lands in the same task as a
 * delivered event, before React renders. Whatever Save sends, and whatever a confirmation confirms, is in the owner's
 * currency now and reads, under that currency's grammar, as a text the phone showed in the current input: the text it
 * shows now once the phone is quiet. A confirmation whose amount changed is withdrawn, never confirmed.
 */
test.each((["android", "ios"] as const).flatMap((platform) =>
  ([["COP", "USD"], ["COP", "JPY"], ["USD", "JPY"]] as const).map(([first, second]) => [platform, first, second] as const)))(
  "owner changes between native events on %s, %s and %s: nothing is sent or confirmed but what the phone shows in the owner's currency",
  async (platform, first, second) => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const random = rng(4421 + (platform === "ios" ? 17 : 0) + first.length * 31 + second.charCodeAt(0));
    const tally = { saves: 0, sent: 0, confirmed: 0, withdrawn: 0, changes: 0, refused: 0 };
    for (let run = 0; run < runs; run++) {
      await act(async () => {
        root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Owner, { start: first })));
      });
      const phone = reactNativeInput(input, platform);
      phone.tap(0);
      let seen = { texts: new Set([""]), signs: new Set([""]) };
      const look = () => { seen.texts.add(phone.text); seen.signs.add(shownSign()); };
      /** Whether the input showed `minorUnits` in `currency`: a text it showed, with a sign the field showed beside the input. */
      const showed = (minorUnits: number, { cop, precision }: { cop: boolean; precision: number }) =>
        [...seen.texts].some((text) => [...seen.signs].some((sign) => readsAs(sign, text, cop, precision) === minorUnits));
      const readable = (sent: Sent, when: string) => {
        const { cop, precision } = grammar[sent.currency];
        expect(sent.currency, when).toBe(owner.read().currency);
        if (!phone.reporting) expect(sent.minorUnits, `${when}: the phone shows ${JSON.stringify(shownSign() + phone.text)}`)
          .toBe(readsAs(shownSign(), phone.text, cop, precision));
        else expect(showed(sent.minorUnits, { cop, precision }),
          `${when}: ${sent.minorUnits} ${sent.currency} is no text the current input showed: ${JSON.stringify([...seen.texts])}`).toBe(true);
      };
      const ownerChange = async (change: (now: Form) => Form) => {
        tally.changes += 1;
        const before = owner.read().amount;
        await phone.deliver(() => { owner.set(change); });
        phone.sync();
        const now = owner.read().amount;
        if (now.opening !== before.opening) seen = { texts: new Set([nativeText(now)]), signs: new Set([now.sign]) };
        look();
      };
      for (let step = 0; step < steps; step++) {
        const k = random();
        const digit = String(Math.floor(random() * 10));
        const when = `run ${run} step ${step}`;
        if (k < 0.2) phone.key(digit);
        else if (k < 0.22) phone.key(random() < 0.5 ? "." : ",");
        else if (k < 0.26) phone.backspace();
        else if (k < 0.3) phone.tap(Math.floor(random() * (phone.text.length + 1)));
        else if (k < 0.32) phone.done();
        else if (k < 0.55) await phone.deliver();
        else if (k < 0.62) phone.apply();
        else if (k < 0.64) phone.key(grammar[owner.read().currency].mark);
        else if (k < 0.645) phone.key(["-", "+", "−"][Math.floor(random() * 3)]);
        else if (k < 0.7) {
          const sign = random() < 0.5 ? "-" : "+";
          await ownerChange((now) => ({ ...now, amount: withAmountSign(now.amount, sign) }));
        }
        else if (k < 0.74) {
          const other = owner.read().currency === first ? second : first;
          await ownerChange((now) => ({ ...now, currency: other, amount: openAmount(other), shown: null }));
        } else if (k < 0.78) {
          const text = String(1 + Math.floor(random() * 99));
          await ownerChange((now) => ({ ...now, amount: openAmount(now.currency, text) }));
        } else if (k < 0.84) {
          const open = sendable();
          if (open) await ownerChange((now) => ({ ...now, shown: showing(open) }));
        } else if (k < 0.92) {
          const pressed = owner.rendered.shown;
          if (pressed) {
            const outcome = confirmShown(owner.read().shown, pressed, sendable());
            if (outcome === "confirmed") { tally.confirmed += 1; readable(pressed.snapshot, `${when}, confirmed`); }
            if (outcome === "changed") tally.withdrawn += 1;
            if (outcome !== "stale") await act(async () => { owner.set((now) => ({ ...now, shown: null })); });
          }
        } else {
          tally.saves += 1;
          const sent = sendable();
          if (sent) { tally.sent += 1; readable(sent, `${when}, saved`); }
        }
        look();
      }
      await phone.quiesce();
      look();
      const quiet = sendable();
      const { cop, precision } = grammar[owner.read().currency];
      const reads = readsAs(shownSign(), phone.text, cop, precision);
      if (quiet) expect(quiet.minorUnits, `run ${run}, quiet`).toBe(reads);
      tally.refused += phone.dropped;
      await act(async () => { root?.unmount(); });
      root = undefined;
    }
    console.log(`owner interleavings ${platform} ${first}/${second}: ${JSON.stringify(tally)}`);
    expect(tally.sent, "Save sent an amount in a fair share of the checks").toBeGreaterThan(tally.saves / 10);
    expect(tally.confirmed, "some confirmations held").toBeGreaterThan(0);
    expect(tally.withdrawn, "some confirmations were withdrawn").toBeGreaterThan(0);
  },
  120_000,
);
