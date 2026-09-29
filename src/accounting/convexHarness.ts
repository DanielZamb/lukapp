import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { FinancialAccountProductKind } from "./types";

export const owner = { userId: "owner-1" };
export const septNow = Date.UTC(2026, 8, 24, 15);
export const octNow = Date.UTC(2026, 9, 2, 12);

export type AccountingTest = ReturnType<typeof convexAccounting>;

export function convexAccounting(
  modules: Record<string, () => Promise<unknown>>,
) {
  return convexTest(schema, modules);
}

export async function createOwnedWorkspace(t: AccountingTest, now = septNow) {
  return t.mutation(api.accounting.createPersonalWorkspace, {
    userId: owner.userId,
    functionalCurrency: "COP",
    now,
  });
}

export async function createProfile(
  t: AccountingTest,
  workspaceId: string,
  name: string,
  productKind: FinancialAccountProductKind,
) {
  return t.mutation(api.accounting.createFinancialAccountProfile, {
    userId: owner.userId,
    workspaceId,
    name,
    productKind,
  });
}

export async function createDaily(t: AccountingTest, workspaceId: string) {
  return createProfile(t, workspaceId, "Daily", "bankAccount");
}

export function groceries(
  workspaceId: string,
  profileId: string,
  extra?: {
    amount?: number;
    accountingDate?: string;
    description?: string;
    idempotencyKey?: string;
  },
) {
  return {
    userId: owner.userId,
    workspaceId,
    financialAccountProfileId: profileId,
    amount: { currency: "COP", minorUnits: extra?.amount ?? 150000 },
    accountingDate: extra?.accountingDate ?? "2026-09-24",
    description: extra?.description ?? "Groceries",
    idempotencyKey: extra?.idempotencyKey ?? "groceries-1",
  };
}

export function reader(t: AccountingTest, workspaceId: string) {
  const args = { userId: owner.userId, workspaceId };
  return {
    entries: () => t.query(api.accounting.listJournalEntries, args),
    balances: () => t.query(api.accounting.balances, args),
    trialBalance: () => t.query(api.accounting.trialBalance, args),
    ledgerAccounts: () => t.query(api.accounting.listLedgerAccounts, args),
  };
}

export function lock(
  t: AccountingTest,
  workspaceId: string,
  period: { year: number; month: number },
  reason?: string,
) {
  return t.mutation(api.accounting.lockAccountingPeriod, {
    userId: owner.userId,
    workspaceId,
    period,
    ...(reason ? { reason } : {}),
  });
}

export function reverse(
  t: AccountingTest,
  workspaceId: string,
  journalEntryId: string,
  extra?: { accountingDate?: string; description?: string; idempotencyKey?: string },
) {
  return t.mutation(api.accounting.reversePostedEntry, {
    userId: owner.userId,
    workspaceId,
    journalEntryId,
    idempotencyKey: extra?.idempotencyKey ?? `reverse-${journalEntryId}`,
    ...(extra?.accountingDate ? { accountingDate: extra.accountingDate } : {}),
    ...(extra?.description ? { description: extra.description } : {}),
  });
}

export function caught(work: Promise<unknown>) {
  return work.catch((error: unknown) => error);
}
