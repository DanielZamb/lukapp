/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import * as accounting from "./accounting";
import {
  caught,
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  groceries,
  owner,
  ownerIdentity,
  septNow,
} from "../src/accounting/convexHarness";
import { postJournalEntry } from "../src/accounting/posting";
import { convexStore } from "./store";
import {
  workspaceRolePolicy,
  hasWorkspacePermission,
} from "../src/accounting/membership";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
afterEach(() => vi.unstubAllEnvs());

const bootstrap = { functionalCurrency: "COP", now: septNow };

test("anonymous reads and bootstrap require authentication", async () => {
  convexAccounting(modules);
  const t = convexTest(schema, modules);
  expect(
    await caught(t.query(api.accounting.personalWorkspace, { now: septNow })),
  ).toMatchObject({ data: { code: "authentication_required" } });
  expect(
    await caught(t.mutation(api.accounting.createPersonalWorkspace, bootstrap)),
  ).toMatchObject({ data: { code: "authentication_required" } });
});

test("other subjects and issuers cannot read or provision accounting", async () => {
  const ownerTest = convexAccounting(modules);
  for (const identity of [
    { ...ownerIdentity, subject: "user_other", tokenIdentifier: "other" },
    {
      ...ownerIdentity,
      issuer: "https://other.clerk.accounts.dev",
      tokenIdentifier: "foreign",
    },
  ]) {
    const t = ownerTest.withIdentity(identity);
    expect(
      await caught(t.query(api.accounting.personalWorkspace, { now: septNow })),
    ).toMatchObject({ data: { code: "owner_not_allowed" } });
    expect(
      await caught(
        t.mutation(api.accounting.createPersonalWorkspace, bootstrap),
      ),
    ).toMatchObject({ data: { code: "owner_not_allowed" } });
  }
  expect(
    await ownerTest.run((ctx) => ctx.db.query("workspaces").collect()),
  ).toEqual([]);
});

test.each(["LUKAPP_OWNER_CLERK_SUBJECT", "CLERK_JWT_ISSUER_DOMAIN"])(
  "missing %s fails closed",
  async (name) => {
    const t = convexAccounting(modules);
    vi.stubEnv(name, undefined);
    expect(
      await caught(t.query(api.accounting.personalWorkspace, { now: septNow })),
    ).toMatchObject({ data: { code: "owner_configuration_required" } });
    expect(
      await caught(
        t.mutation(api.accounting.createPersonalWorkspace, bootstrap),
      ),
    ).toMatchObject({ data: { code: "owner_configuration_required" } });
  },
);

test("first login discovers provisioning state and concurrent retries return one Workspace", async () => {
  const t = convexAccounting(modules);
  expect(
    await t.query(api.accounting.personalWorkspace, { now: septNow }),
  ).toEqual({ status: "provisioning-required" });
  const first = await Promise.all(
    Array.from({ length: 4 }, () =>
      t
        .withIdentity(ownerIdentity)
        .mutation(api.accounting.createPersonalWorkspace, bootstrap),
    ),
  );
  expect(new Set(first.map((workspace) => workspace.id)).size).toBe(1);
  const workspace = first[0];
  if (!workspace) throw new Error("bootstrap returned no Workspace");
  expect(
    await t.mutation(api.accounting.createPersonalWorkspace, bootstrap),
  ).toEqual(workspace);
  expect(
    await t.query(api.accounting.personalWorkspace, { now: septNow }),
  ).toEqual({ status: "ready", workspace });
  const records = await t.run(async (ctx) => ({
    workspaces: await ctx.db.query("workspaces").collect(),
    memberships: await ctx.db.query("workspaceMemberships").collect(),
    identities: await ctx.db.query("personalWorkspaceOwners").collect(),
    accounts: await ctx.db.query("ledgerAccounts").collect(),
    periods: await ctx.db.query("accountingPeriods").collect(),
  }));
  expect(records.workspaces).toHaveLength(1);
  expect(records.memberships).toMatchObject([
    { workspaceId: workspace.id, userId: owner.userId, role: "Owner" },
  ]);
  expect(records.identities).toMatchObject([
    { ...ownerIdentity, workspaceId: workspace.id },
  ]);
  expect(records.accounts).toHaveLength(3);
  expect(records.periods).toHaveLength(1);
});

test("a changed first-login currency does not create or alter a Workspace", async () => {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  expect(
    await caught(
      t.mutation(api.accounting.createPersonalWorkspace, {
        ...bootstrap,
        functionalCurrency: "USD",
      }),
    ),
  ).toMatchObject({
    data: { code: "personal_workspace_configuration_conflict" },
  });
  expect(
    await t.query(api.accounting.personalWorkspace, { now: septNow }),
  ).toEqual({ status: "ready", workspace });
});

