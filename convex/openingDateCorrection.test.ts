/// <reference types="vite/client" />
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import * as storeModule from "./store";
import {
  convexAccounting,
  createOwnedWorkspace,
  createDaily,
  createProfile,
  groceries,
  caught,
  reader,
  reverse,
  lock,
  ownerIdentity,
} from "../src/accounting/convexHarness";
import type { Doc } from "./_generated/dataModel";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

async function fixture() {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const profile = await createDaily(t, workspace.id);
  const input = {
    workspaceId: workspace.id,
    financialAccountProfileId: profile.id,
    amount: { currency: "COP", minorUnits: 1000 },
    accountingDate: "2026-09-20",
    description: "Start Tracking",
    idempotencyKey: "opening-1",
  };
  const first = await t.mutation(api.accounting.recordOpeningPosition, input);
  if (!first.journalEntry) throw new Error("Expected posted opening");
  return {
    t,
    profile,
    input,
    entry: first.journalEntry,
    read: reader(t, workspace.id),
  };
}

async function snapshot(t: ReturnType<typeof convexAccounting>) {
  return t.run(async (ctx) => ({
    workspaces: await ctx.db.query("workspaces").collect(),
    memberships: await ctx.db.query("workspaceMemberships").collect(),
    owners: await ctx.db.query("personalWorkspaceOwners").collect(),
    profiles: await ctx.db.query("financialAccountProfiles").collect(),
    accounts: await ctx.db.query("ledgerAccounts").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
    openings: await ctx.db.query("openingPositions").collect(),
    periods: await ctx.db.query("accountingPeriods").collect(),
    decisions: await ctx.db.query("periodControlDecisions").collect(),
  }));
}

test.each(["2026-09-18", "2026-09-22"])(
  "replacement at safe date %s preserves receipts, replay, balances, and the new cutover",
  async (accountingDate) => {
    const { t, profile, input, entry, read } = await fixture();
    await t.mutation(
      api.accounting.recordCashExpense,
      groceries(input.workspaceId, profile.id, { amount: 50 }),
    );
    const replacement = {
      ...input,
      accountingDate,
      amount: { currency: "COP", minorUnits: 700 },
      idempotencyKey: "opening-2",
    };
    const active = await snapshot(t);
    expect(
      await caught(t.mutation(api.accounting.recordOpeningPosition, replacement)),
    ).toMatchObject({ data: { code: "opening_already_recorded" } });
    expect(await snapshot(t)).toEqual(active);
    const reversal = await reverse(t, input.workspaceId, entry.id);
    const before = await snapshot(t);
    const corrected = await t.mutation(
      api.accounting.recordOpeningPosition,
      replacement,
    );
    expect(corrected.profile.opening).toEqual({
      status: "posted",
      accountingDate,
      amount: { currency: "COP", minorUnits: 700 },
      idempotencyKey: "opening-2",
      journalEntryId: corrected.journalEntry?.id,
    });
    expect(corrected.journalEntry?.accountingDate).toBe(accountingDate);
    expect((await read.balances())[0]?.balance).toEqual({
      currency: "COP",
      minorUnits: 650,
    });
    const after = await snapshot(t);
    expect(after.entries.slice(0, before.entries.length)).toEqual(before.entries);
    expect(after.lines.slice(0, before.lines.length)).toEqual(before.lines);
    expect(after.openings.slice(0, before.openings.length)).toEqual(before.openings);
    expect(
      await t.mutation(api.accounting.recordOpeningPosition, replacement),
    ).toEqual({
      ...corrected,
      replay: true,
      journalEntry: { ...corrected.journalEntry, replay: true },
    });
    const replay = await t.mutation(api.accounting.recordOpeningPosition, input);
    expect(replay.profile).toEqual(corrected.profile);
    expect(replay.journalEntry).toEqual({
      ...entry,
      replay: true,
      reversedByEntryId: reversal.id,
    });
    expect(
      await caught(t.mutation(api.accounting.recordOpeningPosition, {
        ...input,
        accountingDate,
      })),
    ).toMatchObject({ data: { code: "idempotency_key_conflict" } });
    expect(
      await caught(t.mutation(
        api.accounting.recordCashExpense,
        groceries(input.workspaceId, profile.id, {
          accountingDate: "2026-09-17",
          idempotencyKey: "too-early",
        }),
      )),
    ).toMatchObject({ data: { code: "activity_before_opening" } });
    expect(await snapshot(t)).toEqual(after);
    await t.mutation(
      api.accounting.recordCashExpense,
      groceries(input.workspaceId, profile.id, {
        accountingDate,
        amount: 10,
        idempotencyKey: "at-cutover",
      }),
    );
    expect((await read.balances())[0]?.balance.minorUnits).toBe(640);
  },
);

