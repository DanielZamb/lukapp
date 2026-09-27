import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

export const owner = { userId: "owner-1" };
export const septNow = Date.UTC(2026, 8, 24, 15);
export const octNow = Date.UTC(2026, 9, 2, 12);

export function convexAccounting(
  modules: Record<string, () => Promise<unknown>>,
) {
  return convexTest(schema, modules);
}

export async function createOwnedWorkspace(
  t: ReturnType<typeof convexAccounting>,
  now = septNow,
) {
  return t.mutation(api.accounting.createPersonalWorkspace, {
    userId: owner.userId,
    functionalCurrency: "COP",
    now,
  });
}

export async function createDaily(
  t: ReturnType<typeof convexAccounting>,
  workspaceId: string,
) {
  return t.mutation(api.accounting.createFinancialAccountProfile, {
    userId: owner.userId,
    workspaceId,
    name: "Daily",
  });
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
