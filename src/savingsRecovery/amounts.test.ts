import { expect, test } from "vitest";
import { minor, proportional, text, total } from "./amounts";
import { freezeSchedule } from "./schedule";

test("Recovery amounts reject invalid and unsafe units and sums", () => {
  expect(minor(0)).toBe(0);
  expect(minor(1, true)).toBe(1);
  expect(total([])).toBe(0);
  expect(total([1, 2, 3])).toBe(6);
  expect(total([Number.MAX_SAFE_INTEGER])).toBe(Number.MAX_SAFE_INTEGER);
  for (const amount of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => minor(amount)).toThrow("recovery_amount_invalid");
  expect(() => minor(0, true)).toThrow("recovery_amount_invalid");
  expect(() => total([Number.MAX_SAFE_INTEGER, 1])).toThrow("recovery_amount_invalid");
  expect(() => total([-1, 1])).toThrow("recovery_amount_invalid");
  expect(text(" Receipt ")).toBe(" Receipt ");
  expect(() => text(" \t")).toThrow("recovery_text_required");
});
test("proportional allocation conserves cents and breaks residual ties by source order", () => {
  expect(proportional(0, [0, 10])).toEqual([0, 0]);
  expect(proportional(1, [1, 1, 1])).toEqual([1, 0, 0]);
  expect(proportional(2, [1, 1, 1])).toEqual([1, 1, 0]);
  expect(proportional(7, [5, 3, 2])).toEqual([4, 2, 1]);
  expect(proportional(10, [5, 3, 2])).toEqual([5, 3, 2]);
  expect(proportional(3, [0, 4])).toEqual([0, 3]);
  expect(() => proportional(1, [0, 0])).toThrow("recovery_capacity_exceeded");
  expect(() => proportional(11, [5, 3, 2])).toThrow("recovery_capacity_exceeded");
});
test("zero-premium schedule crosses the calendar year with exact principal installments", () => {
  const terms = { name: "Recovery", sources: [{ entryId: "expense", principalMinor: 100 }], destinationProfileId: "savings",
    installmentCount: 4, installmentAmountMinor: 25 };
  expect(freezeSchedule(terms, "2026-11-30", 123)).toEqual({ activatedOn: "2026-11-30", activatedAt: 123,
    principalMinor: 100, impliedMonthlyRate: 0, schedule: [
      { month: "2026-11", amountMinor: 25, principalMinor: 25, premiumMinor: 0 },
      { month: "2026-12", amountMinor: 25, principalMinor: 25, premiumMinor: 0 },
      { month: "2027-01", amountMinor: 25, principalMinor: 25, premiumMinor: 0 },
      { month: "2027-02", amountMinor: 25, principalMinor: 25, premiumMinor: 0 },
    ] });
  for (const installmentCount of [0, 1.5, 601]) expect(() => freezeSchedule({ ...terms, installmentCount }, "2026-11-30", 123)).toThrow("recovery_installment_count_invalid");
  expect(() => freezeSchedule({ ...terms, installmentAmountMinor: 24 }, "2026-11-30", 123)).toThrow("recovery_installment_below_principal");
  expect(() => freezeSchedule(terms, "9999-11-30", 123)).toThrow("recovery_schedule_invalid");
});
