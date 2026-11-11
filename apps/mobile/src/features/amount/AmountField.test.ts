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
import { readsAs, samsungPhone } from "./phone.testSupport";
import { openAmount, openSavedAmount, sendableMinorUnits, withAmountSign, type AmountSession } from "./session";
import { useAmountState } from "./useAmountState";

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

const sent: Array<{ currency: string; minorUnits: number }> = [];
let replaceSession: (session: AmountSession) => void = () => {};

function Owner({ currency, opened, initial }: { currency: string; opened?: string; initial?: AmountSession }) {
  const [session, setSession, read] = useAmountState<AmountSession>(() => initial ?? openAmount(currency, opened));
  replaceSession = setSession;
  const language = useLanguage();
  if (session.currency !== currency) setSession(openAmount(currency));
  return createElement("view", null,
    createElement(AmountField, { session, onChange: setSession, editable: true, inputAccessibilityLabel: "Amount" }),
    ...(["-", "+"] as const).map((sign) => createElement("button", {
      key: sign, accessibilityLabel: `Owner sets ${sign}`, accessibilityRole: "button",
      onPress: () => setSession((now) => withAmountSign(now, sign)),
    })),
    createElement("button", {
      accessibilityLabel: "Send", accessibilityRole: "button",
      onPress: () => {
        const minorUnits = sendableMinorUnits(read(), currency);
        if (minorUnits !== null) sent.push({ currency, minorUnits });
      },
    }),
    createElement("button", { accessibilityLabel: "Spanish", accessibilityRole: "button", onPress: () => language.setPreference("es") }));
}

async function render(currency: string, language: "en" | "es" = "en", opened?: string, platform: "android" | "ios" = "android") {
  sent.length = 0;
  await act(async () => { root?.unmount(); });
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: language }, createElement(Owner, { currency, opened })));
  });
  return samsungPhone(input, { platform });
}
async function renderSession(initial: AmountSession) {
  sent.length = 0;
  await act(async () => { root?.unmount(); });
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Owner, { currency: initial.currency, initial })));
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
/** The sign the owner sets beside the field, as the posting editor does from the entry's category. */
const ownerSign = (sign: "-" | "+") => button(`Owner sets ${sign}`);
const signShown = () => root!.root.findAll((node) => node.type === "text"
  && (node.props.accessibilityLabel === "minus" || node.props.accessibilityLabel === "plus"))
  .map((node) => [node.props.accessibilityLabel, node.children.join("")]);

for (const language of ["en", "es"] as const) {
  test(`${language}: digits and the phone's decimal mark give exact minor units, and the field shows exactly what was typed`, async () => {
    for (const [currency, shown, reading] of [
      ["COP", "1234,50", { en: "Reads as COP 1.234,50", es: "Se lee como COP 1.234,50" }],
      ["USD", "1234.50", { en: "Reads as USD 1,234.50", es: "Se lee como USD 1,234.50" }]] as const) {
      const phone = await render(currency, language);
      await phone.type(shown.slice(0, 5));
      expect(input().props.value).toBe(shown.slice(0, 5));
      expect(alerts()).toEqual([]);
      await send();
      expect(sent, "an amount ending in its decimal mark is incomplete").toEqual([]);
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

test("third review, finding 3: a converted saved amount awaits confirmation through a sign change by its owner", async () => {
  const phone = await renderSession(openSavedAmount("CLP", { text: "-500,", format: "pre-currency" }).session);
  expect(texts()).toContain("You saved this as -500,. It now shows as CLP 500.");
  await phone.press(ownerSign("+"));
  expect(signShown()).toEqual([["plus", "+"]]);
  await send();
  expect(sent).toEqual([]);
  await phone.press(button("Confirm CLP 500"));
  await send();
  expect(sent).toEqual([{ currency: "CLP", minorUnits: 500 }]);
});

test("third review, finding 3: a converted saved amount awaits confirmation after its separators are deleted, until the text is cleared", async () => {
  let phone = await renderSession(openSavedAmount("USD", { text: "1.234,50", format: "legacy-es-CO/1" }).session);
  expect(input().props.value).toBe("1,234.50");
  for (let index = 0; index < 3; index++) await phone.backspace();
  await phone.select(2);
  await phone.backspace();
  expect(phone.text).toBe("1234");
  await send();
  expect(sent).toEqual([]);
  expect(texts()).toContain("You saved this as 1.234,50. It now shows as USD 1,234.00.");
  phone = await renderSession(openSavedAmount("USD", { text: "1.234,50", format: "legacy-es-CO/1" }).session);
  await phone.select(0, phone.text.length);
  await phone.backspace();
  expect(phone.text).toBe("");
  await phone.type("12");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 1200 }]);
});

test("third review, finding 4: the owner's sign never writes the native text, so a keystroke racing it cannot drop the sign", async () => {
  const phone = await render("USD");
  await phone.type("12");
  await phone.press(ownerSign("-"), { hold: true });
  expect(input().props.value).toBe("12");
  expect(texts()).toContain("−");
  await send();
  await phone.type("3", { racing: true });
  expect(phone.text).toBe("123");
  expect(texts()).toContain("Now reads as −USD 123.00");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: -1200 }, { currency: "USD", minorUnits: -12300 }]);
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

