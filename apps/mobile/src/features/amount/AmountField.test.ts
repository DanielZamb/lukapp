import * as React from "react";
import { createElement, useEffect, useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  TextInput: "input",
  Platform: { OS: "android" },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

import { LanguageProvider, useLanguage } from "../../i18n";
import { AmountField } from "./AmountField";
import { samsungPhone } from "./phone.testSupport";
import { amountMinorUnits, openAmount, type AmountSession } from "./session";

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

const sent: Array<{ currency: string; minorUnits: number }> = [];
let replaceSession: (session: AmountSession) => void = () => {};

function Owner({ currency, opened }: { currency: string; opened?: string }) {
  const [session, setSession] = useState<AmountSession>(() => openAmount(currency, opened));
  replaceSession = setSession;
  const language = useLanguage();
  if (session.currency !== currency) setSession(openAmount(currency));
  return createElement("view", null,
    createElement(AmountField, { session, onChange: setSession, editable: true, inputAccessibilityLabel: "Amount", sign: {} }),
    createElement("button", {
      accessibilityLabel: "Send", accessibilityRole: "button",
      onPress: () => {
        const minorUnits = amountMinorUnits(session);
        if (minorUnits !== null) sent.push({ currency: session.currency, minorUnits });
      },
    }),
    createElement("button", { accessibilityLabel: "Spanish", accessibilityRole: "button", onPress: () => language.setPreference("es") }));
}

async function render(currency: string, language: "en" | "es" = "en", opened?: string) {
  sent.length = 0;
  await act(async () => { root?.unmount(); });
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: language }, createElement(Owner, { currency, opened })));
  });
  return samsungPhone(input);
}
async function rerender(currency: string) {
  await act(async () => root!.update(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Owner, { currency }))));
}

const input = () => root!.root.find((node) => node.type === "input" && node.props.accessibilityLabel === "Amount");
const button = (label: string) => root!.root.findByProps({ accessibilityLabel: label, accessibilityRole: "button" });
const texts = () => root!.root.findAll((node) => node.type === "text").map((node) => node.children.join(""));
const alerts = () => root!.root.findAll((node) => node.type === "text" && node.props.accessibilityRole === "alert")
  .map((node) => node.children.join(""));
const send = async () => { await act(async () => button("Send").props.onPress()); };
const decimalKey = { COP: "Type a decimal comma for COP", USD: "Type a decimal point for USD" } as const;

for (const language of ["en", "es"] as const) {
  test(`${language}: digits and the decimal key give exact minor units, and the field shows exactly what was typed`, async () => {
    const decimal = { COP: { en: "Type a decimal comma for COP", es: "Escribir coma decimal en COP" },
      USD: { en: "Type a decimal point for USD", es: "Escribir punto decimal en USD" } } as const;
    for (const [currency, shown, reading] of [
      ["COP", "1234,50", { en: "Reads as COP 1.234,50", es: "Se lee como COP 1.234,50" }],
      ["USD", "1234.50", { en: "Reads as USD 1,234.50", es: "Se lee como USD 1,234.50" }]] as const) {
      const phone = await render(currency, language);
      await phone.type("1234");
      await phone.press(button(decimal[currency][language]));
      await phone.type("50");
      expect(phone.text).toBe(shown);
      expect(input().props.value).toBe(shown);
      expect(texts()).toContain(reading[language]);
      await send();
      expect(sent).toEqual([{ currency, minorUnits: 123450 }]);
    }
  });

  test(`${language}: the phone's other separator key is refused with a hint, never reinterpreted`, async () => {
    const hints = {
      COP: { en: "Use the comma for decimals, for example 12,50", es: "Usa la coma para los decimales, por ejemplo 12,50" },
      USD: { en: "Use the point for decimals, for example 12.50", es: "Usa el punto para los decimales, por ejemplo 12.50" },
    } as const;
    for (const [currency, typed] of [["COP", "12.50"], ["USD", "12,50"]] as const) {
      const phone = await render(currency, language);
      await phone.type(typed);
      expect(input().props.value).toBe(typed);
      expect(alerts()).toEqual([hints[currency][language]]);
      await send();
      expect(sent).toEqual([]);
    }
  });
}

test.each([
  ["COP", "1.234", 123400, "COP 1.234,00"], ["COP", "1,234", null, null], ["COP", "12.50", null, null], ["COP", "12,50", 1250, "COP 12,50"],
  ["USD", "1.234", null, null], ["USD", "1,234", 123400, "USD 1,234.00"], ["USD", "12.50", 1250, "USD 12.50"], ["USD", "12,50", null, null],
] as const)("thousand-fold text %s %s: typed sends %s; pasted, it sends only after %s is confirmed", async (currency, text, minorUnits, shown) => {
  let phone = await render(currency);
  await phone.type(text);
  await send();
  expect(sent).toEqual(minorUnits === null ? [] : [{ currency, minorUnits }]);
  phone = await render(currency);
  await phone.paste(text);
  expect(input().props.value).toBe(text);
  await send();
  expect(sent).toEqual([]);
  if (shown === null) {
    expect(root!.root.findAll((node) => node.type === "button" && String(node.props.accessibilityLabel).startsWith("Confirm"))).toEqual([]);
    return;
  }
  expect(texts()).toContain(`You pasted ${shown}. Make sure it's right before you continue.`);
  await phone.press(button(`Confirm ${shown}`));
  await send();
  expect(sent).toEqual([{ currency, minorUnits }]);
});

