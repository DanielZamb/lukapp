import { recordCashActivity } from "../cashActivity";
import type {
  AccountingClock,
  AccountingStore,
  CashActivityInput,
  PostedJournalEntry,
} from "../types";

/** Dr an expense account (the template default unless chosen), Cr the profile's Posting Account. */
export function recordCashExpense(
  store: AccountingStore,
  clock: AccountingClock,
  input: CashActivityInput,
): Promise<PostedJournalEntry> {
  return recordCashActivity(store, clock, input, {
    policy: "cash-expense@1",
    direction: "out",
    counterpart: "expense",
  });
}
