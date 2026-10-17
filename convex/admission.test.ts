import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
const queries = {
  openWorkspace: { workspaceId: "foreign" },
  listFinancialAccountProfiles: { workspaceId: "foreign" },
  listLedgerAccounts: { workspaceId: "foreign" },
  listCatalogAccounts: { workspaceId: "foreign" },
  listJournalEntries: { workspaceId: "foreign" },
  balances: { workspaceId: "foreign" },
  trialBalance: { workspaceId: "foreign" },
  personalDefaults: {},
  postedActivity: { workspaceId: "foreign", month: "2026-10" },
};
const cash = {
  workspaceId: "foreign",
  financialAccountProfileId: "foreign",
  amount: { currency: "COP", minorUnits: 100 },
  accountingDate: "2026-10-17",
  description: "Expense",
  idempotencyKey: "x",
};
const mutations = {
  createPersonalWorkspace: { functionalCurrency: "COP" },
  createFinancialAccountProfile: {
    workspaceId: "foreign",
    name: "Cash",
    productKind: "cash",
  },
  lockAccountingPeriod: {
    workspaceId: "foreign",
    period: { year: 2026, month: 10 },
  },
  recordCashExpense: cash,
  recordCashIncome: cash,
  reversePostedEntry: {
    workspaceId: "foreign",
    journalEntryId: "foreign",
    idempotencyKey: "x",
  },
  ensurePersonalDefaults: { functionalCurrency: "COP", startingMinorUnits: 0 },
};
afterEach(() => vi.unstubAllEnvs());

for (const mode of ["anonymous", "other", "missing-config"] as const) {
  test(`every accounting endpoint rejects ${mode} before accessing data`, async () => {
    vi.stubEnv(
      "LUKAPP_OWNER_CLERK_SUBJECT",
      mode === "missing-config" ? "" : "owner-fixture",
    );
    const root = convexTest(schema, modules);
    const client =
      mode === "anonymous"
        ? root
        : root.withIdentity({
            subject: mode === "other" ? "stranger-fixture" : "owner-fixture",
          });
    const code =
      mode === "anonymous" ? "authentication_required" : "owner_required";
    for (const [name, args] of Object.entries(queries)) {
      await expect(
        client.query(
          makeFunctionReference<"query">(`accounting:${name}`),
          args,
        ),
      ).rejects.toMatchObject({ data: { code } });
    }
    for (const [name, args] of Object.entries(mutations)) {
      await expect(
        client.mutation(
          makeFunctionReference<"mutation">(`accounting:${name}`),
          args,
        ),
      ).rejects.toMatchObject({ data: { code } });
    }
    expect(
      await root.run((ctx) => ctx.db.query("workspaces").collect()),
    ).toEqual([]);
    expect(
      await root.run((ctx) => ctx.db.query("journalEntries").collect()),
    ).toEqual([]);
  });
}

test("all accounting validators reject caller-supplied actors, including for the admitted owner", async () => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", "owner-fixture");
  const t = convexTest(schema, modules).withIdentity({
    subject: "owner-fixture",
  });
  for (const [name, args] of Object.entries(queries))
    await expect(
      t.query(makeFunctionReference<"query">(`accounting:${name}`), {
        ...args,
        userId: "owner-fixture",
      }),
    ).rejects.toThrow();
  for (const [name, args] of Object.entries(mutations))
    await expect(
      t.mutation(makeFunctionReference<"mutation">(`accounting:${name}`), {
        ...args,
        userId: "owner-fixture",
      }),
    ).rejects.toThrow();
  await expect(
    t.mutation(
      makeFunctionReference<"mutation">("accounting:createPersonalWorkspace"),
      { functionalCurrency: "COP", now: 0 },
    ),
  ).rejects.toThrow();
  expect(await t.run((ctx) => ctx.db.query("workspaces").collect())).toEqual(
    [],
  );
});

test("connection shares the enforced owner admission decision", async () => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", "owner-fixture");
  const t = convexTest(schema, modules);
  expect(await t.query(api.authConnection.connection, {})).toEqual({
    status: "signed-out",
  });
  expect(
    await t
      .withIdentity({ subject: "other-fixture" })
      .query(api.authConnection.connection, {}),
  ).toEqual({ status: "not-owner" });
  expect(
    await t
      .withIdentity({ subject: "owner-fixture" })
      .query(api.authConnection.connection, {}),
  ).toEqual({ status: "owner", clerkSubject: "owner-fixture" });
});