test("finding 6: the field neither reads nor places the caret, so a caret report that arrives late never moves a digit", async () => {
  const phone = await render("USD");
  expect(input().props.onSelectionChange).toBeUndefined();
  expect(input().props.selection).toBeUndefined();
  await phone.type("12");
  await phone.select(1);
  await phone.select(2);
  await phone.type("3");
  expect(phone.text).toBe("123");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 12300 }]);
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

test("the owner's sign changes only the sign shown beside the phone's text, and leaves that text, its caret and its input alone", async () => {
  const phone = await render("COP");
  await phone.type("123,45");
  await phone.select(4);
  expect(signShown()).toEqual([]);
  const kept = input();
  await phone.press(ownerSign("-"));
  expect(phone.text).toBe("123,45");
  expect(phone.caret).toEqual({ start: 4, end: 4 });
  expect(input()).toBe(kept);
  expect(signShown()).toEqual([["minus", "−"]]);
  await send();
  await phone.press(ownerSign("+"));
  await send();
  expect(sent).toEqual([{ currency: "COP", minorUnits: -12345 }, { currency: "COP", minorUnits: 12345 }]);
  expect(phone.text).toBe("123,45");
  expect(input()).toBe(kept);
  expect(signShown()).toEqual([["plus", "+"]]);
  await phone.type("9");
  expect(phone.text).toBe("123,945");
  await send();
  expect(sent).toHaveLength(2);
});

const typedSignHint = { COP: "Type only digits and separators, for example 1.234,50", USD: "Type only digits and separators, for example 1,234.50" } as const;

for (const held of ["", "-", "+"] as const)
  for (const typed of ["+", "-", "−"] as const)
    test.each([["first", 0], ["middle", 2], ["last", 5]] as const)(
      `a ${typed} typed %s into the text, with the sign held ${held || "empty"}, is refused with the format hint and nothing is sent`,
      async (_where, at) => {
        for (const currency of ["COP", "USD"] as const) {
          const phone = await render(currency);
          if (held) await phone.press(ownerSign(held));
          const amount = currency === "COP" ? "12,50" : "12.50";
          await phone.type(amount);
          await send();
          expect(sent).toEqual([{ currency, minorUnits: held === "-" ? -1250 : 1250 }]);
          sent.length = 0;
          await phone.select(at);
          await phone.type(typed);
          const shown = `${amount.slice(0, at)}${typed}${amount.slice(at)}`;
          expect(phone.text).toBe(shown);
          expect(input().props.value).toBe(shown);
          expect(alerts()).toEqual([typedSignHint[currency]]);
          expect(texts().some((text) => text.includes("Reads as"))).toBe(false);
          await send();
          expect(sent).toEqual([]);
          expect(signShown()).toEqual(held ? [[held === "-" ? "minus" : "plus", held === "-" ? "−" : "+"]] : []);
          await phone.select(at + 1);
          await phone.backspace();
          await send();
          expect(sent, "deleting the typed sign restores the amount").toEqual([{ currency, minorUnits: held === "-" ? -1250 : 1250 }]);
        }
      });

test("a sign typed alone, or as the first key of an empty field, is refused with the format hint and nothing is sent", async () => {
  for (const typed of ["-", "+", "−", "-5", "+5", "−5"]) {
    const phone = await render("USD");
    await phone.type(typed);
    expect(input().props.value).toBe(typed);
    expect(alerts()).toEqual([typedSignHint.USD]);
    await send();
    expect(sent).toEqual([]);
  }
});

test("a pasted amount that carries a sign is refused with the format hint and nothing is sent, whatever sign the owner set", async () => {
  for (const held of ["", "-", "+"] as const) {
    const phone = await render("USD");
    if (held) await phone.press(ownerSign(held));
    await phone.paste("-1,234.50");
    expect(input().props.value).toBe("-1,234.50");
    expect(alerts()).toEqual([typedSignHint.USD]);
    expect(root!.root.findAll((node) => node.type === "button" && String(node.props.accessibilityLabel).startsWith("Confirm"))).toEqual([]);
    await send();
    expect(sent).toEqual([]);
  }
});

test("the phone's own minus from the .- key is read literally and refused with the format hint", async () => {
  for (const held of ["", "-", "+"] as const) {
    const phone = await render("USD");
    if (held) await phone.press(ownerSign(held));
    await phone.type("5.");
    await phone.cycleDotToMinus();
    expect(input().props.value).toBe("5-");
    expect(alerts()).toEqual([typedSignHint.USD]);
    await send();
    expect(sent).toEqual([]);
  }
});