test("missing membership denies reads, writes, discovery and bootstrap instead of repairing access", async () => {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  await t.run(async (ctx) => {
    const membership = await ctx.db.query("workspaceMemberships").unique();
    if (!membership) throw new Error("missing test membership");
    await ctx.db.delete(membership._id);
  });
  for (const operation of [
    t.query(api.accounting.balances, { workspaceId: workspace.id }),
    t.query(api.accounting.personalWorkspace, { now: septNow }),
    t.mutation(api.accounting.createFinancialAccountProfile, {
      workspaceId: workspace.id,
      name: "Bank",
      productKind: "bankAccount",
    }),
    t.mutation(api.accounting.createPersonalWorkspace, bootstrap),
  ].map(caught))
    expect(await operation).toMatchObject({
      data: { code: "workspace_membership_required" },
    });
  expect(
    await t.run((ctx) => ctx.db.query("workspaceMemberships").collect()),
  ).toEqual([]);
});

test("legacy subject or arbitrary membership IDs grant no authority", async () => {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  await t.run(async (ctx) => {
    const membership = await ctx.db.query("workspaceMemberships").unique();
    if (!membership) throw new Error("missing test membership");
    await ctx.db.patch(membership._id, { userId: ownerIdentity.subject });
  });
  expect(
    await caught(
      t.query(api.accounting.balances, { workspaceId: workspace.id }),
    ),
  ).toMatchObject({ data: { code: "workspace_membership_required" } });
});

test("Preparer can prepare a profile but cannot post, lock, correct or regain Owner via bootstrap", async () => {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const posted = await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );
  await t.run(async (ctx) => {
    const membership = await ctx.db.query("workspaceMemberships").unique();
    if (!membership) throw new Error("missing test membership");
    await ctx.db.patch(membership._id, { role: "Preparer" });
  });
  expect(
    await t.mutation(api.accounting.createFinancialAccountProfile, {
      workspaceId: workspace.id,
      name: "Wallet",
      productKind: "cash",
    }),
  ).toMatchObject({ name: "Wallet" });
  expect(
    await t.query(api.accounting.listJournalEntries, {
      workspaceId: workspace.id,
    }),
  ).toHaveLength(1);
  for (const operation of [
    t.mutation(
      api.accounting.recordCashExpense,
      groceries(workspace.id, daily.id, { idempotencyKey: "denied" }),
    ),
    t.mutation(api.accounting.lockAccountingPeriod, {
      workspaceId: workspace.id,
      period: { year: 2026, month: 9 },
    }),
    t.mutation(api.accounting.reversePostedEntry, {
      workspaceId: workspace.id,
      journalEntryId: posted.id,
      idempotencyKey: "reverse",
    }),
    t.mutation(api.accounting.createPersonalWorkspace, bootstrap),
    t.query(api.accounting.personalWorkspace, { now: septNow }),
  ].map(caught)) {
    expect(await operation).toMatchObject({
      data: { code: "workspace_permission_required" },
    });
  }
  const direct = await caught(
    t.run((ctx) =>
      postJournalEntry(
        convexStore(ctx.db),
        { now: () => new Date(septNow) },
        {
          actor: owner,
          workspaceId: workspace.id,
          draft: {
            accountingDate: "2026-09-24",
            description: "denied",
            idempotencyKey: "direct",
            policy: "cash-expense@1",
            lines: [],
          },
        },
      ),
    ),
  );
  expect(direct).toMatchObject({ code: "workspace_permission_required" });
  expect(
    await t.run((ctx) => ctx.db.query("journalEntries").collect()),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.query("periodControlDecisions").collect()),
  ).toEqual([]);
});

test("ledger and period decisions preserve the authenticated actor", async () => {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const entry = await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );
  await t.mutation(api.accounting.lockAccountingPeriod, {
    workspaceId: workspace.id,
    period: { year: 2026, month: 9 },
  });
  expect(entry.postedBy).toBe(ownerIdentity.tokenIdentifier);
  expect(
    await t.run((ctx) => ctx.db.query("journalEntries").unique()),
  ).toMatchObject({ postedBy: ownerIdentity.tokenIdentifier });
  expect(
    await t.run((ctx) => ctx.db.query("periodControlDecisions").unique()),
  ).toMatchObject({ decidedBy: ownerIdentity.tokenIdentifier });
});

