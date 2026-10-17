import { expect, test, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api } from "./_generated/api";
import * as accounting from "./accounting";
import * as accountingWrites from "./accountingWrites";
import * as authorization from "./lib/deviceAuthorization";
import {
  accountingFixture,
  fixtureIdentity,
  groceries,
} from "../src/accounting/convexHarness";
import type { LiveSession } from "./lib/session";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
const style = { emoji: "🛒", tone: "primary" } as const;
function writeArgs(workspaceId = "foreign", profileId = "foreign") {
  return {
    createFinancialAccountProfile: {
      workspaceId,
      name: "Bank",
      productKind: "bankAccount",
    },
    lockAccountingPeriod: { workspaceId, period: { year: 2026, month: 9 } },
    recordCashExpense: groceries(workspaceId, profileId),
    recordCashIncome: {
      ...groceries(workspaceId, profileId),
      idempotencyKey: "income",
    },
    reversePostedEntry: {
      workspaceId,
      journalEntryId: "foreign",
      idempotencyKey: "reverse",
    },
    ensurePersonalDefaults: {
      functionalCurrency: "COP",
      startingMinorUnits: 0,
    },
    createUserCategory: {
      workspaceId,
      selection: { kind: "preset", presetId: "groceries", style },
    },
    restyleUserCategory: { workspaceId, categoryId: "foreign", style },
  };
}
function readArgs(workspaceId: string) {
  return {
    openWorkspace: { workspaceId },
    listFinancialAccountProfiles: { workspaceId },
    listLedgerAccounts: { workspaceId },
    listCatalogAccounts: { workspaceId },
    listJournalEntries: { workspaceId },
    postedHistory: { workspaceId, paginationOpts: { cursor: null, numItems: 50 } },
    postedEntry: { workspaceId, journalEntryId: "foreign" },
    balances: { workspaceId },
    trialBalance: { workspaceId },
    postedActivity: { workspaceId, month: "2026-09" },
    listUserCategories: { workspaceId },
    categoryTotals: { workspaceId, month: "2026-09" },
    personalDefaults: {},
  };
}
async function expectWritesDenied(
  t: Awaited<ReturnType<typeof accountingFixture>>["t"],
  args: ReturnType<typeof writeArgs>,
  code: string,
) {
  for (const [name, payload] of Object.entries(args)) {
    await expect(
      t.action(makeFunctionReference<"action">(`accounting:${name}`), payload),
      name,
    ).rejects.toMatchObject({ data: { code } });
  }
}
async function financialState(
  t: Awaited<ReturnType<typeof accountingFixture>>["t"],
) {
  return t.run(async (ctx) => ({
    workspaces: await ctx.db.query("workspaces").collect(),
    memberships: await ctx.db.query("workspaceMemberships").collect(),
    profiles: await ctx.db.query("financialAccountProfiles").collect(),
    categories: await ctx.db.query("userCategories").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
    defaults: await ctx.db.query("personalDefaults").collect(),
    periods: await ctx.db.query("accountingPeriods").collect(),
    decisions: await ctx.db.query("periodControlDecisions").collect(),
    accounts: await ctx.db.query("ledgerAccounts").collect(),
  }));
}
function observation(
  providerSession: Awaited<
    ReturnType<typeof accountingFixture>
  >["providerSession"],
): LiveSession {
  return {
    userId: providerSession.user_id,
    clerkSessionId: providerSession.id,
    clerkClientId: providerSession.client_id,
    verifiedAt: Date.now(),
    expiresAt: providerSession.expire_at,
    abandonsAt: providerSession.abandon_at,
  };
}

