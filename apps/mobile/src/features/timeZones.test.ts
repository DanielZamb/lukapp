import { expect, test } from "vitest";
import {
  LATIN_AMERICA_TIME_ZONES,
  calendarDate,
  filterTimeZones,
  orderedTimeZones,
  spentMonthEyebrow,
  timeZoneLabel,
} from "./timeZones";

const bogotaMonthEnd = new Date("2026-10-31T23:30:00-05:00");

test("Home's month label uses the Workspace timezone, not UTC", () => {
  expect(bogotaMonthEnd.toISOString().slice(0, 10)).toBe("2026-11-01");
  expect(spentMonthEyebrow("America/Bogota", bogotaMonthEnd)).toBe("SPENT IN OCTOBER");
  expect(spentMonthEyebrow("Pacific/Auckland", bogotaMonthEnd)).toBe("SPENT IN NOVEMBER");
  expect(calendarDate(bogotaMonthEnd, "America/Bogota").slice(0, 7)).toBe("2026-10");
});

test("Latin American zones appear first and search matches city names", () => {
  const ordered = orderedTimeZones("America/New_York");
  expect(ordered.slice(0, LATIN_AMERICA_TIME_ZONES.length)).toEqual([
    ...LATIN_AMERICA_TIME_ZONES,
  ]);
  expect(ordered).toContain("America/New_York");
  expect(orderedTimeZones("Africa/Nairobi")).toContain("Africa/Nairobi");
  expect(filterTimeZones(ordered, "bogotá")[0]).toBe("America/Bogota");
  expect(filterTimeZones(ordered, "lima")).toEqual(["America/Lima"]);
  expect(timeZoneLabel("America/Sao_Paulo")).toBe("São Paulo");
});
