/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  createOwnedWorkspace,
  createDaily,
  groceries,
  caught,
  reader,
  lock,
  owner,
  ownerIdentity,
  reverse,
} from "../src/accounting/convexHarness";
import { createAccountingCore } from "../src/accounting/core";
import { convexStore } from "./store";
import { convexTest } from "convex-test";
import schema from "./schema";
import type { Doc } from "./_generated/dataModel";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

async function fixture() {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const input = {
    workspaceId: workspace.id,
    name: "Daily",
    productKind: "bankAccount" as const,
    amount: { currency: "COP", minorUnits: 1000 },
    accountingDate: "2026-09-20",
    description: "Start Tracking",
    idempotencyKey: "setup-1",
  };
  return { t, workspace, input, read: reader(t, workspace.id) };
}

function openingArgs(input: Awaited<ReturnType<typeof fixture>>["input"]) {
  const { name, productKind, ...args } = input;
  return args;
}

async function snapshot(t: ReturnType<typeof convexAccounting>) {
  return t.run(async (ctx) => ({
    profiles: await ctx.db.query("financialAccountProfiles").collect(),
    accounts: await ctx.db.query("ledgerAccounts").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
    openings: await ctx.db.query("openingPositions").collect(),
    periods: await ctx.db.query("accountingPeriods").collect(),
  }));
}

test.each([0, 1000])(
  "setup with opening %s retries after a lost response without duplicate profile, account, or opening",
  async (minorUnits) => {
    const { t, input } = await fixture();
    const args = { ...input, amount: { currency: "COP", minorUnits } };
    const first = await t.mutation(api.accounting.setupFinancialAccount, args);
    const again = await t.mutation(api.accounting.setupFinancialAccount, args);
    expect(again).toEqual({
      ...first,
      replay: true,
      journalEntry: first.journalEntry
        ? { ...first.journalEntry, replay: true }
        : null,
    });
    const state = await snapshot(t);
    expect(state.profiles).toHaveLength(1);
    expect(state.accounts).toHaveLength(4);
    expect(state.openings).toHaveLength(1);
    expect(state.entries).toHaveLength(minorUnits === 0 ? 0 : 1);
    expect(state.lines).toHaveLength(minorUnits === 0 ? 0 : 2);
    expect(state.profiles[0]?.opening?.accountingDate).toBe("2026-09-20");
  },
);

test("parallel authenticated setup callers converge on one profile and opening locally", async () => {
  const { t, input } = await fixture();
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      t.mutation(api.accounting.setupFinancialAccount, input),
    ),
  );
  expect(new Set(results.map((result) => result.profile.id)).size).toBe(1);
  expect(new Set(results.map((result) => result.journalEntry?.id)).size).toBe(
    1,
  );
  expect(results.filter((result) => !result.replay)).toHaveLength(1);
  const state = await snapshot(t);
  expect(state.profiles).toHaveLength(1);
  expect(state.openings).toHaveLength(1);
  expect(state.entries).toHaveLength(1);
  expect(state.lines).toHaveLength(2);
});

test("a failed opening rolls back its newly created profile and auxiliary account", async () => {
  const { t, input } = await fixture();
  const before = await snapshot(t);
  const attempts = [
    {
      args: { ...input, amount: { currency: "COP", minorUnits: -1 } },
      code: "opening_amount_invalid",
    },
    {
      args: { ...input, amount: { currency: "USD", minorUnits: 1000 } },
      code: "currency_mismatch",
    },
    {
      args: { ...input, accountingDate: "2026-02-30" },
      code: "accounting_date_required",
    },
    {
      args: { ...input, idempotencyKey: "" },
      code: "idempotency_key_required",
    },
    { args: { ...input, name: "  " }, code: "name_required" },
  ];
  for (const attempt of attempts) {
    expect(
      await caught(
        t.mutation(api.accounting.setupFinancialAccount, attempt.args),
      ),
    ).toMatchObject({ data: { code: attempt.code } });
    expect(await snapshot(t)).toEqual(before);
  }
  const result = await t.mutation(api.accounting.setupFinancialAccount, input);
  expect(result.profile.ledgerAccountId).toBe(
    (await snapshot(t)).profiles[0]?.postingAccountId,
  );
  expect(
    (await snapshot(t)).accounts.find(
      (account) => account._id === result.profile.ledgerAccountId,
    )?.code,
  ).toBe("11100501");
});