test("the complete accounting write inventory is public actions with only internal mutation handlers", async () => {
  const actions = Object.entries(accounting)
    .filter(([, value]) => "isAction" in value)
    .map(([name]) => name)
    .sort();
  expect(actions).toEqual(
    [...Object.keys(writeArgs()), "createPersonalWorkspace"].sort(),
  );
  expect(
    Object.values(accounting).filter((value) => "isMutation" in value),
  ).toEqual([]);
  expect(
    Object.entries(accountingWrites)
      .map(([name]) => name)
      .sort(),
  ).toEqual(Object.keys(writeArgs()).sort());
  for (const handler of Object.values(accountingWrites))
    expect(handler.isInternal).toBe(true);
  // Inspect every deployed module so a new legacy public mutation cannot escape the inventory.
  const publicMutations: string[] = [];
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", fixtureIdentity.issuer);
  for (const [path, load] of Object.entries(modules)) {
    const loaded: unknown = await load();
    if (!loaded || typeof loaded !== "object") continue;
    for (const [name, value] of Object.entries(loaded)) {
      if (
        value &&
        (typeof value === "object" || typeof value === "function") &&
        "isMutation" in value &&
        "isPublic" in value
      )
        publicMutations.push(`${path}:${name}`);
    }
  }
  expect(publicMutations).toEqual([]);
});

test("raw workspace creation is denied even for the registered live Owner", async () => {
  const { t } = await accountingFixture(modules);
  await expect(
    t.action(api.accounting.createPersonalWorkspace, {
      functionalCurrency: "COP",
    }),
  ).rejects.toMatchObject({ data: { code: "workspace_creation_disabled" } });
  expect((await financialState(t)).workspaces).toEqual([]);
  const first = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
  });
  expect(
    await t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency: "COP",
      startingMinorUnits: 0,
    }),
  ).toEqual(first);
  expect((await financialState(t)).workspaces).toHaveLength(1);
});

test("all actions reject missing, copied, or inactive signed session claims before any write", async () => {
  const { t, root } = await accountingFixture(modules);
  const before = await financialState(t);
  for (const patch of [
    { sid: undefined },
    { issuer: "https://wrong.example" },
    { sts: "pending" },
  ]) {
    const invalid = root.withIdentity({ ...fixtureIdentity, ...patch });
    await expectWritesDenied(invalid, writeArgs(), "session_required");
  }
  expect(await financialState(t)).toEqual(before);
});

for (const state of [
  "revoked",
  "foreign",
  "expired",
  "abandoned",
  "mismatched",
  "offline",
  "malformed",
]) {
  test(`every public write fails closed for live provider ${state}`, async () => {
    const { t, providerSession, transport } = await accountingFixture(modules);
    const before = await financialState(t);
    let code = "session_inactive";
    if (state === "revoked") providerSession.status = "revoked";
    if (state === "foreign") providerSession.user_id = "foreign";
    if (state === "expired") providerSession.expire_at = Date.now();
    if (state === "abandoned") providerSession.abandon_at = Date.now();
    if (state === "mismatched") providerSession.id = "copied-sid";
    if (state === "offline") {
      transport.mockRejectedValue(new Error("offline"));
      code = "provider_unavailable";
    }
    if (state === "malformed") {
      transport.mockResolvedValue(Response.json({ status: "active" }));
      code = "provider_unavailable";
    }
    await expectWritesDenied(t, writeArgs(), code);
    await expect(
      t.action(api.accounting.createPersonalWorkspace, {
        functionalCurrency: "COP",
      }),
    ).rejects.toMatchObject({ data: { code } });
    expect(await financialState(t)).toEqual(before);
  });
}

test("every internal write binds its observation to the current signed identity and rejects stale handoffs", async () => {
  const { t, providerSession } = await accountingFixture(modules);
  const first = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
  });
  const args = writeArgs(first.workspace.id, first.financialAccountProfile.id);
  for (const patch of [
    { verifiedAt: Date.now() - 5001 },
    { userId: "foreign" },
    { clerkSessionId: "copied" },
    { verifiedAt: Date.now() + 100000 },
  ]) {
    for (const [name, payload] of Object.entries(args)) {
      await expect(
        t.mutation(
          makeFunctionReference<"mutation">(`accountingWrites:${name}`),
          {
            ...payload,
            session: { ...observation(providerSession), ...patch },
          },
        ),
        name,
      ).rejects.toMatchObject({
        data: { code: "session_verification_required" },
      });
    }
  }
  expect((await financialState(t)).entries).toEqual([]);
});

