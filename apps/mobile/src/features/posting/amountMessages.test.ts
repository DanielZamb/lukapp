import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { activeTranslator } from "../../i18n/active";
import { amountHint } from "../amount/hints";
import { amountMinorUnits, openAmount } from "../amount/session";

vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

async function inLanguage(language: "en" | "es") {
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: language }, null)); });
}
const hint = (text: string, currency = "COP") => amountHint(openAmount(currency, text), activeTranslator().t);

test("amount refusals speak the chosen language and give an example in the currency's own format", async () => {
  await inLanguage("es");
  expect(hint("1,234", "COP")).toBe("Usa máximo 2 decimales, por ejemplo 12,50");
  expect(hint("12,34", "USD")).toBe("Usa el punto para los decimales, por ejemplo 12.50");
  expect(hint("12a")).toBe("Escribe solo números y separadores, por ejemplo 1.234,50");
  expect(hint("99999999999999999")).toBe("El monto es demasiado grande.");
  expect(amountMinorUnits(openAmount("COP", "-1.250.300"))).toBe(-125_030_000);
  expect(amountMinorUnits(openAmount("USD", "12.34"))).toBe(1234);
  expect(amountMinorUnits(openAmount("USD", "12,34"))).toBeNull();
  await act(async () => root?.unmount());
  await inLanguage("en");
  expect(hint("1,234", "COP")).toBe("Use up to 2 decimal places, for example 12,50");
  expect(hint("12a")).toBe("Type only digits and separators, for example 1.234,50");
  expect(hint("12a", "USD")).toBe("Type only digits and separators, for example 1,234.50");
  expect(amountMinorUnits(openAmount("COP", "-1.250.300"))).toBe(-125_030_000);
});
