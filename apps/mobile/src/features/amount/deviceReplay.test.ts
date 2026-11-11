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

/**
 * Recordings made with the field that wrote the sign into the phone's text. The current field holds the sign beside
 * that text, so on the same keys the phone's text lacks the sign the old field wrote, its carets sit one place lower,
 * and a sign write the phone dropped for a racing keystroke no longer loses the sign. Each entry states what the
 * current field must show and send. These are adaptations, not recordings: re-record them on the phone.
 */
const withoutWrittenSign: Readonly<Record<string, { finalText: string; sends: Array<number | null> }>> = {
  "r2-S3-cop-decimal-sign-keys.json": { finalText: "123,945", sends: [12345, -12345] },
  "r2-S16-composing-then-sign.json": { finalText: "12.5", sends: [-1250] },
  "r2-S16b-composing-sign-cycle.json": { finalText: "12-", sends: [null] },
  "r2-S18b-burst-with-keys.json": { finalText: "1234567891.3", sends: [-123456789130] },
  "r3-A9-double-key-presses.json": { finalText: "123.4", sends: [12340] },
};

/** The events a phone running the current field reports for a recording made with the field that wrote the sign. */
function adapted(events: readonly Event[]): Event[] {
  let held = "";
  let written = "";
  return events.map((event) => {
    if (event.kind === "replace") { held = event.text; written = ""; return event; }
    if (event.kind === "sign") {
      written = held.startsWith("-") ? "+" : "-";
      held = written + held.replace(/^[+-]/, "");
      return event;
    }
    const carriesSign = written !== "" && held.startsWith(written);
    if (event.kind === "text") {
      held = event.text;
      return written !== "" && event.text.startsWith(written) ? { ...event, text: event.text.slice(written.length) } : event;
    }
    if (event.kind === "selection" && carriesSign)
      return { ...event, start: Math.max(0, event.start - written.length), end: Math.max(0, event.end - written.length) };
    return event;
  });
}

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

test("the recordings cover typing, editing, pasting, the field's keys and an owner's replacement", () => {
  const kinds = new Set(recordings.flatMap(([, recording]) => recording.events.map((event) => event.kind)));
  expect([...kinds].sort()).toEqual(["decimal", "keyPress", "replace", "selection", "send", "sign", "text"]);
  expect(recordings.length).toBeGreaterThanOrEqual(10);
  expect(recordings.filter(([, recording]) => recording.events.some((event) => event.kind === "sign")).map(([name]) => name).sort())
    .toEqual(Object.keys(withoutWrittenSign).sort());
});

test.each(recordings)("replaying %s from the phone shows the text the phone showed and sends what it sent", async (name, recording) => {
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
  const expected = withoutWrittenSign[name] ?? recording;
  for (const event of withoutWrittenSign[name] ? adapted(recording.events) : recording.events) {
    if (event.kind === "text") await act(async () => input().props.onChangeText(event.text));
    else if (event.kind === "selection") await act(async () => input().props.onSelectionChange({ nativeEvent: { selection: event } }));
    else if (event.kind === "decimal") await act(async () => key(/^Type a decimal/).props.onPress());
    else if (event.kind === "sign") await act(async () => key(/^Switch the amount/).props.onPress());
    else if (event.kind === "replace") await act(async () => replace(openAmount(event.currency, event.text)));
    else if (event.kind === "send") sends.push(amountMinorUnits(session));
  }
  expect(input().props.value).toBe(expected.finalText);
  expect(sends).toEqual(expected.sends);
});
