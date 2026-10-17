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

const OTHER_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/London",
  "UTC",
  "Pacific/Auckland",
] as const;

const TIME_ZONE_LABELS: Record<string, string> = {
  "America/Bogota": "Bogotá",
  "America/Mexico_City": "Mexico City",
  "America/Lima": "Lima",
  "America/Guayaquil": "Guayaquil",
  "America/Santiago": "Santiago",
  "America/Argentina/Buenos_Aires": "Buenos Aires",
  "America/Sao_Paulo": "São Paulo",
  "America/Caracas": "Caracas",
  "America/La_Paz": "La Paz",
  "America/Asuncion": "Asunción",
  "America/Montevideo": "Montevideo",
  "America/Panama": "Panama",
  "America/Costa_Rica": "Costa Rica",
  "America/Guatemala": "Guatemala",
  "America/Havana": "Havana",
  "America/Santo_Domingo": "Santo Domingo",
  "America/Puerto_Rico": "Puerto Rico",
  "America/New_York": "New York",
  "America/Chicago": "Chicago",
  "America/Denver": "Denver",
  "America/Los_Angeles": "Los Angeles",
  "America/Toronto": "Toronto",
  "Europe/Madrid": "Madrid",
  "Europe/Lisbon": "Lisbon",
  "Europe/London": "London",
  UTC: "UTC",
  "Pacific/Auckland": "Auckland",
};

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function timeZoneLabel(timeZone: string): string {
  return TIME_ZONE_LABELS[timeZone] ?? timeZone.replaceAll("_", " ");
}

export function orderedTimeZones(deviceZone: string): string[] {
  const unique = [...new Set([...LATIN_AMERICA_TIME_ZONES, ...OTHER_TIME_ZONES, deviceZone])];
  const latinAmerica = new Set<string>(LATIN_AMERICA_TIME_ZONES);
  return [
    ...unique.filter((zone) => latinAmerica.has(zone)),
    ...unique.filter((zone) => !latinAmerica.has(zone)),
  ];
}

export function filterTimeZones(zones: string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return zones;
  return zones.filter((zone) => {
    const label = timeZoneLabel(zone).toLowerCase();
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

export function spentMonthEyebrow(timeZone: string, now = new Date()): string {
  return `SPENT IN ${new Intl.DateTimeFormat("en", { month: "long", timeZone }).format(now).toUpperCase()}`;
}
