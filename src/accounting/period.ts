import { AccountingError } from "./errors";

export function clockMonth(now: Date): { year: number; month: number } {
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
    utc.getUTCMonth() + 1 !== month ||
    utc.getUTCDate() !== day
  ) {
    throw new AccountingError("accounting_date_required");
  }
  return { year, month };
}
