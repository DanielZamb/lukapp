import type { PostedJournalEntry } from "../types";

function fallbackLabel(entry: PostedJournalEntry) {
  if (entry.reversesEntryId) return "Reversal";
  switch (entry.policy) {
    case "start-tracking@1":
    case "opening-position@1":
      return "Starting amount";
    case "account-transfer@1":
      return "Account Transfer";
    case "cash-income@1":
      return "Income";
    case "reversal@1":
      return "Reversal";
    default:
      return "Expense";
  }
}

export function activityRow(entry: PostedJournalEntry, profilePostingAccountId?: string) {
  const userCategories = entry.lines.flatMap((line) => line.userCategories);
  const primaryUserCategoryId = entry.lines.find((line) => line.primaryUserCategoryId)?.primaryUserCategoryId;
  const profileLines = entry.lines.filter((line) => line.ledgerAccountId === profilePostingAccountId);
  const minorUnits = profileLines.reduce((sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits, 0);
  const label = fallbackLabel(entry);
  return {
    id: entry.id,
    ...(entry.financialAccountProfileId ? { financialAccountProfileId: entry.financialAccountProfileId } : {}),
    title: entry.description || label,
    date: entry.accountingDate,
    detail: userCategories.map((category) => category.name).join(" · ") || label,
    userCategories,
    ...(primaryUserCategoryId ? { primaryUserCategoryId } : {}),
    reversed: entry.reversedByEntryId !== undefined,
    ...(entry.reversesEntryId ? { reversesEntryId: entry.reversesEntryId } : {}),
    ...(entry.reversedByEntryId ? { reversedByEntryId: entry.reversedByEntryId } : {}),
    amount: { ...entry.amount, minorUnits: profileLines.length ? minorUnits : entry.amount.minorUnits },
  };
}
