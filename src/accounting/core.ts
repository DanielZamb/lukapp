import { balances } from "./commands/balances";
import { createFinancialAccountProfile } from "./commands/createFinancialAccountProfile";
import { createPersonalWorkspace } from "./commands/createPersonalWorkspace";
import { listFinancialAccountProfiles } from "./commands/listFinancialAccountProfiles";
import { listPostedCashExpenses } from "./commands/listPostedCashExpenses";
import { lockAccountingPeriod } from "./commands/lockAccountingPeriod";
import { openWorkspace } from "./commands/openWorkspace";
import { recordCashExpense } from "./commands/recordCashExpense";
import { trialBalance } from "./commands/trialBalance";
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
    recordCashExpense: (input) => recordCashExpense(store, input),
    listPostedCashExpenses: (input) => listPostedCashExpenses(store, input),
    balances: (input) => balances(store, input),
    trialBalance: (input) => trialBalance(store, input),
    lockAccountingPeriod: (input) => lockAccountingPeriod(store, input),
  };
}