test("finding 1: a reopened amount edited in the middle keeps every digit where the person put it", async () => {
  const phone = await render("USD", "en", "1,111");
  expect(input().props.value).toBe("1111");
  await phone.select(3);
  await phone.backspace();
  await phone.type("2");
  expect(phone.text).toBe("1121");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 112100 }]);
});

test("the first review's sequence: Backspace between equal digits, then a digit, reads as the text shows", async () => {
  const phone = await render("USD");
  await phone.type("1111");
  await phone.select(2);
  await phone.backspace();
  await phone.type("2");
  expect(phone.text).toBe("1211");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 121100 }]);
});

test("typing over a selection, with the stale caret the phone reports first, sends what the text shows", async () => {
  const phone = await render("COP");
  await phone.type("1211");
  await phone.select(0, 4);
  await phone.type("5");
  expect(phone.log).toContain("caret 4-4");
  expect(input().props.value).toBe("5");
  await send();
  expect(sent).toEqual([{ currency: "COP", minorUnits: 500 }]);
});

test("finding 3: a paste awaits confirmation through edits that restore it, and through completing it by typing", async () => {
  let phone = await render("USD");
  await phone.paste("1,234");
  await phone.type("5");
  await phone.backspace();
  expect(phone.text).toBe("1,234");
  await send();
  expect(sent).toEqual([]);
  await phone.press(button("Confirm USD 1,234.00"));
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 123400 }]);
  for (const [pasted, typed, text] of [["1,234.", "5", "1,234.5"], ["1,23", "4", "1,234"]] as const) {
    phone = await render("USD");
    await phone.paste(pasted);
    await phone.type(typed);
    expect(phone.text).toBe(text);
    await send();
    expect(sent).toEqual([]);
    expect(button(`Confirm USD ${text === "1,234" ? "1,234.00" : "1,234.50"}`)).toBeTruthy();
  }
});

test("finding 4: a typed amount replaced in one change by another with the same separators awaits confirmation", async () => {
  const phone = await render("USD");
  await phone.type("1,234");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 123400 }]);
  await phone.select(0, 5);
  await phone.paste("9,876");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 123400 }]);
  expect(texts()).toContain("You pasted USD 9,876.00. Make sure it's right before you continue.");
});

test("digits pasted without a separator need no confirmation; removing every separator ends one", async () => {
  let phone = await render("USD");
  await phone.paste("1234");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 123400 }]);
  phone = await render("USD");
  await phone.paste("1,234");
  await phone.select(2);
  await phone.backspace();
  expect(phone.text).toBe("1234");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 123400 }]);
});

test("finding 6: caret reports that arrive late never move a digit, since the value is the text", async () => {
  const phone = await render("USD");
  await phone.type("12");
  await act(async () => input().props.onSelectionChange({ nativeEvent: { selection: { start: 1, end: 1 } } }));
  await phone.type("3");
  expect(phone.text).toBe("123");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 12300 }]);
});

test("finding 7: an app key's write the phone drops for a newer keystroke leaves the field showing and sending the phone's text", async () => {
  const phone = await render("USD");
  await phone.type("12");
  await phone.press(button(decimalKey.USD), { hold: true });
  expect(input().props.value).toBe("12.");
  await phone.type("5", { racing: true });
  expect(phone.log).toContain("  command dropped");
  expect(phone.text).toBe("125");
  expect(input().props.value).toBe("125");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 12500 }]);
});

test("finding 8: a session the owner replaces is not overwritten by a change still in flight from the old input", async () => {
  const phone = await render("USD");
  await phone.type("1");
  const old = input();
  const inFlight = old.props.onChangeText as (text: string) => void;
  await act(async () => replaceSession(openAmount("USD", "99")));
  expect(input()).not.toBe(old);
  await phone.deliverToStale(inFlight, "12");
  expect(input().props.value).toBe("99");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 9900 }]);
  await rerender("COP");
  await phone.deliverToStale(inFlight, "123");
  expect(input().props.value).toBe("");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 9900 }]);
});

test("the sign key writes only the sign and keeps the caret the same distance from the end", async () => {
  const phone = await render("COP");
  await phone.type("12345");
  await phone.select(3);
  await phone.press(button(decimalKey.COP));
  expect(phone.text).toBe("123,45");
  expect(phone.caret).toEqual({ start: 4, end: 4 });
  await phone.press(button("Switch the amount between minus and plus"));
  expect(phone.text).toBe("-123,45");
  expect(phone.caret).toEqual({ start: 5, end: 5 });
  await send();
  await phone.press(button("Switch the amount between minus and plus"));
  await send();
  expect(sent).toEqual([{ currency: "COP", minorUnits: -12345 }, { currency: "COP", minorUnits: 12345 }]);
  expect(phone.text).toBe("+123,45");
});

