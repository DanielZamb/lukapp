import { expect, test } from "vitest";
import { compactAmount, currencySymbol, fullAmount, symbolAmount } from "./amounts";

test.each([
  [0, "0"], [999, "999"], [1000, "1K"], [1500, "1.5K"],
  [10_500, "11K"], [999_999, "1000K"], [1_000_000, "1M"],
  [1_250_000, "1.3M"], [10_500_000, "11M"], [-108_000_000, "−108M"],
])("compacts %s major units as %s like the prototype", (amount, expected) => {
  expect(compactAmount(amount)).toBe(expected);
});

test("symbol amounts convert minor units once and use es-CO grouping", () => {
  expect(currencySymbol("COP")).toBe("$");
  expect(currencySymbol("USD")).toBe("$");
  expect(symbolAmount(123456789, "$", "compact", "COP")).toBe("$1.2M");
  expect(symbolAmount(-10800000000, "$", "compact", "COP")).toBe("−$108M");
  expect(symbolAmount(123456789, "$", "grouped", "COP")).toBe("$1.234.567,89");
  expect(fullAmount(-123456789, "$", "COP")).toBe("−$1.234.567,89");
  expect(fullAmount(0, "$", "COP")).toBe("$0,00");
});


test("overview uses the supplied currency precision in grouped and expanded totals", () => {
  expect(symbolAmount(100, "¥", "grouped", "JPY")).toBe("¥100");
  expect(fullAmount(1234, "BHD ", "BHD")).toBe("BHD 1,234");
});
