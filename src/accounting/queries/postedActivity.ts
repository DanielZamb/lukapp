import { balances } from "./balances";
import { listJournalEntries } from "./listJournalEntries";
import type { AccountingStore, Actor } from "../types";

export async function postedActivity(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string; month: string },
) {
  const [accounts, entries] = await Promise.all([
    balances(store, input),
    listJournalEntries(store, input),
  ]);
  const monthSpendMinorUnits = entries
    .filter((entry) => entry.accountingDate.slice(0, 7) === input.month)
    .flatMap((entry) => entry.lines)
    .filter((line) => line.nature === "Expense")
    .reduce(
      (sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits,
      0,
    );
  const rows = entries
    .filter((entry) => !entry.reversesEntryId)
    .sort(
      (a, b) =>
        b.accountingDate.localeCompare(a.accountingDate) ||
        b.postedAt - a.postedAt ||
        b.id.localeCompare(a.id),
    )
    .map((entry) => ({
      id: entry.id,
      financialAccountProfileId: entry.financialAccountProfileId,
      title: entry.description || "Expense",
      date: entry.accountingDate,
      detail:
        entry.policy === "start-tracking@1"
          ? "Starting amount"
          : entry.policy === "cash-income@1"
            ? "Income"
            : "Expense",
      reversed: entry.reversedByEntryId !== undefined,
      amount: {
        ...entry.amount,
        minorUnits:
          entry.policy === "cash-expense@1"
            ? -entry.amount.minorUnits
            : entry.amount.minorUnits,
      },
    }));
  return {
    accounts: accounts.map((account) => ({
      financialAccountProfileId: account.financialAccountProfileId,
      name: account.name,
      balance: account.balance,
    })),
    rows,
    monthSpendMinorUnits,
  };
}
