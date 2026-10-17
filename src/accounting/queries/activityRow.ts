import type { PostedJournalEntry } from "../types";

export function activityRow(entry: PostedJournalEntry, profilePostingAccountId?: string) {
  const userCategories = entry.lines.flatMap((line) => line.userCategories);
  const primaryUserCategoryId = entry.lines.find((line) => line.primaryUserCategoryId)?.primaryUserCategoryId;
  const profileLines = entry.lines.filter((line) => line.ledgerAccountId === profilePostingAccountId);
  const minorUnits = profileLines.reduce((sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits, 0);
  return {
    id: entry.id,
    ...(entry.financialAccountProfileId ? { financialAccountProfileId: entry.financialAccountProfileId } : {}),
    title: entry.description || (entry.reversesEntryId ? "Reversal" : "Entry"),
    date: entry.accountingDate,
    detail: userCategories.map((category) => category.name).join(" · ") ||
      (entry.policy === "start-tracking@1" ? "Starting amount" :
        entry.policy === "cash-income@1" ? "Income" :
          entry.policy === "reversal@1" ? "Reversal" : "Expense"),
    userCategories,
    ...(primaryUserCategoryId ? { primaryUserCategoryId } : {}),
    reversed: entry.reversedByEntryId !== undefined,
    ...(entry.reversesEntryId ? { reversesEntryId: entry.reversesEntryId } : {}),
    ...(entry.reversedByEntryId ? { reversedByEntryId: entry.reversedByEntryId } : {}),
    amount: { ...entry.amount, minorUnits: profileLines.length ? minorUnits : entry.amount.minorUnits },
  };
}
