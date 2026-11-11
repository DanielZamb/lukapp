import { expect, test, vi } from "vitest";
vi.mock("expo-secure-store", () => ({}));
import { formatAmount, formatMoney } from "../money";
import { compactMoney } from "./compact";
import { amountFormat } from "./currencyFormat";
import { sendableMinorUnits, amountOfMinorUnits, openAmount } from "./session";
import { compactAmount } from "../budget/model";
import { compactHistoryAmount } from "../history/listModel";

/** Compiled by `pnpm typecheck`, never run: each call without a currency must fail type checking. */
export function callsWithoutCurrency() {
  // @ts-expect-error a currency is required
  formatAmount(100);
  // @ts-expect-error a currency is required
  formatMoney({ minorUnits: 100 });
  // @ts-expect-error a currency is required
  compactMoney(100, "en", "budget");
  // @ts-expect-error a currency is required
  compactAmount(100, "en");
  // @ts-expect-error a currency is required
  compactHistoryAmount(100, "en");
  // @ts-expect-error a currency is required
  openAmount();
  // @ts-expect-error a currency is required
  amountOfMinorUnits(100);
  // @ts-expect-error a currency is required
  amountFormat();
  // @ts-expect-error amounts are read from a session, never from bare text
  sendableMinorUnits("1.234,50");
  // @ts-expect-error a session a render holds is not an amount read at the moment of a press
  sendableMinorUnits(openAmount("COP", "1"));
}

test("a currency outside the supported list is refused when an amount is shown or typed, never given a default format", () => {
  expect(() => formatAmount(100, "es-CO")).toThrow("Unsupported functional currency");
  expect(() => openAmount("XXX")).toThrow("Unsupported functional currency");
  expect(formatAmount(123450, "COP")).toBe("1.234,50");
  expect(formatAmount(123450, "USD")).toBe("1,234.50");
});