test("role presets give preparation and posting separate authority", () => {
  expect(workspaceRolePolicy).toEqual({
    Owner: [
      "view",
      "prepare",
      "post",
      "correct",
      "managePeriods",
      "administerMembership",
    ],
    Accountant: ["view", "prepare", "post", "correct", "managePeriods"],
    Preparer: ["view", "prepare"],
    Viewer: ["view"],
  });
  expect(hasWorkspacePermission("Preparer", "post")).toBe(false);
  expect(hasWorkspacePermission("Viewer", "prepare")).toBe(false);
});

test("a forged userId argument is rejected by the public API validator", async () => {
  const t = convexAccounting(modules);
  const forged = { ...bootstrap, userId: "synthetic-owner" };
  await expect(
    t.mutation(api.accounting.createPersonalWorkspace, forged),
  ).rejects.toThrow();
  expect(await t.run((ctx) => ctx.db.query("workspaces").collect())).toEqual(
    [],
  );
});

const protectedQueries = [
  api.accounting.openWorkspace,
  api.accounting.listFinancialAccountProfiles,
  api.accounting.listLedgerAccounts,
  api.accounting.listCatalogAccounts,
  api.accounting.listJournalEntries,
  api.accounting.balances,
  api.accounting.trialBalance,
];

test("every accounting read rejects anonymous and disallowed authenticated callers", async () => {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  for (const { reader, code } of [
    { reader: convexTest(schema, modules), code: "authentication_required" },
    {
      reader: t.withIdentity({ ...ownerIdentity, subject: "user_other" }),
      code: "owner_not_allowed",
    },
  ]) {
    for (const query of protectedQueries) {
      const args =
        getFunctionName(query) === "accounting:openWorkspace"
          ? { workspaceId: workspace.id, now: septNow }
          : { workspaceId: workspace.id };
      expect(await caught(reader.query(query, args))).toMatchObject({
        data: { code: code },
      });
    }
  }
});

test("every accounting write rejects anonymous and disallowed authenticated callers", async () => {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const activity = groceries(workspace.id, daily.id);
  for (const { caller, code } of [
    { caller: convexTest(schema, modules), code: "authentication_required" },
    {
      caller: t.withIdentity({ ...ownerIdentity, subject: "user_other" }),
      code: "owner_not_allowed",
    },
  ]) {
    const writes = [
      () => caller.mutation(api.accounting.createPersonalWorkspace, bootstrap),
      () =>
        caller.mutation(api.accounting.createFinancialAccountProfile, {
          workspaceId: workspace.id,
          name: "Denied",
          productKind: "bankAccount",
        }),
      () => caller.mutation(api.accounting.recordCashExpense, activity),
      () => caller.mutation(api.accounting.recordCashIncome, activity),
      () =>
        caller.mutation(api.accounting.lockAccountingPeriod, {
          workspaceId: workspace.id,
          period: { year: 2026, month: 9 },
        }),
      () =>
        caller.mutation(api.accounting.reversePostedEntry, {
          workspaceId: workspace.id,
          journalEntryId: "not-an-entry",
          idempotencyKey: "denied",
        }),
    ];
    for (const write of writes)
      expect(await caught(write())).toMatchObject({ data: { code } });
  }
  expect(
    await t.run((ctx) => ctx.db.query("journalEntries").collect()),
  ).toEqual([]);
});

test("every public accounting validator excludes client actor claims", () => {
  for (const endpoint of Object.values(accounting)) {
    if (
      !("exportArgs" in endpoint) ||
      typeof endpoint.exportArgs !== "function"
    ) {
      throw new Error("Convex endpoint has no runtime argument validator");
    }
    expect(endpoint.exportArgs()).not.toContain('"userId"');
    expect(endpoint.exportArgs()).not.toContain('"actor"');
    expect(endpoint.exportArgs()).toContain('"access"');
  }
});

test("Convex ID normalization denies malformed and wrong-table IDs on the store path", async () => {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const ids = await t.run(async (ctx) => ({
    malformed: ctx.db.normalizeId("workspaces", "not-a-convex-id"),
    wrongTable: ctx.db.normalizeId("workspaces", daily.id),
    workspace: ctx.db.normalizeId("workspaces", workspace.id),
    wrongWorkspace: await convexStore(ctx.db).getWorkspace(daily.id),
    malformedWorkspace: await convexStore(ctx.db).getWorkspace(
      "not-a-convex-id",
    ),
  }));
  expect(ids).toEqual({
    malformed: null,
    wrongTable: null,
    workspace: workspace.id,
    wrongWorkspace: undefined,
    malformedWorkspace: undefined,
  });
  expect(
    await caught(t.query(api.accounting.balances, { workspaceId: daily.id })),
  ).toMatchObject({ data: { code: "workspace_membership_required" } });
});
