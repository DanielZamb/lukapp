import { expect, test } from "vitest";
import { AccountingError } from "./errors";
import {
  FALLBACK_WORKSPACE_TIME_ZONE,
  calendarDate,
  calendarMonth,
  requireTimeZone,
  workspaceTimeZone,
} from "./timeZone";

const bogotaMonthEnd = new Date("2026-10-31T23:30:00-05:00");

function expectAccountingError(work: () => unknown, code: string) {
  try {
    work();
    expect.fail(`expected ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ name: "AccountingError", code });
  }
}

test("a Bogotá instant after 19:00 on 31 October stays on 31 October", () => {
  expect(bogotaMonthEnd.toISOString().slice(0, 10)).toBe("2026-11-01");
  expect(calendarDate(bogotaMonthEnd, "America/Bogota")).toBe("2026-10-31");
  expect(calendarMonth(bogotaMonthEnd, "America/Bogota")).toEqual({
    year: 2026,
    month: 10,
  });
});

test("the same instant is 1 November in Auckland", () => {
  expect(calendarDate(bogotaMonthEnd, "Pacific/Auckland")).toBe("2026-11-01");
  expect(calendarMonth(bogotaMonthEnd, "Pacific/Auckland")).toEqual({
    year: 2026,
    month: 11,
  });
});

test("a missing Workspace timezone falls back to America/Bogota", () => {
  expect(FALLBACK_WORKSPACE_TIME_ZONE).toBe("America/Bogota");
  expect(workspaceTimeZone({})).toBe("America/Bogota");
  expect(workspaceTimeZone({ timeZone: "America/Lima" })).toBe("America/Lima");
});

test("an IANA timezone is accepted and an unknown zone is rejected", () => {
  expect(requireTimeZone("America/Mexico_City")).toBe("America/Mexico_City");
  expectAccountingError(() => requireTimeZone(""), "time_zone_invalid");
  expectAccountingError(() => requireTimeZone("Bogota"), "time_zone_invalid");
  expectAccountingError(
    () => calendarDate(bogotaMonthEnd, "Not/AZone"),
    "time_zone_invalid",
  );
  expectAccountingError(
    () => calendarDate(new Date(Number.NaN), "America/Bogota"),
    "clock_required",
  );
});

test("offset identifiers are rejected and named zones are canonicalized", () => {
  expectAccountingError(() => requireTimeZone("+01:00"), "time_zone_invalid");
  expectAccountingError(() => requireTimeZone("-05:00"), "time_zone_invalid");
  expectAccountingError(() => requireTimeZone("UTC+1"), "time_zone_invalid");
  expect(requireTimeZone("UTC")).toBe("UTC");
  expect(requireTimeZone("Etc/UTC")).toBe("UTC");
});
