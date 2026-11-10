import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { parseMoney } from "../money";

vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

async function inLanguage(language: "en" | "es") {
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: language }, null)); });
}
const failure = (text: string, currency = "COP") => { try { parseMoney(text, "es-CO", currency); return null; } catch (error) { return (error as Error).message; } };

test("amount validation speaks the chosen language and accepts and rejects the same input", async () => {
  await inLanguage("es");
  expect(failure("1,234", "COP")).toBe("Escribe un monto con máximo 2 decimales.");
  expect(failure("12.34", "USD")).toBe("Revisa los separadores de miles.");
  expect(failure("12a")).toBe("Escribe un monto válido.");
  expect(failure("99999999999999999")).toBe("El monto es demasiado grande.");
  expect(parseMoney("-1.250.300", "es-CO", "COP")).toBe(-125_030_000);
  expect(parseMoney("12,34", "es-CO", "USD")).toBe(1234);
  await act(async () => root?.unmount());
  await inLanguage("en");
  expect(failure("1,234", "COP")).toBe("Enter an amount with up to 2 decimal places.");
  expect(failure("12a")).toBe("Enter a valid amount.");
  expect(parseMoney("-1.250.300", "es-CO", "COP")).toBe(-125_030_000);
});
