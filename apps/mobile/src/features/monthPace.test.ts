import { expect, test } from "vitest";
import {
  calendarMonthShape,
  monthPaceProgress,
  projectedMonthSpendMinorUnits,
} from "./monthPace";

test("calendarMonthShape reads the workspace calendar day and month length", () => {
  expect(calendarMonthShape("2026-08-20")).toEqual({ day: 20, daysInMonth: 31 });
  expect(calendarMonthShape("2026-02-15")).toEqual({ day: 15, daysInMonth: 28 });
});

test("month pace matches day over days in month", () => {
  expect(monthPaceProgress(20, 31)).toBeCloseTo(20 / 31);
});

test("projected month spend linearly extrapolates from spend so far", () => {
  const monthSpendMinorUnits = 231_000_000;
  expect(
    projectedMonthSpendMinorUnits(monthSpendMinorUnits, 20, 31),
  ).toBe(358_050_000);
});