test("an unregistered device cannot use any write, including setup bootstrap", async () => {
  const { t, deviceId } = await accountingFixture(modules);
  await t.run((ctx) => ctx.db.delete(deviceId));
  await expectWritesDenied(t, writeArgs(), "device_registration_required");
  for (const [name, payload] of Object.entries({
    ...readArgs("foreign"),
    listCategoryPresets: {},
    suggestCategoryNature: { name: "food" },
  })) {
    await expect(
      t.query(makeFunctionReference<"query">(`accounting:${name}`), payload),
    ).rejects.toMatchObject({ data: { code: "device_registration_required" } });
  }
  expect((await financialState(t)).workspaces).toEqual([]);
});

test("local revocation after live verification wins every action-to-mutation handoff", async () => {
  const { t, deviceId, providerSession, transport } =
    await accountingFixture(modules);
  const first = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
  });
  const before = await financialState(t);
  transport.mockImplementationOnce(async () => {
    await t.run((ctx) => ctx.db.patch(deviceId, { revokedAt: Date.now() }));
    return Response.json(providerSession);
  });
  await expectWritesDenied(
    t,
    writeArgs(first.workspace.id, first.financialAccountProfile.id),
    "device_revoked",
  );
  expect(await financialState(t)).toEqual(before);
  transport.mockClear();
  for (const [name, payload] of Object.entries({
    ...readArgs(first.workspace.id),
    listCategoryPresets: {},
    suggestCategoryNature: { name: "food" },
  })) {
    await expect(
      t.query(makeFunctionReference<"query">(`accounting:${name}`), payload),
    ).rejects.toMatchObject({ data: { code: "device_revoked" } });
  }
  expect(transport).not.toHaveBeenCalled();
});

test("current membership removal after live verification blocks all writes, setup retry, and financial reads", async () => {
  const { t, providerSession, transport } = await accountingFixture(modules);
  const first = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
  });
  transport.mockImplementationOnce(async () => {
    await t.run(async (ctx) => {
      const membership = await ctx.db.query("workspaceMemberships").unique();
      if (!membership) throw new Error("missing fixture membership");
      await ctx.db.delete(membership._id);
    });
    return Response.json(providerSession);
  });
  await expectWritesDenied(
    t,
    writeArgs(first.workspace.id, first.financialAccountProfile.id),
    "membership_required",
  );
  for (const [name, payload] of Object.entries(readArgs(first.workspace.id))) {
    await expect(
      t.query(makeFunctionReference<"query">(`accounting:${name}`), payload),
    ).rejects.toMatchObject({ data: { code: "membership_required" } });
  }
  expect((await financialState(t)).workspaces).toHaveLength(1);
  expect((await financialState(t)).entries).toEqual([]);
  expect((await financialState(t)).categories).toEqual([]);
});

test("changed provider client binding and caller-injected session or actor never authorize a write", async () => {
  const { t, providerSession, transport } = await accountingFixture(modules);
  const first = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
  });
  const args = writeArgs(first.workspace.id, first.financialAccountProfile.id);
  transport.mockClear();
  for (const [name, payload] of Object.entries({
    ...args,
    createPersonalWorkspace: { functionalCurrency: "COP" },
  })) {
    for (const injected of [
      { session: observation(providerSession) },
      { userId: fixtureIdentity.subject },
      { sid: fixtureIdentity.sid },
    ]) {
      await expect(
        t.action(makeFunctionReference<"action">(`accounting:${name}`), {
          ...payload,
          ...injected,
        }),
      ).rejects.toThrow();
    }
  }
  expect(transport).not.toHaveBeenCalled();
  providerSession.client_id = "copied-client";
  await expectWritesDenied(t, args, "device_registration_required");
  expect((await financialState(t)).entries).toEqual([]);
});

