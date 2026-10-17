import { calendarDate } from "../accounting/timeZone";
import { dateFromTimestamp } from "../accounting/period";
import type { BudgetRevision } from "./types";

export class BudgetError extends Error {
  constructor(readonly code: string) { super(code); }
}

export function requireMonth(month: string) {
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new BudgetError("month_invalid");
}

export function currentBudgetMonth(now: number, timeZone: string) {
  return calendarDate(dateFromTimestamp(now), timeZone).slice(0, 7);
}

export function effectiveRevision(revisions: BudgetRevision[], month: string) {
  return revisions.filter((revision) => revision.effectiveMonth <= month)
    .reduce<BudgetRevision | null>((latest, revision) =>
      !latest || revision.effectiveMonth > latest.effectiveMonth ||
      (revision.effectiveMonth === latest.effectiveMonth && revision.sequence > latest.sequence)
        ? revision : latest, null);
}