test.each(["cash", "transfer-destination", "transfer-source"])(
  "cutover retains reversed ordinary %s history and rolls back the rejected correction",
  async (kind) => {
    const { t, profile, input, entry } = await fixture();
    const other = await createProfile(
      t, input.workspaceId, "Other", "creditCard",
    );
    const activity =
      kind === "cash"
        ? await t.mutation(
            api.accounting.recordCashExpense,
            groceries(input.workspaceId, profile.id, {
              amount: 50,
              accountingDate: "2026-09-21",
            }),
          )
        : await t.mutation(api.accounting.recordAccountTransfer, {
            workspaceId: input.workspaceId,
            sourceFinancialAccountProfileId:
              kind === "transfer-source" ? profile.id : other.id,
            destinationFinancialAccountProfileId:
              kind === "transfer-source" ? other.id : profile.id,
            amount: { currency: "COP", minorUnits: 50 },
            accountingDate: "2026-09-21",
            description: "Ordinary transfer",
            idempotencyKey: "transfer",
          });
    await reverse(t, input.workspaceId, activity.id, {
      accountingDate: "2026-09-24",
    });
    await reverse(t, input.workspaceId, entry.id);
    const before = await snapshot(t);
    for (const minorUnits of [0, 700]) {
      expect(
        await caught(t.mutation(api.accounting.recordOpeningPosition, {
          ...input,
          accountingDate: "2026-09-22",
          amount: { currency: "COP", minorUnits },
          idempotencyKey: "opening-2",
        })),
      ).toMatchObject({ data: { code: "activity_before_opening" } });
      expect(await snapshot(t)).toEqual(before);
    }
    const corrected = await t.mutation(api.accounting.recordOpeningPosition, {
      ...input,
      accountingDate: "2026-09-21",
      idempotencyKey: "opening-2",
    });
    expect(corrected.profile.opening).toMatchObject({
      accountingDate: "2026-09-21",
    });
    const entries = await t.query(api.accounting.listJournalEntries, {
      workspaceId: input.workspaceId,
      financialAccountProfileId: profile.id,
    });
    expect(entries.map((item) => item.id)).toContain(activity.id);
    expect(entries).toHaveLength(5);
  },
);

test("successive corrections ignore every retired opening pair while unrelated profile history remains independent", async () => {
  const { t, input, entry, read } = await fixture();
  const other = await createDaily(t, input.workspaceId);
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(input.workspaceId, other.id, {
      accountingDate: "2026-09-01",
      idempotencyKey: "other-history",
    }),
  );
  let activeId = entry.id;
  const dates = ["2026-09-22", "2026-09-18", "2026-09-25"];
  for (const [index, accountingDate] of dates.entries()) {
    await reverse(t, input.workspaceId, activeId);
    const replacement = await t.mutation(api.accounting.recordOpeningPosition, {
      ...input,
      accountingDate,
      amount: { currency: "COP", minorUnits: 700 },
      idempotencyKey: `opening-${index + 2}`,
    });
    if (!replacement.journalEntry) throw new Error("Expected posted replacement");
    activeId = replacement.journalEntry.id;
    expect(replacement.profile.opening).toMatchObject({ accountingDate });
  }
  const entries = await read.entries();
  expect(entries).toHaveLength(8);
  expect(
    entries
      .filter((item) =>
        item.policy === "opening-position@1" && !item.reversedByEntryId,
      )
      .map((item) => item.id),
  ).toEqual([activeId]);
  expect(
    (await read.balances()).find((item) =>
      item.financialAccountProfileId === input.financialAccountProfileId,
    )?.balance.minorUnits,
  ).toBe(700);
  expect((await snapshot(t)).openings).toHaveLength(4);
  const replay = await t.mutation(api.accounting.recordOpeningPosition, input);
  expect(replay.profile.opening).toMatchObject({ accountingDate: "2026-09-25" });
  expect(replay.journalEntry?.id).toBe(entry.id);
});

