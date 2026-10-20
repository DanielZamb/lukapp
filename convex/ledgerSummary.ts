import type { GenericMutationCtx } from "convex/server";
import { AccountingError } from "../src/accounting/errors";
import { totalsByAccount } from "../src/accounting/ledgerTotals";
import { isOpening } from "../src/accounting/openingControl";
import type { StoredJournalEntry } from "../src/accounting/types";
import type { DataModel, Id } from "./_generated/dataModel";
import type { ReadDb } from "./store";

type WriteDb = GenericMutationCtx<DataModel>["db"];
const LIFETIME = "*";

export async function requireLedgerSummary(db: ReadDb, workspaceId: Id<"workspaces">) {
  if ((await db.get(workspaceId))?.ledgerSummaryVersion !== 1)
    throw new AccountingError("ledger_summary_not_ready");
}

export async function readAccountTotals(db: ReadDb, workspaceId: Id<"workspaces">, month?: string) {
  await requireLedgerSummary(db, workspaceId);
  const rows = await db.query("ledgerAccountTotals")
    .withIndex("by_workspace_period_account", (q) => q.eq("workspaceId", workspaceId).eq("period", month ?? LIFETIME))
    .collect();
  return new Map(rows.map((row) => [row.ledgerAccountId, {
    debitMinorUnits: row.debitMinorUnits, creditMinorUnits: row.creditMinorUnits,
  }]));
}

export async function readFirstActivityDate(db: ReadDb, workspaceId: Id<"workspaces">, accountId: Id<"ledgerAccounts">) {
  await requireLedgerSummary(db, workspaceId);
  const row = await db.query("ledgerAccountTotals")
    .withIndex("by_workspace_period_account", (q) =>
      q.eq("workspaceId", workspaceId).eq("period", LIFETIME).eq("ledgerAccountId", accountId))
    .unique();
  return row?.firstActivityDate;
}

export async function applyJournalSummary(db: WriteDb, entry: StoredJournalEntry) {
  const workspaceId = db.normalizeId("workspaces", entry.workspaceId);
  const journalEntryId = db.normalizeId("journalEntries", entry.id);
  if (!workspaceId || !journalEntryId) throw new AccountingError("journal_entry_not_found");
  const applied = await db.query("ledgerSummaryEntries")
    .withIndex("by_entry", (q) => q.eq("journalEntryId", journalEntryId)).unique();
  if (applied) return false;
  const activity = !entry.reversesEntryId && !isOpening(entry);
  for (const [accountId, totals] of totalsByAccount([entry])) {
    const ledgerAccountId = db.normalizeId("ledgerAccounts", accountId);
    if (!ledgerAccountId) throw new AccountingError("ledger_account_not_found");
    for (const period of [LIFETIME, entry.accountingDate.slice(0, 7)]) {
      const prior = await db.query("ledgerAccountTotals")
        .withIndex("by_workspace_period_account", (q) =>
          q.eq("workspaceId", workspaceId).eq("period", period).eq("ledgerAccountId", ledgerAccountId))
        .unique();
      const debitMinorUnits = (prior?.debitMinorUnits ?? 0) + totals.debitMinorUnits;
      const creditMinorUnits = (prior?.creditMinorUnits ?? 0) + totals.creditMinorUnits;
      if (!Number.isSafeInteger(debitMinorUnits) || !Number.isSafeInteger(creditMinorUnits))
        throw new AccountingError("ledger_totals_out_of_range");
      const firstActivityDate = activity && period === LIFETIME
        ? (prior?.firstActivityDate && prior.firstActivityDate < entry.accountingDate
          ? prior.firstActivityDate : entry.accountingDate)
        : prior?.firstActivityDate;
      const values = { debitMinorUnits, creditMinorUnits, ...(firstActivityDate ? { firstActivityDate } : {}) };
      if (prior) await db.patch(prior._id, values);
      else await db.insert("ledgerAccountTotals", { workspaceId, ledgerAccountId, period, ...values });
    }
  }
  await db.insert("ledgerSummaryEntries", { journalEntryId });
  return true;
}
