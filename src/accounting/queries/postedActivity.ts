import { balances } from "./balances";
import { AccountingError } from "../errors";
import { calendarDate } from "../timeZone";
import { activityRow, profilesByPostingAccount } from "./activityRow";
import { requireWorkspace } from "../membership";
import { findActiveOpening } from "../openingControl";
import { journalContext, toPostedJournalEntry } from "../views";
import type { AccountingStore, Actor } from "../types";

/** Home totals plus an optional preview of the latest 50 journal records. Use postedHistory for more rows. */
export async function postedActivity(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string; month: string; includeRows?: boolean },
) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const [accounts, entries, context, monthTotals] = await Promise.all([
    balances(store, input),
    input.includeRows === false ? Promise.resolve([]) : store.recentJournalEntries(input.workspaceId),
    journalContext(store, workspace),
    store.accountTotals(input.workspaceId, input.month),
  ]);
  const monthSpendMinorUnits = [...monthTotals]
    .filter(([id]) => context.accounts.get(id)?.nature === "Expense")
    .reduce((sum, [, totals]) => sum + totals.debitMinorUnits - totals.creditMinorUnits, 0);
  const rows = input.includeRows === false ? [] : await Promise.all(entries
    .filter((entry) => !entry.reversesEntryId)
    .sort((a, b) => b.accountingDate.localeCompare(a.accountingDate) || b.postedAt - a.postedAt || b.id.localeCompare(a.id))
    .map(async (stored) => {
      const reversalId = (await store.findReversalOf(stored.id))?.id;
      const entry = await toPostedJournalEntry(store, context, stored, {
        replay: false,
        ...(reversalId ? { reversedByEntryId: reversalId } : {}),
      });
      const profile = entry.financialAccountProfileId ? context.profiles.get(entry.financialAccountProfileId) : undefined;
      return activityRow(
        entry,
        profile?.postingAccountId,
        profilesByPostingAccount(context.profiles.values()),
      );
    }));
  return {
    accounts: await Promise.all(accounts.map(async (account) => {
      const profile = context.profiles.get(account.financialAccountProfileId);
      if (!profile) throw new AccountingError("financial_account_profile_not_found");
      const opening = await findActiveOpening(store, workspace.id, profile.id);
      const trackingFrom = opening?.accountingDate
        ?? (profile.createdAt === undefined ? null : calendarDate(new Date(profile.createdAt), workspace.timeZone));
      return {
        productKind: profile.productKind,
        ...(profile.emoji ? { emoji: profile.emoji } : {}),
        trackingFrom,
        financialAccountProfileId: account.financialAccountProfileId,
        name: account.name,
        nature: account.nature,
        balance: account.balance,
      };
    })),
    rows,
    monthSpendMinorUnits,
  };
}