test("the decimal key moves the caret after a mark already written, and starts with 0 before any digit", async () => {
  let phone = await render("USD");
  await phone.type("12.5");
  await phone.select(1);
  await phone.press(button(decimalKey.USD));
  expect(phone.text).toBe("12.5");
  expect(phone.caret).toEqual({ start: 3, end: 3 });
  phone = await render("USD");
  await phone.press(button(decimalKey.USD));
  await phone.type("5");
  expect(phone.text).toBe("0.5");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 50 }]);
});

test("the phone's own minus from the .- key is read literally", async () => {
  const phone = await render("USD");
  await phone.type("5.");
  await phone.cycleDotToMinus();
  expect(input().props.value).toBe("5-");
  await send();
  expect(sent).toEqual([]);
});

test("a language switch mid-entry keeps the text, the value and the session", async () => {
  const phone = await render("USD");
  await phone.type("1234");
  await phone.press(button(decimalKey.USD));
  await phone.type("5");
  await act(async () => button("Spanish").props.onPress());
  expect(input().props.value).toBe("1234.5");
  expect(button("Escribir punto decimal en USD")).toBeTruthy();
  await phone.type("6");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 123456 }]);
});

test("the decimal key says a currency has no decimals, stays a touch target so the keyboard stays open, and writes nothing", async () => {
  const phone = await render("JPY");
  await phone.type("12");
  const key = button("JPY amounts have no decimals");
  expect(key.props.accessibilityState).toEqual({ disabled: true });
  expect(key.props.disabled).toBe(false);
  await phone.press(key);
  expect(phone.text).toBe("12");
  await send();
  expect(sent).toEqual([{ currency: "JPY", minorUnits: 12 }]);
});

test("the reading line is always laid out, hidden from screen readers while there is nothing to read", async () => {
  const phone = await render("USD");
  const line = () => root!.root.findAll((node) => node.type === "text" && node.props.importantForAccessibility !== undefined)[0];
  expect(line().children).toEqual([" "]);
  expect(line().props.accessibilityElementsHidden).toBe(true);
  await phone.type("5");
  expect(line().children).toEqual(["Reads as USD 5.00"]);
  expect(line().props.accessibilityElementsHidden).toBe(false);
});

test("a lone zero is selected on focus so the first key replaces it", async () => {
  const phone = await render("USD", "en", "0");
  expect(input().props.selectTextOnFocus).toBe(true);
  await phone.select(0, 1);
  await phone.type("7");
  expect(input().props.value).toBe("7");
  expect(input().props.selectTextOnFocus).toBe(false);
});

test("an amount the app opens grouped shows without its group marks and reads the same", async () => {
  await render("COP", "en", "-1.234.567,50");
  expect(input().props.value).toBe("-1234567,50");
  expect(texts()).toContain("Reads as −COP 1.234.567,50");
  await render("COP", "en", "1.23");
  expect(input().props.value).toBe("1.23");
});

test("a currency change starts a new input with no text carried over", async () => {
  const phone = await render("COP");
  await phone.type("1234");
  const old = input();
  await rerender("USD");
  expect(input() === old).toBe(false);
  expect(input().props.value).toBe("");
  await phone.type("1.5");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 150 }]);
});

test("rendered with a parent wrapper that echoes the same text, the input is kept", async () => {
  const phone = await render("USD");
  await phone.type("1");
  const kept = input();
  await act(async () => replaceSession(openAmount("USD", "1")));
  expect(input()).toBe(kept);
  await phone.type("2");
  expect(input().props.value).toBe("12");
});

test("an owner that renders the field a commit late, as a bottom sheet's portal does, never makes the input show an older text", async () => {
  const values: string[] = [];
  function Recorder(props: Record<string, unknown>) { values.push(String(props.value)); return createElement("input", props); }
  function LateOwner() {
    const [session, setSession] = useState(() => openAmount("USD"));
    const [shown, setShown] = useState(session);
    useEffect(() => { setShown(session); }, [session]);
    return createElement(AmountField, { session: shown, onChange: setSession, editable: true, inputAccessibilityLabel: "Amount",
      InputComponent: Recorder as never });
  }
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(LateOwner))); });
  for (const text of ["1", "12", "123", "1234"]) {
    values.length = 0;
    await act(async () => input().props.onChangeText(text));
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => value === text), `renders after ${text}: ${values.join(",")}`).toBe(true);
  }
});

test("a field that is not editable shows its owner's text and takes no native change", async () => {
  function Frozen() {
    const [session, setSession] = useState(() => openAmount("USD", "12"));
    return createElement("view", null,
      createElement(AmountField, { session, onChange: setSession, editable: false, inputAccessibilityLabel: "Amount" }),
      createElement("button", { accessibilityLabel: "Send", accessibilityRole: "button",
        onPress: () => { const minorUnits = amountMinorUnits(session); if (minorUnits !== null) sent.push({ currency: "USD", minorUnits }); } }));
  }
  sent.length = 0;
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Frozen))); });
  await act(async () => input().props.onChangeText("99"));
  expect(input().props.value).toBe("12");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 1200 }]);
});
