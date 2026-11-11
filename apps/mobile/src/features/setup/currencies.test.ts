import { afterEach, expect, test, vi } from "vitest";
import { functionalCurrencyCodes } from "../../../../../src/accounting/currencies";
import { createTranslator } from "../../../../../src/i18n";

afterEach(() => vi.unstubAllGlobals());

test("currency names load without Intl and cover every functional currency", async () => {
  vi.resetModules();
  vi.stubGlobal("Intl", {});
  const { currencyName, currencyOptions } = await import("./currencies");
  const en = createTranslator("en");

  expect(new Set(currencyOptions(en).map(({ code }) => code))).toEqual(
    functionalCurrencyCodes,
  );
  for (const { code, name } of currencyOptions(en)) {
    expect(name.length).toBeGreaterThan(code.length);
  }
  expect(currencyName("CAD", en)).toBe("Canadian Dollar");
  expect(currencyName("COP", en)).toBe("Colombian Peso");
  expect(currencyName("unknown", en)).toBe("unknown");
});

test("currency names read in Spanish when Spanish is chosen", async () => {
  const { currencyName, currencyOptions } = await import("./currencies");
  const es = createTranslator("es");
  expect(currencyName("COP", es)).toBe("Peso colombiano");
  expect(currencyName("USD", es)).toBe("Dólar estadounidense");
  expect(currencyName("VED", es)).toBe("Bolívar digital venezolano");
  expect(currencyName("unknown", es)).toBe("unknown");
  const names = currencyOptions(es);
  expect(new Set(names.map(({ code }) => code))).toEqual(functionalCurrencyCodes);
  for (const { code, name } of names) expect(name.length).toBeGreaterThan(code.length);
  const english = createTranslator("en");
  const unchanged = names.filter(({ code, name }) => name === currencyName(code, english)).map(({ code }) => code);
  expect(unchanged).toEqual(["EUR"]);
});
