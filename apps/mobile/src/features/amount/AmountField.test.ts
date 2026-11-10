import * as React from "react";
import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  TextInput: "input",
  Platform: { OS: "ios" },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

import { currencyAmountConvention, currencyMinorUnitDigits } from "../../../../../src/accounting/currencies";
import { LanguageProvider, useLanguage } from "../../i18n";
import { AmountField } from "./AmountField";
import { amountMinorUnits, openAmountIn, type AmountSession } from "./session";

const formatOf = (currency: string) => ({ convention: currencyAmountConvention(currency), precision: currencyMinorUnitDigits(currency) });
const open = (currency: string, text = "") => openAmountIn(formatOf(currency), currency, text);

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

const sent: Array<{ currency: string; minorUnits: number }> = [];

function Owner({ currency }: { currency: string }) {
  const [session, setSession] = useState<AmountSession>(() => open(currency));
  const language = useLanguage();
  if (session.currency !== currency) setSession(open(currency));
  return createElement("view", null,
    createElement(AmountField, { session, onChange: setSession, editable: true, accessibilityLabel: "Amount", sign: {} }),
    createElement("button", {
      accessibilityLabel: "Send", accessibilityRole: "button",
      onPress: () => {
        const minorUnits = amountMinorUnits(session);
        if (minorUnits !== null) sent.push({ currency: session.currency, minorUnits });
      },
    }),
    createElement("button", { accessibilityLabel: "Spanish", accessibilityRole: "button", onPress: () => language.setPreference("es") }));
}

async function render(currency: string, language: "en" | "es") {
  sent.length = 0;
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: language }, createElement(Owner, { currency })));
  });
}
async function rerender(currency: string, language: "en" | "es") {
  await act(async () => root!.update(createElement(LanguageProvider, { initialPreference: language }, createElement(Owner, { currency }))));
}

const input = () => root!.root.find((node) => node.type === "input" && node.props.accessibilityLabel === "Amount");
const button = (label: string) => root!.root.findByProps({ accessibilityLabel: label, accessibilityRole: "button" });
const alerts = () => root!.root.findAll((node) => node.type === "text" && node.props.accessibilityRole === "alert")
  .map((node) => node.children.join(""));

async function type(characters: string) {
  for (const character of characters) {
    const field = input();
    const { end } = field.props.selection as { end: number };
    const value = field.props.value as string;
    await act(async () => field.props.onChangeText(value.slice(0, end) + character + value.slice(end)));
  }
}
async function paste(text: string) {
  await act(async () => input().props.onChangeText(text));
}
async function press(label: string) {
  await act(async () => button(label).props.onPress());
}

const decimalLabel = {
  COP: { en: "Type a decimal comma for COP", es: "Escribir coma decimal en COP" },
  USD: { en: "Type a decimal point for USD", es: "Escribir punto decimal en USD" },
} as const;

for (const language of ["en", "es"] as const) {
  test(`${language}: digits and the decimal key give exact minor units in COP and USD`, async () => {
    for (const [currency, shown] of [["COP", ["1", "12", "123", "1.234", "1.234,", "1.234,5", "1.234,50"]],
      ["USD", ["1", "12", "123", "1,234", "1,234.", "1,234.5", "1,234.50"]]] as const) {
      await render(currency, language);
      const seen: string[] = [];
      for (const step of ["1", "2", "3", "4", "decimal", "5", "0"]) {
        if (step === "decimal") await press(decimalLabel[currency][language]);
        else await type(step);
        seen.push(input().props.value);
      }
      expect(seen).toEqual(shown);
      await press("Send");
      expect(sent).toEqual([{ currency, minorUnits: 123450 }]);
    }
  });

  test(`${language}: a canonical amount typed character by character with its own separators`, async () => {
    for (const [currency, typed] of [["COP", "1.234.567,89"], ["USD", "1,234,567.89"]] as const) {
      await render(currency, language);
      await type(typed);
      expect(input().props.value).toBe(typed);
      await press("Send");
      expect(sent).toEqual([{ currency, minorUnits: 123456789 }]);
    }
  });

  test(`${language}: the phone's other separator key is refused with a hint and nothing is sent`, async () => {
    const hints = {
      COP: { en: "Use the comma for decimals, for example 12,50", es: "Usa la coma para los decimales, por ejemplo 12,50" },
      USD: { en: "Use the point for decimals, for example 12.50", es: "Usa el punto para los decimales, por ejemplo 12.50" },
    } as const;
    for (const [currency, typed] of [["COP", "12.50"], ["USD", "12,50"]] as const) {
      await render(currency, language);
      await type(typed);
      expect(input().props.value).toBe(typed);
      expect(alerts()).toEqual([hints[currency][language]]);
      await press("Send");
      expect(sent).toEqual([]);
    }
  });

  test(`${language}: an amount pasted in the other convention stays visible and is refused`, async () => {
    const hints = {
      COP: { en: "Write the amount like this: 1.234,50", es: "Escribe el monto así: 1.234,50" },
      USD: { en: "Write the amount like this: 1,234.50", es: "Escribe el monto así: 1,234.50" },
    } as const;
    for (const [currency, pasted] of [["COP", "1,234.50"], ["USD", "1.234,50"]] as const) {
      await render(currency, language);
      await paste(pasted);
      expect(input().props.value).toBe(pasted);
      expect(alerts()).toEqual([hints[currency][language]]);
      await press("Send");
      expect(sent).toEqual([]);
    }
  });
}

