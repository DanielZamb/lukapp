import { afterEach, expect, test, vi } from "vitest";
import { functionalCurrencyCodes } from "../../../../../src/accounting/currencies";

afterEach(() => vi.unstubAllGlobals());

test("currency names load without Intl and cover every functional currency", async () => {
  vi.resetModules();
  vi.stubGlobal("Intl", {});
  const { currencyName, currencyOptions } = await import("./currencies");

  expect(new Set(currencyOptions.map(({ code }) => code))).toEqual(
    functionalCurrencyCodes,
  );
  for (const { code, name } of currencyOptions) {
    expect(name.length).toBeGreaterThan(code.length);
  }
  expect(currencyName("CAD")).toBe("Canadian Dollar");
  expect(currencyName("COP")).toBe("Colombian Peso");
  expect(currencyName("unknown")).toBe("unknown");
});