test("locked original reverses into the next open period and permits an open-period replacement", async () => {
  const { t, input, entry } = await fixture();
  await lock(t, input.workspaceId, { year: 2026, month: 9 });
  const reversal = await reverse(t, input.workspaceId, entry.id);
  expect(reversal.accountingDate).toBe("2026-10-01");
  const before = await snapshot(t);
  for (const minorUnits of [0, 700]) {
    expect(
      await caught(t.mutation(api.accounting.recordOpeningPosition, {
        ...input,
        accountingDate: "2026-09-18",
        amount: { currency: "COP", minorUnits },
        idempotencyKey: "opening-2",
      })),
    ).toMatchObject({ data: { code: "locked_period" } });
    expect(await snapshot(t)).toEqual(before);
  }
  const corrected = await t.mutation(api.accounting.recordOpeningPosition, {
    ...input,
    accountingDate: "2026-10-02",
    idempotencyKey: "opening-2",
  });
  expect(corrected.journalEntry?.accountingPeriod).toEqual({
    year: 2026, month: 10, status: "open",
  });
  const replay = await t.mutation(api.accounting.recordOpeningPosition, input);
  expect(replay.profile).toEqual(corrected.profile);
  expect(replay.journalEntry?.accountingPeriod.status).toBe("locked");
  expect(replay.journalEntry?.reversedByEntryId).toBe(reversal.id);
});

test("replacement retains membership and authenticated Owner authority before clearing the old snapshot", async () => {
  const { t, input, entry } = await fixture();
  await reverse(t, input.workspaceId, entry.id);
  const replacement = {
    ...input,
    accountingDate: "2026-09-18",
    idempotencyKey: "opening-2",
  };
  const membership = await t.run((ctx) =>
    ctx.db.query("workspaceMemberships").unique(),
  );
  if (!membership) throw new Error("Expected membership");
  for (const role of [
    "Viewer", "Preparer",
  ] satisfies Doc<"workspaceMemberships">["role"][]) {
    await t.run((ctx) => ctx.db.patch(membership._id, { role }));
    const before = await snapshot(t);
    expect(
      await caught(t.mutation(api.accounting.recordOpeningPosition, replacement)),
    ).toMatchObject({ data: { code: "workspace_permission_required" } });
    expect(await snapshot(t)).toEqual(before);
  }
  const before = await snapshot(t);
  expect(
    await caught(t.withIdentity({
      ...ownerIdentity,
      subject: "someone-else",
      tokenIdentifier: ownerIdentity.issuer + "|someone-else",
    }).mutation(api.accounting.recordOpeningPosition, replacement)),
  ).toMatchObject({ data: { code: "owner_not_allowed" } });
  expect(await snapshot(t)).toEqual(before);
});

test.each([
  { failure: "post", minorUnits: 1000 },
  { failure: "receipt", minorUnits: 1000 },
  { failure: "receipt", minorUnits: 0 },
])(
  "authenticated replacement of $minorUnits rolls back all writes after an injected $failure failure",
  async ({ failure, minorUnits }) => {
    const { t, input, entry } = await fixture();
    await reverse(t, input.workspaceId, entry.id);
    const replacement = {
      ...input,
      accountingDate: "2026-10-02",
      amount: { currency: "COP", minorUnits },
      idempotencyKey: "opening-2",
    };
    const before = await snapshot(t);
    const realStore = storeModule.convexStore;
    let observedClearedSnapshot = false;
    let observedNewEntry = false;
    let observedNewReceipt = false;
    const injection = vi.spyOn(storeModule, "convexStore").mockImplementation(
      (db) => {
        const store = realStore(db);
        return {
          ...store,
          clearProfileOpening: async (profileId) => {
            await store.clearProfileOpening(profileId);
            observedClearedSnapshot =
              (await store.getProfile(profileId))?.opening === undefined;
          },
          insertJournalEntry: async (draft) => {
            const posted = await store.insertJournalEntry(draft);
            observedNewEntry =
              (await store.getJournalEntry(posted.id)) !== undefined;
            if (failure === "post") throw new Error("Injected post failure");
            return posted;
          },
          saveOpeningPosition: async (position) => {
            await store.saveOpeningPosition(position);
            observedNewReceipt =
              (await store.findOpeningPositionByKey(
                input.workspaceId, replacement.idempotencyKey,
              )) !== undefined;
            throw new Error("Injected receipt failure");
          },
        };
      },
    );
    try {
      expect(
        await caught(t.mutation(api.accounting.recordOpeningPosition, replacement)),
      ).toMatchObject({ message: `Injected ${failure} failure` });
    } finally {
      injection.mockRestore();
    }
    expect(observedClearedSnapshot).toBe(true);
    expect(observedNewEntry).toBe(minorUnits > 0);
    expect(observedNewReceipt).toBe(failure === "receipt");
    expect(await snapshot(t)).toEqual(before);
    const retry = await t.mutation(api.accounting.recordOpeningPosition, replacement);
    expect(retry.replay).toBe(false);
    expect(retry.profile.opening).toMatchObject({ accountingDate: "2026-10-02" });
    expect((await snapshot(t)).entries).toHaveLength(minorUnits === 0 ? 2 : 3);
    expect((await snapshot(t)).openings).toHaveLength(2);
  },
);