test("a decimal mark typed before any digit is refused with the format hint; typed after a 0 it reads as typed", async () => {
  for (const [currency, mark, hint] of [["COP", ",", "Write the amount like this: 1.234,50"], ["USD", ".", "Write the amount like this: 1,234.50"]] as const) {
    let phone = await render(currency);
    await phone.type(`${mark}5`);
    expect(input().props.value).toBe(`${mark}5`);
    expect(alerts()).toEqual([hint]);
    await send();
    expect(sent).toEqual([]);
    phone = await render(currency);
    await phone.type(`0${mark}5`);
    await send();
    expect(sent).toEqual([{ currency, minorUnits: 50 }]);
  }
});

test("a language switch mid-entry keeps the text, the value and the session", async () => {
  const phone = await render("USD");
  await phone.type("1234.5");
  const kept = input();
  await act(async () => button("Spanish").props.onPress());
  expect(input()).toBe(kept);
  expect(input().props.value).toBe("1234.5");
  expect(texts()).toContain("Ahora se lee como USD 1,234.50");
  await phone.type("6");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 123456 }]);
});

test("a currency without decimals refuses the phone's decimal mark with a hint, and sends once it is deleted", async () => {
  const phone = await render("JPY");
  await phone.type("12,");
  expect(alerts()).toEqual(["JPY amounts have no decimals, for example 1.234"]);
  await send();
  expect(sent).toEqual([]);
  await phone.backspace();
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
  expect(input().props.value).toBe("1234567,50");
  expect(texts()).toContain("−");
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
    const [session, setSession, read] = useAmountState(() => openAmount("USD", "12"));
    return createElement("view", null,
      createElement(AmountField, { session, onChange: setSession, editable: false, inputAccessibilityLabel: "Amount" }),
      createElement("button", { accessibilityLabel: "Send", accessibilityRole: "button",
        onPress: () => { const minorUnits = sendableMinorUnits(read(), "USD"); if (minorUnits !== null) sent.push({ currency: "USD", minorUnits }); } }));
  }
  sent.length = 0;
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "en" }, createElement(Frozen))); });
  await act(async () => input().props.onChangeText("99"));
  expect(input().props.value).toBe("12");
  await send();
  expect(sent).toEqual([{ currency: "USD", minorUnits: 1200 }]);
});

const readingLine = () => root!.root.findAll((node) => node.type === "text" && node.props.importantForAccessibility !== undefined)[0];

test("third review, finding 5: the reading speaks up when the decimal mark appears or moves, and when the value changes tenfold", async () => {
  const phone = await render("COP");
  const reading = () => ({ text: readingLine().children.join(""), live: readingLine().props.accessibilityLiveRegion });
  await phone.type("1");
  expect(reading()).toEqual({ text: "Reads as COP 1,00", live: "none" });
  await phone.type("2");
  expect(reading()).toEqual({ text: "Now reads as COP 12,00", live: "polite" });
  await phone.type("34");
  expect(reading()).toEqual({ text: "Now reads as COP 1.234,00", live: "polite" });
  await phone.type(",5");
  expect(reading()).toEqual({ text: "Now reads as COP 1.234,50", live: "polite" });
  await phone.type("0");
  expect(reading()).toEqual({ text: "Reads as COP 1.234,50", live: "none" });
  await phone.select(4);
  await phone.backspace();
  expect(phone.text).toBe("123,50");
  expect(reading()).toEqual({ text: "Now reads as COP 123,50", live: "polite" });
  await phone.select(6);
  await phone.backspace();
  expect(reading()).toEqual({ text: "Reads as COP 123,50", live: "none" });
});

test("third review, finding 5: the reading speaks up when a change removes the decimal mark, and holds one line in both languages", async () => {
  const phone = await render("USD", "es");
  await phone.type("12.5");
  expect(readingLine().children.join("")).toBe("Ahora se lee como USD 12.50");
  await phone.type("0");
  expect(readingLine().children.join("")).toBe("Se lee como USD 12.50");
  await phone.select(3);
  await phone.backspace();
  expect(phone.text).toBe("1250");
  expect(readingLine().children.join("")).toBe("Ahora se lee como USD 1,250.00");
  expect(readingLine().props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, accessibilityLiveRegion: "polite" });
});

test("third review, finding 5: an amount the owner opens is the first reading, so the first edit compares with it", async () => {
  const phone = await render("USD", "en", "400");
  expect(readingLine().children.join("")).toBe("Reads as USD 400.00");
  await phone.backspace();
  expect(readingLine().children.join("")).toBe("Now reads as USD 40.00");
});
