import { AccountingError } from "../errors";
import type { AccountingStore } from "../types";

export async function expenseEligibility(store: Pick<AccountingStore, "listJournalSourceEffects" | "getJournalEntry" | "findReversalOf">,
  input: { workspaceId: string; sourceEntryId: string; originalMinorUnits: number; asKnownAt?: number }) {
  const facts = await store.listJournalSourceEffects(input.workspaceId, input.sourceEntryId);
  const effects = [];
  const prefixes = [];
  let eligible = BigInt(input.originalMinorUnits);
  for (const [index, fact] of [...facts].sort((a, b) => a.sourceSequence - b.sourceSequence).entries()) {
    if (!Number.isSafeInteger(fact.sourceSequence) || fact.sourceSequence !== index + 1)
      throw new AccountingError("journal_source_effect_invalid");
    const entry = await store.getJournalEntry(fact.journalEntryId);
    if (!entry || entry.workspaceId !== input.workspaceId || !Number.isSafeInteger(fact.expenseDeltaMinorUnits))
      throw new AccountingError("journal_source_effect_invalid");
    if (input.asKnownAt !== undefined && entry.postedAt > input.asKnownAt) continue;
    eligible += BigInt(fact.expenseDeltaMinorUnits);
    const prefixMinor = Number(eligible > 0n ? eligible : 0n);
    if (!Number.isSafeInteger(prefixMinor)) throw new AccountingError("journal_source_effect_invalid");
    prefixes.push({ sourceSequence: fact.sourceSequence, recordedAt: entry.postedAt, eligibleMinorUnits: prefixMinor });
    const reversal = await store.findReversalOf(entry.id);
    effects.push({ ...fact, accountingDate: entry.accountingDate, recordedAt: entry.postedAt,
      reversedByEntryId: reversal && (input.asKnownAt === undefined || reversal.postedAt <= input.asKnownAt) ? reversal.id : null });
  }
  const minorUnits = Number(eligible > 0n ? eligible : 0n);
  if (!Number.isSafeInteger(minorUnits)) throw new AccountingError("journal_source_effect_invalid");
  return { minorUnits, effects, prefixes };
}
