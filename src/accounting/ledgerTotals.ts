import type { StoredJournalEntry } from "./types";

export type AccountTotals = {
  debitMinorUnits: number;
  creditMinorUnits: number;
};

/** Debit and credit totals per Ledger Account, from Posted Journal Lines only. */
export function totalsByAccount(
  entries: StoredJournalEntry[],
): Map<string, AccountTotals> {
  const totals = new Map<string, AccountTotals>();
  for (const line of entries.flatMap((entry) => entry.lines)) {
    const current = totals.get(line.ledgerAccountId) ?? {
      debitMinorUnits: 0,
      creditMinorUnits: 0,
    };
    totals.set(line.ledgerAccountId, {
      debitMinorUnits: current.debitMinorUnits + line.debitMinorUnits,
      creditMinorUnits: current.creditMinorUnits + line.creditMinorUnits,
    });
  }
  return totals;
}
