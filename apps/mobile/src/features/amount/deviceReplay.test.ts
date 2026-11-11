import * as React from "react";
import { createElement } from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  TextInput: "input",
  Platform: { OS: "android" },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

import { LanguageProvider } from "../../i18n";
import { AmountField } from "./AmountField";
import { openAmount, sendableMinorUnits, type AmountAtPress, type AmountSession } from "./session";
import { useAmountState } from "./useAmountState";

type Event =
  | { kind: "text"; text: string }
  | { kind: "selection"; start: number; end: number }
  | { kind: "keyPress"; key: string }
  | { kind: "replace"; currency: string; text: string }
  | { kind: "send"; expect: number | null };
type Recording = { device: string; source: string; currency: string; initialText: string; finalText: string; sends: Array<number | null>; events: Event[] };

const directory = join(__dirname, "fixtures");
const recordings = readdirSync(directory).filter((name) => name.endsWith(".json"))
  .map((name) => [name, JSON.parse(readFileSync(join(directory, name), "utf8")) as Recording] as const);

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

/**
 * The field has no keys of its own, so every recording is replayed exactly as the phone reported it. Recordings that
 * pressed the field's former sign or decimal key cannot be replayed and were removed rather than adapted.
 */
test("the recordings cover typing, editing, pasting and an owner's replacement, and press no key of the field", () => {
  const kinds = new Set(recordings.flatMap(([, recording]) => recording.events.map((event) => event.kind)));
  expect([...kinds].sort()).toEqual(["keyPress", "replace", "selection", "send", "text"]);
  expect(recordings.length).toBeGreaterThanOrEqual(10);
});

test.each(recordings)("replaying %s from the phone shows the text the phone showed and sends what it sent", async (name, recording) => {
  const initial: AmountSession = openAmount(recording.currency, recording.initialText);
  let owner = recording.currency;
  let replace: (next: AmountSession) => void = () => {};
  let read: () => AmountAtPress = () => { throw new Error("Not rendered"); };
  function Owner() {
    const [value, setValue, readValue] = useAmountState(initial);
    read = readValue;
    replace = setValue;
    return createElement(AmountField, { session: value, onChange: setValue, editable: true, inputAccessibilityLabel: "Amount" });
  }
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Owner))); });
  const input = () => root!.root.find((node) => node.type === "input");
  input().props.onFocus();
  expect(input().props.onSelectionChange, "the field takes no caret report, so the recorded ones reach nothing").toBeUndefined();
  const sends: Array<number | null> = [];
  for (const event of recording.events) {
    if (event.kind === "text") await act(async () => input().props.onChangeText(event.text));
    else if (event.kind === "replace") {
      owner = event.currency;
      await act(async () => replace(openAmount(event.currency, event.text)));
      input().props.onFocus();
    } else if (event.kind === "send") sends.push(sendableMinorUnits(read(), owner));
  }
  expect(input().props.value).toBe(recording.finalText);
  expect(sends).toEqual(recording.sends);
});
