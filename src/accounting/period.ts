import { AccountingError } from "./errors";

export function dateFromTimestamp(now: number): Date {
  // Stryker disable next-line ConditionalExpression,BlockStatement -- Invalid Date also rejects non-finite
  if (!Number.isFinite(now)) {
    throw new AccountingError("clock_required");
  }
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) {
    throw new AccountingError("clock_required");
  }
  return date;
}

export function clockMonth(now: Date): { year: number; month: number } {
  if (Number.isNaN(now.getTime())) {
    throw new AccountingError("clock_required");
  }
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
  };
}

export function periodFromAccountingDate(accountingDate: string): {
  year: number;
  month: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(accountingDate);
  if (!match) {
    throw new AccountingError("accounting_date_required");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    // Stryker disable next-line ConditionalExpression -- overflow always changes another field too
    utc.getUTCMonth() + 1 !== month ||
    // Stryker disable next-line ConditionalExpression -- overflow always changes another field too
    utc.getUTCDate() !== day
  ) {
    throw new AccountingError("accounting_date_required");
  }
  return { year, month };
}

export function requirePeriodKey(period: { year: number; month: number }): {
  year: number;
  month: number;
} {
  if (
    !Number.isInteger(period.year) ||
    period.year < 1 ||
    period.year > 9999 ||
    !Number.isInteger(period.month) ||
    period.month < 1 ||
    period.month > 12
  ) {
    throw new AccountingError("accounting_period_invalid");
  }
  return { year: period.year, month: period.month };
}

export function nextPeriod(period: { year: number; month: number }): {
  year: number;
  month: number;
} {
  return period.month === 12
    ? { year: period.year + 1, month: 1 }
    : { year: period.year, month: period.month + 1 };
}

export function firstDayOf(period: { year: number; month: number }): string {
  return `${String(period.year).padStart(4, "0")}-${String(period.month).padStart(2, "0")}-01`;
}
