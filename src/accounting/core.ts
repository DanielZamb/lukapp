import { createFinancialAccountProfile } from "./commands/createFinancialAccountProfile";
import { createPersonalWorkspace } from "./commands/createPersonalWorkspace";
import { lockAccountingPeriod } from "./commands/lockAccountingPeriod";
import { recordCashExpense } from "./commands/recordCashExpense";
import { recordCashIncome } from "./commands/recordCashIncome";
import { reversePostedEntry } from "./commands/reversePostedEntry";
import { balances } from "./queries/balances";
import { listCatalogAccounts } from "./queries/listCatalogAccounts";
import { listFinancialAccountProfiles } from "./queries/listFinancialAccountProfiles";
import { listJournalEntries } from "./queries/listJournalEntries";
import { listLedgerAccounts } from "./queries/listLedgerAccounts";
import { openWorkspace } from "./queries/openWorkspace";
import { trialBalance } from "./queries/trialBalance";
import type { AccountingClock, AccountingCore, AccountingStore } from "./types";

export function createAccountingCore(
  store: AccountingStore,
  clock: AccountingClock = { now: () => new Date() },
): AccountingCore {
  return {
    createPersonalWorkspace: (input) =>
      createPersonalWorkspace(store, clock, input),
    openWorkspace: (input) => openWorkspace(store, clock, input),
    createFinancialAccountProfile: (input) =>
      createFinancialAccountProfile(store, input),
    listFinancialAccountProfiles: (input) =>
      listFinancialAccountProfiles(store, input),
    listLedgerAccounts: (input) => listLedgerAccounts(store, input),
    listCatalogAccounts: (input) => listCatalogAccounts(store, input),
    recordCashExpense: (input) => recordCashExpense(store, clock, input),
    recordCashIncome: (input) => recordCashIncome(store, clock, input),
    reversePostedEntry: (input) => reversePostedEntry(store, clock, input),
    listJournalEntries: (input) => listJournalEntries(store, input),
    balances: (input) => balances(store, input),
    trialBalance: (input) => trialBalance(store, input),
    lockAccountingPeriod: (input) => lockAccountingPeriod(store, clock, input),
  };
}
