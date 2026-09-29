import { recordCashActivity } from "../cashActivity";
import type {
  AccountingClock,
  AccountingStore,
  CashActivityInput,
  PostedJournalEntry,
} from "../types";

/** Dr the profile's Posting Account, Cr Income. */
export function recordCashIncome(
  store: AccountingStore,
  clock: AccountingClock,
  input: CashActivityInput,
): Promise<PostedJournalEntry> {
  return recordCashActivity(store, clock, input, {
    policy: "cash-income@1",
    direction: "in",
    counterpart: "income",
  });
}
