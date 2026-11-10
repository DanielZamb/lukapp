import type { Infer } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { StoredJournalEntry } from "../src/accounting/types";
import type { placeClosure } from "./accountingPlaceValues";
import type { undoSnapshot } from "./accountingUndoValues";
import { convexReadStore } from "./store";

export async function undoEffects(ctx: QueryCtx, closure: Infer<typeof placeClosure>, entries: StoredJournalEntry[]) {
  const store = convexReadStore(ctx.db);
  const profile = await store.getProfile(closure.financialAccountProfileId);
  if (!profile) throw new Error("Missing preview profile");
  const profiles = await store.listProfiles(profile.workspaceId);
  const accounts = new Map((await store.listLedgerAccounts(profile.workspaceId)).map(a => [a.id, a]));
  const deltas = new Map<string, number>();
  const lockedPeriods = new Map<string, boolean>();
  let lockedMonthEntries = 0, earlierOpenMonthEntries = 0, expense = 0, income = 0;
  for (const entry of entries) {
    const month = entry.accountingDate.slice(0, 7);
    if (!lockedPeriods.has(month)) lockedPeriods.set(month, (await store.getAccountingPeriod(profile.workspaceId, entry.period))?.status === "locked");
    const locked = lockedPeriods.get(month);
    if (locked) lockedMonthEntries++;
    else if (entry.accountingDate.slice(0, 7) < closure.accountingDate.slice(0, 7)) earlierOpenMonthEntries++;
    for (const line of entry.lines) {
      const account = accounts.get(line.ledgerAccountId);
      const debit = line.creditMinorUnits - line.debitMinorUnits;
      if (account?.nature === "Expense") expense += debit;
      if (account?.nature === "Revenue") income -= debit;
      const other = profiles.find(p => p.id !== profile.id && p.postingAccountId === line.ledgerAccountId);
      if (other) deltas.set(other.id, (deltas.get(other.id) ?? 0) + (account?.normalSide === "Debit" ? debit : -debit));
    }
  }
  const currency = closure.balance.currency;
  return { entriesToReverse: entries.length, lockedMonthEntries, earlierOpenMonthEntries,
    otherPlaces: profiles.filter(p => deltas.has(p.id)).map(p => ({ financialAccountProfileId: p.id, name: p.name, balanceChange: { currency, minorUnits: deltas.get(p.id) ?? 0 } })),
    currentMonthExpenseChange: { currency, minorUnits: expense }, currentMonthIncomeChange: { currency, minorUnits: income } };
}

export async function undoSnapshotFor(ctx: QueryCtx, closure: Infer<typeof placeClosure>, entries: StoredJournalEntry[]): Promise<Infer<typeof undoSnapshot>> {
  const effects = await undoEffects(ctx, closure, entries);
  const originals = [...entries].sort((a, b) => a.id.localeCompare(b.id)).map(e => ({
    id: e.id, policy: e.policy, accountingDate: e.accountingDate, period: e.period,
    financialAccountProfileId: e.financialAccountProfileId ?? null,
    lines: e.lines.map(l => ({ ledgerAccountId: l.ledgerAccountId,
      debitMinorUnits: l.debitMinorUnits, creditMinorUnits: l.creditMinorUnits,
      userCategoryId: l.userCategoryId ?? null, userCategoryIds: l.userCategoryIds ?? [], primaryUserCategoryId: l.primaryUserCategoryId ?? null })),
  }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ version: 1, profileId: closure.financialAccountProfileId, month: closure.accountingDate.slice(0, 7), originals, effects })));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return { fingerprint, ...effects };
}