test.each([
  ["COP", "1.234", 123400, 123400], ["COP", "1,234", null, null], ["COP", "12.50", null, null], ["COP", "12,50", 1250, 1250],
  ["USD", "1.234", null, null], ["USD", "1,234", 123400, 123400], ["USD", "12.50", 1250, 1250], ["USD", "12,50", null, null],
] as const)("thousand-fold text %s %s through the field: typed sends %s, pasted sends %s", async (currency, text, typedMinor, pastedMinor) => {
  await render(currency, "en");
  await type(text);
  expect(input().props.value).toBe(text);
  await press("Send");
  expect(sent).toEqual(typedMinor === null ? [] : [{ currency, minorUnits: typedMinor }]);
  await render(currency, "en");
  await paste(text);
  expect(input().props.value).toBe(text);
  await press("Send");
  expect(sent).toEqual(pastedMinor === null ? [] : [{ currency, minorUnits: pastedMinor }]);
});

test("a language switch mid-entry keeps the text, the value and the session", async () => {
  await render("USD", "en");
  await type("1234");
  await press("Type a decimal point for USD");
  await type("5");
  expect(input().props.value).toBe("1,234.5");
  await press("Spanish");
  expect(input().props.value).toBe("1,234.5");
  expect(button("Escribir punto decimal en USD")).toBeTruthy();
  await type("6");
  expect(input().props.value).toBe("1,234.56");
  await press("Send");
  expect(sent).toEqual([{ currency: "USD", minorUnits: 123456 }]);
});

test("a currency change starts a new session with no text carried over", async () => {
  await render("COP", "en");
  await type("1234");
  await press("Type a decimal comma for COP");
  await type("5");
  expect(input().props.value).toBe("1.234,5");
  await rerender("USD", "en");
  expect(input().props.value).toBe("");
  expect(button("Type a decimal point for USD").props.disabled).toBe(false);
  await press("Send");
  expect(sent).toEqual([]);
  await type("1");
  await press("Type a decimal point for USD");
  await type("5");
  expect(input().props.value).toBe("1.5");
  await press("Send");
  expect(sent).toEqual([{ currency: "USD", minorUnits: 150 }]);
});

test("the decimal key is disabled and says so for a currency without decimals", async () => {
  await render("JPY", "en");
  const key = button("JPY amounts have no decimals");
  expect(key.props.disabled).toBe(true);
  expect(key.props.accessibilityState).toEqual({ disabled: true });
  await render("JPY", "es");
  expect(button("Los montos en JPY no llevan decimales").props.disabled).toBe(true);
});

test("the sign key changes the sign without retyping the amount", async () => {
  await render("COP", "en");
  await type("12345");
  await press("Switch the amount between minus and plus");
  expect(input().props.value).toBe("-12.345");
  await type("6");
  expect(input().props.value).toBe("-123.456");
  await press("Switch the amount between minus and plus");
  expect(input().props.value).toBe("+123.456");
  await press("Send");
  expect(sent).toEqual([{ currency: "COP", minorUnits: 12345600 }]);
});

test("Backspace on an automatic separator removes the digit before it, and a stale native caret is ignored", async () => {
  await render("USD", "en");
  await type("1234");
  expect(input().props.value).toBe("1,234");
  await act(async () => input().props.onSelectionChange({ nativeEvent: { selection: { start: 2, end: 2 } } }));
  await act(async () => input().props.onChangeText("1234"));
  expect(input().props.value).toBe("234");
  await render("USD", "en");
  await type("123");
  await act(async () => input().props.onChangeText("1234"));
  expect(input().props.selection).toEqual({ start: 5, end: 5 });
  await act(async () => input().props.onSelectionChange({ nativeEvent: { selection: { start: 4, end: 4 } } }));
  expect(input().props.selection).toEqual({ start: 5, end: 5 });
  await act(async () => input().props.onSelectionChange({ nativeEvent: { selection: { start: 9, end: 9 } } }));
  expect(input().props.selection).toEqual({ start: 5, end: 5 });
  await act(async () => input().props.onSelectionChange({ nativeEvent: { selection: { start: 1, end: 1 } } }));
  await press("Type a decimal point for USD");
  expect(input().props.value).toBe("1.,234");
  expect(alerts()).toEqual(["Write the amount like this: 1,234.50"]);
});
