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
  const zero = { sourceId: "zero", weight: 0 };
  const ten = { sourceId: "ten", weight: 10 };
  const first = { sourceId: "first", weight: 1 };
  const second = { sourceId: "second", weight: 1 };
  const third = { sourceId: "third", weight: 1 };
  const five = { sourceId: "five", weight: 5 };
  const three = { sourceId: "three", weight: 3 };
  const two = { sourceId: "two", weight: 2 };
  const four = { sourceId: "four", weight: 4 };
  const anotherZero = { sourceId: "another-zero", weight: 0 };
  expect(proportional(0, [zero, ten], part => part.weight)).toEqual([
    { part: zero, amountMinor: 0 }, { part: ten, amountMinor: 0 },
  ]);
  expect(proportional(1, [first, second, third], part => part.weight)).toEqual([
    { part: first, amountMinor: 1 }, { part: second, amountMinor: 0 }, { part: third, amountMinor: 0 },
  ]);
  expect(proportional(2, [first, second, third], part => part.weight)).toEqual([
    { part: first, amountMinor: 1 }, { part: second, amountMinor: 1 }, { part: third, amountMinor: 0 },
  ]);
  expect(proportional(7, [five, three, two], part => part.weight)).toEqual([
    { part: five, amountMinor: 4 }, { part: three, amountMinor: 2 }, { part: two, amountMinor: 1 },
  ]);
  expect(proportional(10, [five, three, two], part => part.weight)).toEqual([
    { part: five, amountMinor: 5 }, { part: three, amountMinor: 3 }, { part: two, amountMinor: 2 },
  ]);
  expect(proportional(3, [zero, four], part => part.weight)).toEqual([
    { part: zero, amountMinor: 0 }, { part: four, amountMinor: 3 },
  ]);
  expect(() => proportional(1, [zero, anotherZero], part => part.weight)).toThrow("recovery_capacity_exceeded");
  expect(() => proportional(11, [five, three, two], part => part.weight)).toThrow("recovery_capacity_exceeded");
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