test("real action handlers request the exact operation permissions; setup keeps its single transaction", async () => {
  const submission = vi.spyOn(authorization, "requireSubmission");
  const setup = vi.spyOn(authorization, "requirePersonalSetup");
  try {
    const { t } = await accountingFixture(modules);
    const first = await t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency: "COP",
      startingMinorUnits: 1000,
    });
    expect(setup).toHaveBeenCalledOnce();
    const workspaceId = first.workspace.id;
    const profileId = first.financialAccountProfile.id;
    await t.action(api.accounting.createFinancialAccountProfile, {
      workspaceId,
      name: "Bank",
      productKind: "bankAccount",
    });
    const category = await t.action(api.accounting.createUserCategory, {
      workspaceId,
      selection: { kind: "preset", presetId: "groceries", style },
    });
    if (category.kind !== "category")
      throw new Error("missing fixture category");
    await t.action(api.accounting.restyleUserCategory, {
      workspaceId,
      categoryId: category.category.id,
      style: { emoji: "🍎", tone: "positive" },
    });
    const payload = {
      ...groceries(workspaceId, profileId),
      userCategoryId: category.category.id,
    };
    const posted = await t.action(api.accounting.recordCashExpense, payload);
    await t.action(api.accounting.recordCashIncome, {
      ...groceries(workspaceId, profileId),
      idempotencyKey: "income",
    });
    await t.action(api.accounting.reversePostedEntry, {
      workspaceId,
      journalEntryId: posted.id,
      idempotencyKey: "reverse",
    });
    await t.action(api.accounting.lockAccountingPeriod, {
      workspaceId,
      period: { year: 2026, month: 9 },
    });
    expect(submission.mock.calls.map(([, args]) => args.permission)).toEqual([
      "workspace:admin",
      "category:manage",
      "category:manage",
      "accounting:post",
      "accounting:post",
      "accounting:correct",
      "period:lock",
    ]);
    expect(
      submission.mock.calls.every(
        ([, args]) => args.workspaceId === workspaceId,
      ),
    ).toBe(true);
  } finally {
    submission.mockRestore();
    setup.mockRestore();
  }
});

test("normal category expense replay remains exact after transient security failure, and reads need no live provider call", async () => {
  const { t, transport } = await accountingFixture(modules);
  const first = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
  });
  const category = await t.action(api.accounting.createUserCategory, {
    workspaceId: first.workspace.id,
    selection: { kind: "preset", presetId: "groceries", style },
  });
  if (category.kind !== "category") throw new Error("missing fixture category");
  const payload = {
    ...groceries(first.workspace.id, first.financialAccountProfile.id),
    userCategoryId: category.category.id,
  };
  const posted = await t.action(api.accounting.recordCashExpense, payload);
  transport.mockRejectedValueOnce(new Error("response unavailable"));
  await expect(
    t.action(api.accounting.recordCashExpense, payload),
  ).rejects.toMatchObject({ data: { code: "provider_unavailable" } });
  expect(await t.action(api.accounting.recordCashExpense, payload)).toEqual({
    ...posted,
    replay: true,
  });
  transport.mockClear();
  const activity = await t.query(api.accounting.postedActivity, {
    workspaceId: first.workspace.id,
    month: "2026-09",
  });
  expect(activity.rows).toMatchObject([
    { detail: "Food", amount: { minorUnits: -150000 } },
  ]);
  expect(transport).not.toHaveBeenCalled();
  expect((await financialState(t)).entries).toHaveLength(1);
  const another = await t.action(api.accounting.createUserCategory, {
    workspaceId: first.workspace.id,
    selection: { kind: "custom", name: "Unmatched", answer: "spend", style },
  });
  if (another.kind !== "category") throw new Error("missing fixture category");
  await expect(
    t.action(api.accounting.recordCashExpense, {
      ...payload,
      userCategoryId: another.category.id,
    }),
  ).rejects.toMatchObject({
    data: { kind: "accounting", code: "idempotency_key_conflict" },
  });
});
