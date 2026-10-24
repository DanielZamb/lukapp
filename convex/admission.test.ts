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
  postedHistory: { workspaceId: "foreign", paginationOpts: { cursor: null, numItems: 50 } },
  postedEntry: { workspaceId: "foreign", journalEntryId: "foreign" },
  balances: { workspaceId: "foreign" },
  trialBalance: { workspaceId: "foreign" },
  personalDefaults: {},
  listUserCategories: { workspaceId: "foreign" },
  listCategoryPresets: {},
  suggestCategoryNature: { name: "mercado" },
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
const actions = {
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
  recordOpeningPosition: cash,
  recordAccountTransfer: {
    workspaceId: "foreign",
    sourceFinancialAccountProfileId: "foreign",
    destinationFinancialAccountProfileId: "other",
    amount: { currency: "COP", minorUnits: 100 },
    accountingDate: "2026-10-17",
    description: "Move",
    idempotencyKey: "x",
  },
  setupFinancialAccountProfile: {
    workspaceId: "foreign",
    name: "Bank",
    productKind: "bankAccount",
    amount: { currency: "COP", minorUnits: 0 },
    accountingDate: "2026-10-17",
    idempotencyKey: "x",
  },
  reversePostedEntry: {
    workspaceId: "foreign",
    journalEntryId: "foreign",
    idempotencyKey: "x",
  },
  ensurePersonalDefaults: { functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota" },
  createUserCategory: {
    workspaceId: "foreign",
    selection: {
      kind: "preset",
      presetId: "groceries",
      style: { emoji: "🛒", tone: "primary" },
    },
  },
  restyleUserCategory: {
    workspaceId: "foreign",
    categoryId: "foreign",
    style: { emoji: "🛒", tone: "primary" },
  },
  updateUserCategory: { workspaceId: "foreign", categoryId: "foreign", name: "Changed", style: { emoji: "🛒", tone: "primary" } },
  deleteUserCategory: { workspaceId: "foreign", categoryId: "foreign" },
};
afterEach(() => vi.unstubAllEnvs());

test("every accounting endpoint rejects anonymous callers before accessing data", async () => {
  const root = convexTest(schema, modules);
  const client = root;
  const code = "authentication_required";
  for (const [name, args] of Object.entries(queries)) {
    await expect(
      client.query(
        makeFunctionReference<"query">(`accounting:${name}`),
        args,
      ),
    ).rejects.toMatchObject({ data: { code } });
  }
  for (const [name, args] of Object.entries(actions)) {
    await expect(
      client.action(
        makeFunctionReference<"action">(`accounting:${name}`),
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
  for (const [name, args] of Object.entries(actions))
    await expect(
      t.action(makeFunctionReference<"action">(`accounting:${name}`), {
        ...args,
        userId: "owner-fixture",
      }),
    ).rejects.toThrow();
  await expect(
    t.action(
      makeFunctionReference<"action">("accounting:createPersonalWorkspace"),
      { functionalCurrency: "COP", now: 0 },
    ),
  ).rejects.toThrow();
  expect(await t.run((ctx) => ctx.db.query("workspaces").collect())).toEqual(
    [],
  );
});

test.each([
  undefined, "", "[]", "null", "{}", '"selected-a-fixture"',
  "selected-a-fixture", '["selected-a-fixture",',
  '["selected-a-fixture",null]', '["selected-a-fixture",1]',
  '["selected-a-fixture",""]', '["*"]', '["selected-*"]',
  '[" selected-a-fixture "]', '["SELECTED-A-FIXTURE"]',
])("legacy additions cannot restrict authenticated subjects: %s", async (config) => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", "owner-fixture");
  vi.stubEnv("LUKAPP_ADDITIONAL_CLERK_SUBJECTS", config);
  const root = convexTest(schema, modules);
  for (const subject of ["owner-fixture", "selected-a-fixture", "unlisted-fixture"]) {
    const client = root.withIdentity({ subject, email: "owner-fixture", publicMetadata: { role: "Owner" } });
    expect(await client.query(api.authConnection.connection, {}))
      .toEqual({ status: "owner", clerkSubject: subject });
    await expect(client.query(api.accounting.personalDefaults, {}))
      .rejects.toMatchObject({ data: { code: "session_required" } });
  }
  expect(await root.run((ctx) => ctx.db.query("workspaces").collect())).toEqual([]);
});

test.each([undefined, "", "not-a-clerk-subject"])("legacy Owner config cannot restrict admission: %s", async (owner) => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", owner);
  vi.stubEnv("LUKAPP_ADDITIONAL_CLERK_SUBJECTS", '["selected-a-fixture"]');
  const root = convexTest(schema, modules);
  for (const subject of ["owner-fixture", "selected-a-fixture", "unlisted-fixture"]) {
    const client = root.withIdentity({ subject });
    expect(await client.query(api.authConnection.connection, {}))
      .toEqual({ status: "owner", clerkSubject: subject });
  }
  expect(await root.query(api.authConnection.connection, {})).toEqual({ status: "signed-out" });
});

test("connection returns the actual authenticated subject using the installed client's wire status", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.authConnection.connection, {})).toEqual({ status: "signed-out" });
  for (const subject of ["other-fixture", "owner-fixture"]) {
    expect(await t.withIdentity({ subject }).query(api.authConnection.connection, {}))
      .toEqual({ status: "owner", clerkSubject: subject });
  }
});
