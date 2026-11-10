import { setup } from "../../../../src/i18n/catalog/en/setup";
import type { MessageKey, Translator } from "../../../../src/i18n";
import { formatMonthName } from "../../../../src/i18n/format";

export const LATIN_AMERICA_TIME_ZONES = [
  "America/Bogota",
  "America/Mexico_City",
  "America/Lima",
  "America/Guayaquil",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Caracas",
  "America/La_Paz",
  "America/Asuncion",
  "America/Montevideo",
  "America/Panama",
  "America/Costa_Rica",
  "America/Guatemala",
  "America/Havana",
  "America/Santo_Domingo",
  "America/Puerto_Rico",
] as const;

const FALLBACK_TIME_ZONES = [
  ...LATIN_AMERICA_TIME_ZONES,
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Anchorage",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Jerusalem",
  "Asia/Kolkata",
  "Asia/Manila",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Berlin",
  "Europe/Brussels",
  "Europe/Dublin",
  "Europe/Istanbul",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Zurich",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "Pacific/Honolulu",
] as const;

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** A city name from the catalog where one exists, otherwise the IANA id made readable. */
export function timeZoneLabel(timeZone: string, { t }: Translator): string {
  const key = `zone.${timeZone}`;
  return key in setup ? t(`setup.${key}` as MessageKey) : timeZone.replaceAll("_", " ");
}

function supportedTimeZones(): string[] {
  const values = Intl.supportedValuesOf?.("timeZone");
  return values && values.length > 0 ? [...values] : [...FALLBACK_TIME_ZONES];
}

export function orderedTimeZones(deviceZone: string): string[] {
  const latinAmerica = new Set<string>(LATIN_AMERICA_TIME_ZONES);
  const unique = [
    ...new Set([...LATIN_AMERICA_TIME_ZONES, deviceZone, ...supportedTimeZones()]),
  ];
  return [
    ...unique.filter((zone) => latinAmerica.has(zone)),
    ...unique.filter((zone) => !latinAmerica.has(zone)),
  ];
}

export function filterTimeZones(zones: string[], query: string, translator: Translator): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return zones;
  return zones.filter((zone) => {
    const label = timeZoneLabel(zone, translator).toLowerCase();
    return zone.toLowerCase().includes(needle) || label.includes(needle);
  });
}

export function calendarDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Clock required");
  return `${year}-${month}-${day}`;
}

export function spentMonthEyebrow({ t, language, locale }: Translator, timeZone: string, now = new Date()): string {
  return t("home.spentIn", { month: formatMonthName(language, now, { timeZone }) }).toLocaleUpperCase(locale);
}

export function defaultAccountingDate(timeZone: string, now = new Date()): string {
  return calendarDate(now, timeZone);
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return (
    Date.UTC(
      read("year"),
      read("month") - 1,
      read("day"),
      read("hour"),
      read("minute"),
      read("second"),
    ) - instant.getTime()
  );
}

export function nextWorkspaceMidnight(now: Date, timeZone: string): number {
  const today = calendarDate(now, timeZone);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextYear = next.getUTCFullYear();
  const nextMonth = next.getUTCMonth() + 1;
  const nextDay = next.getUTCDate();
  const asUtc = Date.UTC(nextYear, nextMonth - 1, nextDay);
  let instant = asUtc;
  for (let i = 0; i < 3; i++) {
    instant = asUtc - zoneOffsetMs(new Date(instant), timeZone);
  }
  // Where daylight saving skips midnight (Beirut, Santiago), local 00:00 does not exist and
  // the estimate lands before the date changes. Step forward to the first minute of the new
  // date so a caller never re-arms on a time that is still "today".
  for (let step = 0; step < 26 * 60 && (instant <= now.getTime() || calendarDate(new Date(instant), timeZone) === today); step++) {
    instant += 60_000;
  }
  return instant;
}