test.each([0, 1000])(
  "setup opening %s in a locked period creates no orphan or ledger effect",
  async (minorUnits) => {
    const { t, input } = await fixture();
    await lock(t, input.workspaceId, { year: 2026, month: 9 });
    const before = await snapshot(t);
    expect(
      await caught(
        t.mutation(api.accounting.setupFinancialAccount, {
          ...input,
          amount: { currency: "COP", minorUnits },
        }),
      ),
    ).toMatchObject({ data: { code: "locked_period" } });
    expect(await snapshot(t)).toEqual(before);
  },
);

test("setup retry checks every original input and replays through a locked period", async () => {
  const { t, input } = await fixture();
  const first = await t.mutation(api.accounting.setupFinancialAccount, input);
  const before = await snapshot(t);
  for (const changed of [
    { name: "Different" },
    { productKind: "loan" as const },
    { amount: { currency: "COP", minorUnits: 10 } },
    { description: "Different" },
    { accountingDate: "2026-09-21" },
  ]) {
    expect(
      await caught(
        t.mutation(api.accounting.setupFinancialAccount, {
          ...input,
          ...changed,
        }),
      ),
    ).toMatchObject({ data: { code: "idempotency_key_conflict" } });
    expect(await snapshot(t)).toEqual(before);
  }
  await lock(t, input.workspaceId, { year: 2026, month: 9 });
  const replay = await t.mutation(api.accounting.setupFinancialAccount, input);
  expect(replay.profile.id).toBe(first.profile.id);
  expect(replay.journalEntry?.accountingPeriod.status).toBe("locked");
  expect(replay.replay).toBe(true);
});

test("setup cannot reuse another command's zero-opening or journal key", async () => {
  for (const zero of [true, false]) {
    const { t, input } = await fixture();
    const profile = await createDaily(t, input.workspaceId);
    if (zero) {
      await t.mutation(api.accounting.recordOpeningPosition, {
        ...openingArgs(input),
        financialAccountProfileId: profile.id,
        amount: { currency: "COP", minorUnits: 0 },
      });
    } else {
      await t.mutation(
        api.accounting.recordCashExpense,
        groceries(input.workspaceId, profile.id, {
          idempotencyKey: input.idempotencyKey,
        }),
      );
    }
    const before = await snapshot(t);
    expect(
      await caught(t.mutation(api.accounting.setupFinancialAccount, input)),
    ).toMatchObject({ data: { code: "idempotency_key_conflict" } });
    expect(await snapshot(t)).toEqual(before);
  }
});

test("different setup keys create distinct real products even with identical names", async () => {
  const { t, input } = await fixture();
  const first = await t.mutation(api.accounting.setupFinancialAccount, input);
  const second = await t.mutation(api.accounting.setupFinancialAccount, {
    ...input,
    idempotencyKey: "setup-2",
  });
  expect(second.profile.id).not.toBe(first.profile.id);
  expect(second.profile.ledgerAccountId).not.toBe(
    first.profile.ledgerAccountId,
  );
  expect((await snapshot(t)).profiles).toHaveLength(2);
});

