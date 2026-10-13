import { createUserCategory, changeUserCategory, listUserCategories, categoryTotals, categoryNatureSuggestion } from "./categories";
import { previewCategoryReclassification, confirmCategoryReclassification } from "./reclassification";
import { createHouseholdWorkspace } from "./commands/createHouseholdWorkspace";
import { listOwnedWorkspaces } from "./queries/listOwnedWorkspaces";
import { recordAccountTransfer } from "./commands/recordAccountTransfer";
import { recordOpeningPosition } from "./commands/recordOpeningPosition";
import { setupFinancialAccount } from "./commands/setupFinancialAccount";
import { createFinancialAccountProfile } from "./commands/createFinancialAccountProfile";
import { createPersonalWorkspace } from "./commands/createPersonalWorkspace";
import { lockAccountingPeriod } from "./commands/lockAccountingPeriod";
import { recordCashExpense } from "./commands/recordCashExpense";
import { recordCashIncome } from "./commands/recordCashIncome";
import { reversePostedEntry } from "./commands/reversePostedEntry";
import { listPostedExpenses } from "./queries/listPostedExpenses";
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
    createUserCategory: input => createUserCategory(store, input),
    suggestCategoryNature: input => categoryNatureSuggestion(store, input),
    listUserCategories: input => listUserCategories(store, input),
    categoryTotals: input => categoryTotals(store, input),
    changeUserCategory: input => changeUserCategory(store, input),
    previewCategoryReclassification: input => previewCategoryReclassification(store, input),
    confirmCategoryReclassification: input => confirmCategoryReclassification(store, clock, input),
    createPersonalWorkspace: (input) =>
      createPersonalWorkspace(store, clock, input),
    createHouseholdWorkspace: (input) =>
      createHouseholdWorkspace(store, clock, input),
    listOwnedWorkspaces: (input) => listOwnedWorkspaces(store, clock, input),
    openWorkspace: (input) => openWorkspace(store, clock, input),
    createFinancialAccountProfile: (input) =>
      createFinancialAccountProfile(store, input),
    listFinancialAccountProfiles: (input) =>
      listFinancialAccountProfiles(store, input),
    listLedgerAccounts: (input) => listLedgerAccounts(store, input),
    listCatalogAccounts: (input) => listCatalogAccounts(store, input),
    recordAccountTransfer: (input) =>
      recordAccountTransfer(store, clock, input),
    recordOpeningPosition: (input) =>
      recordOpeningPosition(store, clock, input),
    setupFinancialAccount: (input) =>
      setupFinancialAccount(store, clock, input),
    recordCashExpense: (input) => recordCashExpense(store, clock, input),
    recordCashIncome: (input) => recordCashIncome(store, clock, input),
    reversePostedEntry: (input) => reversePostedEntry(store, clock, input),
    listJournalEntries: (input) => listJournalEntries(store, input),
    listPostedExpenses: (input) => listPostedExpenses(store, input),
    balances: (input) => balances(store, input),
    trialBalance: (input) => trialBalance(store, input),
    lockAccountingPeriod: (input) => lockAccountingPeriod(store, clock, input),
  };
}
