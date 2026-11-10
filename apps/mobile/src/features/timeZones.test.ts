import { afterEach, expect, test } from "vitest";
import { createTranslator } from "../../../../src/i18n";
import {
  LATIN_AMERICA_TIME_ZONES,
  calendarDate,
  defaultAccountingDate,
  filterTimeZones,
  nextWorkspaceMidnight,
  orderedTimeZones,
  spentMonthEyebrow,
  timeZoneLabel,
} from "./timeZones";

const en = createTranslator("en");
const es = createTranslator("es");

const bogotaMonthEnd = new Date("2026-10-31T23:30:00-05:00");
const supportedValuesOf = Intl.supportedValuesOf;
afterEach(() => {
  Intl.supportedValuesOf = supportedValuesOf;
});

test("a new place's starting date follows the Workspace calendar, not the phone", () => {
  expect(defaultAccountingDate("America/Bogota", bogotaMonthEnd)).toBe(
    "2026-10-31",
  );
  expect(defaultAccountingDate("Pacific/Auckland", bogotaMonthEnd)).toBe(
    "2026-11-01",
  );
});

test("Home's month label uses the Workspace timezone, not UTC", () => {
  expect(bogotaMonthEnd.toISOString().slice(0, 10)).toBe("2026-11-01");
  expect(spentMonthEyebrow(en, "America/Bogota", bogotaMonthEnd)).toBe("SPENT IN OCTOBER");
  expect(spentMonthEyebrow(en, "Pacific/Auckland", bogotaMonthEnd)).toBe("SPENT IN NOVEMBER");
  expect(calendarDate(bogotaMonthEnd, "America/Bogota").slice(0, 7)).toBe("2026-10");
  expect(spentMonthEyebrow(es, "America/Bogota", bogotaMonthEnd)).toBe("GASTADO EN OCTUBRE");
  expect(spentMonthEyebrow(es, "Pacific/Auckland", bogotaMonthEnd)).toBe("GASTADO EN NOVIEMBRE");
});

test("time zone names read in the chosen language, and search matches either the name or the id", () => {
  const ordered = orderedTimeZones("America/New_York");
  expect(timeZoneLabel("America/Mexico_City", en)).toBe("Mexico City");
  expect(timeZoneLabel("America/Mexico_City", es)).toBe("Ciudad de México");
  expect(timeZoneLabel("Europe/London", es)).toBe("Londres");
  expect(timeZoneLabel("Asia/Ho_Chi_Minh", es)).toBe("Asia/Ho Chi Minh");
  expect(filterTimeZones(ordered, "nueva york", es)).toEqual(["America/New_York"]);
  expect(filterTimeZones(ordered, "nueva york", en)).toEqual([]);
  expect(filterTimeZones(ordered, "new_york", es)).toEqual(["America/New_York"]);
});

test("Latin American zones appear first and search matches city names", () => {
  const ordered = orderedTimeZones("America/New_York");
  expect(ordered.slice(0, LATIN_AMERICA_TIME_ZONES.length)).toEqual([
    ...LATIN_AMERICA_TIME_ZONES,
  ]);
  expect(ordered).toContain("America/New_York");
  expect(orderedTimeZones("Africa/Nairobi")).toContain("Africa/Nairobi");
  expect(filterTimeZones(ordered, "bogotá", en)[0]).toBe("America/Bogota");
  expect(filterTimeZones(ordered, "lima", en)).toEqual(["America/Lima"]);
  expect(timeZoneLabel("America/Sao_Paulo", en)).toBe("São Paulo");
});

test("the picker lists every IANA zone when the runtime can, with a Hermes fallback", () => {
  const runtime = Intl.supportedValuesOf("timeZone");
  const ordered = orderedTimeZones("UTC");
  expect(ordered).toContain("Asia/Tokyo");
  expect(ordered).toContain("Europe/Berlin");
  expect(filterTimeZones(ordered, "tokyo", en)).toContain("Asia/Tokyo");
  expect(new Set(ordered).size).toBe(ordered.length);
  for (const zone of runtime) expect(ordered).toContain(zone);

  // Hermes does not implement supportedValuesOf.
  // @ts-expect-error runtime deletion
  delete Intl.supportedValuesOf;
  const fallback = orderedTimeZones("UTC");
  expect(fallback.slice(0, LATIN_AMERICA_TIME_ZONES.length)).toEqual([
    ...LATIN_AMERICA_TIME_ZONES,
  ]);
  expect(fallback).toContain("Asia/Tokyo");
  expect(fallback).toContain("Europe/Berlin");
  expect(filterTimeZones(fallback, "berlin", en)).toContain("Europe/Berlin");
});

test("the next Workspace midnight is the zone's civil midnight, not 24 hours later", () => {
  const now = new Date("2026-10-31T23:30:00-05:00");
  const next = nextWorkspaceMidnight(now, "America/Bogota");
  expect(next).toBe(new Date("2026-11-01T00:00:00-05:00").getTime());
  expect(calendarDate(new Date(next - 1), "America/Bogota")).toBe("2026-10-31");
  expect(calendarDate(new Date(next), "America/Bogota")).toBe("2026-11-01");
});

test("the next midnight is the first minute of the new date, even where DST skips midnight", () => {
  // Beirut and Santiago move clocks forward at local midnight, so 00:00 never happens.
  for (const [timeZone, nowIso, newDate] of [
    ["Asia/Beirut", "2026-03-28T21:30:00Z", "2026-03-29"],
    ["Africa/Cairo", "2026-04-23T21:30:00Z", "2026-04-24"],
    ["America/Santiago", "2026-09-05T12:00:00Z", "2026-09-06"],
    ["America/Bogota", "2026-10-31T23:30:00-05:00", "2026-11-01"],
    ["America/New_York", "2026-03-07T12:00:00Z", "2026-03-08"],
  ] as const) {
    const now = new Date(nowIso);
    const next = nextWorkspaceMidnight(now, timeZone);
    expect(next).toBeGreaterThan(now.getTime());
    expect(calendarDate(new Date(next), timeZone)).toBe(newDate);
    expect(calendarDate(new Date(next - 60_000), timeZone)).not.toBe(newDate);
  }
});
