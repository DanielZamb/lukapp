import { calendarDate } from "../accounting/timeZone";

export function resolveEventCalendarDate(input: {
  eventTime: number;
  currentTimeZone: string;
  changes: readonly { changedAt: number; previousValue: string }[];
}) {
  const next = input.changes
    .filter(change => change.changedAt > input.eventTime)
    .sort((a, b) => a.changedAt - b.changedAt)[0];
  return calendarDate(new Date(input.eventTime), next?.previousValue ?? input.currentTimeZone);
}
