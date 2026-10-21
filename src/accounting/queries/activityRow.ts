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

type ActivityProfile = { id: string; postingAccountId: string; name: string };

export function profilesByPostingAccount(
  profiles: Iterable<ActivityProfile>,
) {
  return new Map(
    [...profiles].map((profile) => [profile.postingAccountId, profile]),
  );
}

function transferPlaces(
  entry: PostedJournalEntry,
  profilesByLedgerAccountId?: ReadonlyMap<string, ActivityProfile>,
) {
  if (!profilesByLedgerAccountId) return undefined;
  const named = (side: "debitMinorUnits" | "creditMinorUnits") =>
    entry.lines.flatMap((line) => {
      if (line[side] <= 0) return [];
      const profile = profilesByLedgerAccountId.get(line.ledgerAccountId);
      return profile ? [{ id: profile.id, name: profile.name }] : [];
    });
  const from = named("creditMinorUnits");
  const to = named("debitMinorUnits");
  return from.length === 1 && to.length === 1
    ? { from: from[0], to: to[0] }
    : undefined;
}

export function activityRow(
  entry: PostedJournalEntry,
  profilePostingAccountId?: string,
  profilesByLedgerAccountId?: ReadonlyMap<string, ActivityProfile>,
) {
  const userCategories = entry.lines.flatMap((line) => line.userCategories);
  const primaryUserCategoryId = entry.lines.find(
    (line) => line.primaryUserCategoryId,
  )?.primaryUserCategoryId;
  const profileLines = entry.lines.filter(
    (line) => line.ledgerAccountId === profilePostingAccountId,
  );
  const minorUnits = profileLines.reduce(
    (sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits,
    0,
  );
  const financialAccountProfileIds = profilesByLedgerAccountId
    ? [...new Set(entry.lines.flatMap((line) => {
        const profile = profilesByLedgerAccountId.get(line.ledgerAccountId);
        return profile ? [profile.id] : [];
      }))]
    : undefined;
  const transfer = transferPlaces(entry, profilesByLedgerAccountId);
  const label = transfer
    ? `${transfer.from.name} → ${transfer.to.name}`
    : fallbackLabel(entry);
  const categoryDetail = userCategories
    .map((category) => category.name)
    .join(" · ");
  const detail =
    entry.policy === "account-transfer@1"
      ? label
      : categoryDetail || label;
  return {
    id: entry.id,
    ...(entry.financialAccountProfileId
      ? { financialAccountProfileId: entry.financialAccountProfileId }
      : {}),
    ...(financialAccountProfileIds ? { financialAccountProfileIds } : {}),
    ...(transfer ? { transfer } : {}),
    title: entry.description || fallbackLabel(entry),
    date: entry.accountingDate,
    detail,
    userCategories,
    ...(primaryUserCategoryId ? { primaryUserCategoryId } : {}),
    reversed: entry.reversedByEntryId !== undefined,
    ...(entry.reversesEntryId ? { reversesEntryId: entry.reversesEntryId } : {}),
    ...(entry.reversedByEntryId
      ? { reversedByEntryId: entry.reversedByEntryId }
      : {}),
    amount: {
      ...entry.amount,
      minorUnits: profileLines.length ? minorUnits : entry.amount.minorUnits,
    },
  };
}
