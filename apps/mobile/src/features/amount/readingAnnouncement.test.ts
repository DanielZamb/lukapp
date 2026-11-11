import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const announced = vi.hoisted(() => [] as string[]);
vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  TextInput: "input",
  Platform: { OS: "ios" },
  AccessibilityInfo: { announceForAccessibility: (message: string) => { announced.push(message); } },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

import { LanguageProvider } from "../../i18n";
import { AmountField } from "./AmountField";
import { samsungPhone } from "./phone.testSupport";
import { openAmount, type AmountSession } from "./session";
import { useAmountState } from "./useAmountState";

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); announced.length = 0; });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

function Owner() {
  const [session, setSession] = useAmountState<AmountSession>(() => openAmount("COP"));
  return createElement(AmountField, { session, onChange: setSession, editable: true, inputAccessibilityLabel: "Amount", sign: {} });
}

test("third review, finding 5: on iOS a reading that speaks up is announced once, and a calm one is not", async () => {
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "es" }, createElement(Owner))); });
  const phone = samsungPhone(() => root!.root.find((node) => node.type === "input"));
  await phone.type("1");
  expect(announced).toEqual([]);
  await phone.type("2");
  expect(announced).toEqual(["Ahora se lee como COP 12,00"]);
  await act(async () => root!.root.find((node) => node.type === "button" && node.props.accessibilityLabel === "Escribir coma decimal en COP").props.onPress());
  await phone.settle();
  await phone.type("5");
  await phone.type("0");
  expect(announced).toEqual(["Ahora se lee como COP 12,00", "Ahora se lee como COP 12,50"]);
});