test("setup and new accounting commands retain authenticated membership and role controls", async () => {
  const { t, input } = await fixture();
  const first = await t.mutation(api.accounting.setupFinancialAccount, input);
  const membership = await t.run((ctx) =>
    ctx.db.query("workspaceMemberships").unique(),
  );
  if (!membership) throw new Error("Expected membership");
  for (const role of [
    "Viewer",
    "Preparer",
  ] satisfies Doc<"workspaceMemberships">["role"][]) {
    await t.run((ctx) => ctx.db.patch(membership._id, { role }));
    for (const work of [
      () =>
        t.mutation(api.accounting.setupFinancialAccount, {
          ...input,
          idempotencyKey: "new-setup",
        }),
      () =>
        t.mutation(api.accounting.recordOpeningPosition, {
          ...openingArgs(input),
          financialAccountProfileId: first.profile.id,
        }),
      () =>
        t.mutation(api.accounting.recordAccountTransfer, {
          ...openingArgs(input),
          sourceFinancialAccountProfileId: first.profile.id,
          destinationFinancialAccountProfileId: "missing",
        }),
    ])
      expect(await caught(work())).toMatchObject({
        data: { code: "workspace_permission_required" },
      });
  }
  await t.run((ctx) => ctx.db.delete(membership._id));
  expect(
    await caught(t.mutation(api.accounting.setupFinancialAccount, input)),
  ).toMatchObject({ data: { code: "workspace_membership_required" } });
  const signedOut = convexTest(schema, modules);
  expect(
    await caught(
      signedOut.mutation(api.accounting.setupFinancialAccount, input),
    ),
  ).toMatchObject({ data: { code: "authentication_required" } });
  expect(
    await caught(
      signedOut
        .withIdentity({
          ...ownerIdentity,
          subject: "someone-else",
          tokenIdentifier: ownerIdentity.issuer + "|someone-else",
        })
        .mutation(api.accounting.recordOpeningPosition, {
          ...openingArgs(input),
          financialAccountProfileId: first.profile.id,
        }),
    ),
  ).toMatchObject({ data: { code: "owner_not_allowed" } });
});

test("core setup writes a profile and opening through the actual AccountingCore interface", async () => {
  const { t, input } = await fixture();
  const result = await t.run((ctx) =>
    createAccountingCore(convexStore(ctx.db), {
      now: () => new Date(321),
    }).setupFinancialAccount({ ...input, actor: owner }),
  );
  expect(result.journalEntry?.postedAt).toBe(321);
  expect(result.profile.opening.status).toBe("posted");
  expect((await snapshot(t)).lines).toHaveLength(2);
});

test("setup replay after correction returns the current profile and its original immutable opening receipt", async () => {
  const { t, input } = await fixture();
  const first = await t.mutation(api.accounting.setupFinancialAccount, input);
  if (!first.journalEntry) throw new Error("Expected opening");
  const reversal = await reverse(t, input.workspaceId, first.journalEntry.id);
  const corrected = await t.mutation(api.accounting.recordOpeningPosition, {
    ...openingArgs(input),
    financialAccountProfileId: first.profile.id,
    idempotencyKey: "correct-opening",
    accountingDate: "2026-09-18",
    amount: { currency: "COP", minorUnits: 800 },
  });
  const replay = await t.mutation(api.accounting.setupFinancialAccount, input);
  expect(replay.profile).toEqual(corrected.profile);
  expect(replay.journalEntry?.id).toBe(first.journalEntry.id);
  expect(replay.journalEntry?.reversedByEntryId).toBe(reversal.id);
  expect((await snapshot(t)).profiles).toHaveLength(1);
});

test("transaction rollback also removes a successfully posted opening when its receipt write fails", async () => {
  const { t, input } = await fixture();
  const before = await snapshot(t);
  const result = await caught(
    t.run((ctx) => {
      const store = convexStore(ctx.db);
      return createAccountingCore({
        ...store,
        saveOpeningPosition: async () => {
          throw new Error("Injected opening receipt storage failure");
        },
      }).setupFinancialAccount({ ...input, actor: owner });
    }),
  );
  expect(result).toMatchObject({
    message: "Injected opening receipt storage failure",
  });
  expect(await snapshot(t)).toEqual(before);
  const retry = await t.mutation(api.accounting.setupFinancialAccount, input);
  expect(retry.replay).toBe(false);
  expect((await snapshot(t)).profiles).toHaveLength(1);
  expect((await snapshot(t)).entries).toHaveLength(1);
});
