import * as React from "react";
import { createElement, useState } from "react";
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
import { amountMinorUnits, openAmount, type AmountSession } from "./session";

type Event =
  | { kind: "text"; text: string }
  | { kind: "selection"; start: number; end: number }
  | { kind: "keyPress"; key: string }
  | { kind: "decimal" | "sign" }
  | { kind: "replace"; currency: string; text: string }
  | { kind: "send"; expect: number | null };
type Recording = { device: string; source: string; currency: string; initialText: string; finalText: string; sends: Array<number | null>; events: Event[] };

const directory = join(__dirname, "fixtures");
const recordings = readdirSync(directory).filter((name) => name.endsWith(".json"))
  .map((name) => [name, JSON.parse(readFileSync(join(directory, name), "utf8")) as Recording] as const);

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

test("the recordings cover typing, editing, pasting, the field's keys and an owner's replacement", () => {
  const kinds = new Set(recordings.flatMap(([, recording]) => recording.events.map((event) => event.kind)));
  expect([...kinds].sort()).toEqual(["decimal", "keyPress", "replace", "selection", "send", "sign", "text"]);
  expect(recordings.length).toBeGreaterThanOrEqual(10);
});

test.each(recordings)("replaying %s from the phone shows the text the phone showed and sends what it sent", async (_name, recording) => {
  let session: AmountSession = openAmount(recording.currency, recording.initialText);
  let replace: (next: AmountSession) => void = () => {};
  function Owner() {
    const [value, setValue] = useState(session);
    session = value;
    replace = setValue;
    return createElement(AmountField, { session: value, onChange: setValue, editable: true, inputAccessibilityLabel: "Amount", sign: {} });
  }
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Owner))); });
  const input = () => root!.root.find((node) => node.type === "input");
  const key = (label: RegExp) => root!.root.find((node) => node.type === "button" && label.test(String(node.props.accessibilityLabel)));
  const sends: Array<number | null> = [];
  for (const event of recording.events) {
    if (event.kind === "text") await act(async () => input().props.onChangeText(event.text));
    else if (event.kind === "selection") await act(async () => input().props.onSelectionChange({ nativeEvent: { selection: event } }));
    else if (event.kind === "decimal") await act(async () => key(/^Type a decimal/).props.onPress());
    else if (event.kind === "sign") await act(async () => key(/^Switch the amount/).props.onPress());
    else if (event.kind === "replace") await act(async () => replace(openAmount(event.currency, event.text)));
    else if (event.kind === "send") sends.push(amountMinorUnits(session));
  }
  expect(input().props.value).toBe(recording.finalText);
  expect(sends).toEqual(recording.sends);
});
