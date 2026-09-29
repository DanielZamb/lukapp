import { AccountingError } from "./errors";
import { firstDayOf, nextPeriod, periodFromAccountingDate } from "./period";
import type { AccountingPeriod, AccountingStore, PeriodKey } from "./types";

/** An Accounting Period opens the first time an entry is dated into it. */
export async function ensureOpenPeriod(
  store: AccountingStore,
  workspaceId: string,
  period: PeriodKey,
): Promise<AccountingPeriod> {
  const stored = await store.getAccountingPeriod(workspaceId, period);
  if (stored) {
    return stored;
  }
  return store.insertAccountingPeriod(workspaceId, { ...period, status: "open" });
}

export async function requirePostablePeriod(
  store: AccountingStore,
  workspaceId: string,
  accountingDate: string,
): Promise<AccountingPeriod> {
  const period = await ensureOpenPeriod(
    store,
    workspaceId,
    periodFromAccountingDate(accountingDate),
  );
  if (period.status === "locked") {
    throw new AccountingError("locked_period");
  }
  return period;
}

/**
 * The date itself when its period is open; otherwise the first day of the next
 * period that is not locked (primer invariant 35).
 */
export async function earliestPermittedDate(
  store: AccountingStore,
  workspaceId: string,
  accountingDate: string,
): Promise<string> {
  let period = periodFromAccountingDate(accountingDate);
  let candidate = accountingDate;
  for (;;) {
    const stored = await store.getAccountingPeriod(workspaceId, period);
    if (stored?.status !== "locked") {
      return candidate;
    }
    period = nextPeriod(period);
    candidate = firstDayOf(period);
  }
}
