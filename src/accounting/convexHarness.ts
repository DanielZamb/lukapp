import { afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { FinancialAccountProductKind } from "./types";
import type { ClerkSession } from "../../convex/lib/clerkProvider";
import { createAccountingCore } from "./core";
import { run as runAccounting } from "../../convex/accountingErrors";
import { convexStore } from "../../convex/store";

export const owner = { userId: "owner-1" };
export const septNow = Date.UTC(2026, 8, 24, 15);
export const octNow = Date.UTC(2026, 9, 2, 12);

export const fixtureIdentity = {
  subject: owner.userId,
  issuer: "https://fixture.clerk.accounts.dev",
  sid: "sess_accounting",
  sts: "active",
};
export type AccountingTest = Awaited<ReturnType<typeof convexAccounting>>;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

export async function accountingFixture(
  modules: Record<string, () => Promise<unknown>>,
) {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", owner.userId);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", fixtureIdentity.issuer);
  vi.stubEnv("CLERK_SECRET_KEY", "fixture-only-not-a-credential");
  vi.setSystemTime(septNow);
  const providerSession: ClerkSession = {
    id: fixtureIdentity.sid,
    user_id: owner.userId,
    client_id: "client_accounting",
    status: "active",
    created_at: septNow - 1000,
    expire_at: septNow + 365 * 24 * 60 * 60 * 1000,
    abandon_at: septNow + 365 * 24 * 60 * 60 * 1000,
  };
  const transport = vi.fn<typeof fetch>(async (input, options) => {
    if (
      String(input) !==
        `https://api.clerk.com/v1/sessions/${fixtureIdentity.sid}` ||
      options?.method !== "GET"
    ) {
      throw new Error("Unexpected fixture provider request");
    }
    return Response.json(providerSession);
  });
  vi.stubGlobal("fetch", transport);
  const root = convexTest(schema, modules);
  const t = root.withIdentity(fixtureIdentity);
  const deviceId = await t.action(api.deviceAccess.register, {
    platform: "ios",
    label: "Test phone",
    installId: "fixture-install-0001",
    appVersion: "test",
  });
  return { root, t, deviceId, providerSession, transport };
}

export async function convexAccounting(
  modules: Record<string, () => Promise<unknown>>,
) {
  return (await accountingFixture(modules)).t;
}

// Trusted domain-test provisioning only. No public self-service endpoint is exposed.
export function provisionWorkspace(
  t: AccountingTest,
  args: { functionalCurrency: string; chartOfAccountsTemplate?: string },
) {
  return t.run((ctx) =>
    runAccounting(() =>
      createAccountingCore(convexStore(ctx.db)).createPersonalWorkspace({
        ...args,
        actor: owner,
      }),
    ),
  );
}

export async function createOwnedWorkspace(t: AccountingTest, now = septNow) {
  vi.setSystemTime(now);
  return provisionWorkspace(t, {
    functionalCurrency: "COP",
  });
}

export async function createProfile(
  t: AccountingTest,
  workspaceId: string,
  name: string,
  productKind: FinancialAccountProductKind,
) {
  return t.action(api.accounting.createFinancialAccountProfile, {
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
    workspaceId,
    financialAccountProfileId: profileId,
    amount: { currency: "COP", minorUnits: extra?.amount ?? 150000 },
    accountingDate: extra?.accountingDate ?? "2026-09-24",
    description: extra?.description ?? "Groceries",
    idempotencyKey: extra?.idempotencyKey ?? "groceries-1",
  };
}

export function reader(t: AccountingTest, workspaceId: string) {
  const args = { workspaceId };
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
  return t.action(api.accounting.lockAccountingPeriod, {
    workspaceId,
    period,
    ...(reason ? { reason } : {}),
  });
}

export function reverse(
  t: AccountingTest,
  workspaceId: string,
  journalEntryId: string,
  extra?: {
    accountingDate?: string;
    description?: string;
    idempotencyKey?: string;
  },
) {
  return t.action(api.accounting.reversePostedEntry, {
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
