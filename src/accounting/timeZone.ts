import { AccountingError } from "./errors";

export const FALLBACK_WORKSPACE_TIME_ZONE = "America/Bogota";

export function requireTimeZone(value: string): string {
  if (!value.trim()) throw new AccountingError("time_zone_invalid");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
  } catch {
    throw new AccountingError("time_zone_invalid");
  }
  return value;
}

export function workspaceTimeZone(workspace: { timeZone?: string }): string {
  return workspace.timeZone ?? FALLBACK_WORKSPACE_TIME_ZONE;
}

export function calendarDate(now: Date, timeZone: string): string {
  if (Number.isNaN(now.getTime())) throw new AccountingError("clock_required");
  const zone = requireTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new AccountingError("clock_required");
  return `${year}-${month}-${day}`;
}

export function calendarMonth(now: Date, timeZone: string): {
  year: number;
  month: number;
} {
  const date = calendarDate(now, timeZone);
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}
