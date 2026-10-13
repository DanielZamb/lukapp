/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  createAdditionalWorkspaceFixture,
  createProfile,
  caught,
  reader,
  reverse,
  lock,
  groceries,
  owner,
} from "../src/accounting/convexHarness";
import { createAccountingCore } from "../src/accounting/core";
import { convexStore } from "./store";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

async function fixture(
  productKind: "bankAccount" | "creditCard" | "loan" = "bankAccount",
  template = "co-puc-personal@1",
) {
  const t = convexAccounting(modules);
  const workspace = await t.mutation(api.accounting.createPersonalWorkspace, {
    functionalCurrency: "COP",
    chartOfAccountsTemplate: template,
    now: Date.UTC(2026, 8, 24),
  });
  const profile = await createProfile(
    t,
    workspace.id,
    "Opening account",
    productKind,
  );
  const input = {
    workspaceId: workspace.id,
    financialAccountProfileId: profile.id,
    amount: { currency: "COP", minorUnits: 1000 },
    accountingDate: "2026-09-20",
    description: "Start Tracking",
    idempotencyKey: "opening-1",
  };
  return { t, workspace, profile, input, read: reader(t, workspace.id) };
}

test.each(["co-puc-personal@1", "us-gaap-personal@1"])(
  "%s opens held assets and owed liabilities on their normal sides",
  async (template) => {
    for (const productKind of ["bankAccount", "creditCard", "loan"] as const) {
      const { t, input, profile, read } = await fixture(productKind, template);
      const result = await t.mutation(
        api.accounting.recordOpeningPosition,
        input,
      );
      expect(result.profile.opening).toEqual({
        status: "posted",
        accountingDate: "2026-09-20",
        amount: input.amount,
        idempotencyKey: "opening-1",
        journalEntryId: result.journalEntry?.id,
      });
      expect(result.journalEntry).toMatchObject({
        policy: "opening-position@1",
        financialAccountProfileId: profile.id,
        amount: input.amount,
        postedBy: owner.userId,
      });
      const asset = productKind === "bankAccount";
      expect(
        result.journalEntry?.lines.map((line) => [
          line.nature,
          line.debitMinorUnits,
          line.creditMinorUnits,
        ]),
      ).toEqual(
        asset
          ? [
              ["Asset", 1000, 0],
              ["Equity", 0, 1000],
            ]
          : [
              ["Equity", 1000, 0],
              ["Liability", 0, 1000],
            ],
      );
      expect((await read.balances())[0]?.balance).toEqual(input.amount);
      expect(
        (await read.trialBalance()).reduce(
          (sum, row) => sum + row.debitMinorUnits - row.creditMinorUnits,
          0,
        ),
      ).toBe(0);
    }
  },
);

test("zero opening preserves the date and receipt without posting ledger lines", async () => {
  const { t, workspace, profile, input, read } = await fixture();
  const zero = { ...input, amount: { currency: "COP", minorUnits: 0 } };
  const first = await t.mutation(api.accounting.recordOpeningPosition, zero);
  const replay = await t.mutation(api.accounting.recordOpeningPosition, zero);
  expect(first).toEqual({
    profile: {
      ...profile,
      opening: {
        status: "zero",
        accountingDate: "2026-09-20",
        amount: zero.amount,
        idempotencyKey: "opening-1",
      },
    },
    journalEntry: null,
    replay: false,
  });
  expect(replay).toEqual({ ...first, replay: true });
  expect(await read.entries()).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("journalLines").collect())).toEqual(
    [],
  );
  const profiles = await t.query(api.accounting.listFinancialAccountProfiles, {
    workspaceId: workspace.id,
  });
  expect(profiles).toEqual([first.profile]);
  for (const command of [
    api.accounting.recordCashExpense,
    api.accounting.recordCashIncome,
  ]) {
    expect(
      await caught(
        t.mutation(
          command,
          groceries(workspace.id, profile.id, { accountingDate: "2026-09-19" }),
        ),
      ),
    ).toMatchObject({ data: { code: "activity_before_opening" } });
  }
  expect(await read.entries()).toEqual([]);
});

test.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  "opening %s rejects without date, receipt, or ledger effects",
  async (minorUnits) => {
    const { t, input, read } = await fixture();
    expect(
      await caught(
        t.mutation(api.accounting.recordOpeningPosition, {
          ...input,
          amount: { currency: "COP", minorUnits },
        }),
      ),
    ).toMatchObject({ data: { code: "opening_amount_invalid" } });
    expect(await read.entries()).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("openingPositions").collect()),
    ).toEqual([]);
    expect(
      (
        await t.query(api.accounting.listFinancialAccountProfiles, {
          workspaceId: input.workspaceId,
        })
      )[0]?.opening,
    ).toEqual({ status: "not_started" });
  },
);

test("opening replay survives a lock, conflicts on changed input, and reserves zero keys from cash Posting", async () => {
  const { t, input, profile, read } = await fixture();
  const zero = { ...input, amount: { currency: "COP", minorUnits: 0 } };
  await t.mutation(api.accounting.recordOpeningPosition, zero);
  expect(
    await caught(t.mutation(api.accounting.recordOpeningPosition, input)),
  ).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(
    await caught(
      t.mutation(
        api.accounting.recordCashExpense,
        groceries(input.workspaceId, profile.id, {
          idempotencyKey: input.idempotencyKey,
        }),
      ),
    ),
  ).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(
    await caught(
      t.mutation(api.accounting.recordOpeningPosition, {
        ...zero,
        amount: { currency: "USD", minorUnits: 0 },
      }),
    ),
  ).toMatchObject({ data: { code: "currency_mismatch" } });
  await lock(t, input.workspaceId, { year: 2026, month: 9 });
  expect(
    (await t.mutation(api.accounting.recordOpeningPosition, zero)).replay,
  ).toBe(true);
  expect(await read.entries()).toEqual([]);
});

test("one active opening requires reversal before replacement and preserves original receipts", async () => {
  const { t, input, read } = await fixture();
  const first = await t.mutation(api.accounting.recordOpeningPosition, input);
  if (!first.journalEntry) throw new Error("Expected posted opening");
  const replacement = {
    ...input,
    amount: { currency: "COP", minorUnits: 700 },
    idempotencyKey: "opening-2",
  };
  expect(
    await caught(t.mutation(api.accounting.recordOpeningPosition, replacement)),
  ).toMatchObject({ data: { code: "opening_already_recorded" } });
  expect(
    await caught(
      reverse(t, input.workspaceId, first.journalEntry.id, {
        accountingDate: "2026-09-19",
      }),
    ),
  ).toMatchObject({ data: { code: "reversal_date_before_original" } });
  const reversal = await reverse(t, input.workspaceId, first.journalEntry.id);
  expect(
    (
      await t.query(api.accounting.listFinancialAccountProfiles, {
        workspaceId: input.workspaceId,
      })
    )[0]?.opening.status,
  ).toBe("reversed");
  expect(
    await caught(
      t.mutation(
        api.accounting.recordCashExpense,
        groceries(input.workspaceId, input.financialAccountProfileId, {
          accountingDate: "2026-09-19",
        }),
      ),
    ),
  ).toMatchObject({ data: { code: "activity_before_opening" } });
  const corrected = await t.mutation(
    api.accounting.recordOpeningPosition,
    replacement,
  );
  expect((await read.balances())[0]?.balance.minorUnits).toBe(700);
  const entries = await read.entries();
  expect(entries).toHaveLength(3);
  expect(entries[0]).toEqual({
    ...first.journalEntry,
    reversedByEntryId: reversal.id,
  });
  expect(
    await t.mutation(api.accounting.recordOpeningPosition, replacement),
  ).toEqual({
    ...corrected,
    replay: true,
    journalEntry: { ...corrected.journalEntry, replay: true },
  });
  const oldReplay = await t.mutation(
    api.accounting.recordOpeningPosition,
    input,
  );
  expect(oldReplay.profile).toEqual(corrected.profile);
  expect(oldReplay.journalEntry?.reversedByEntryId).toBe(reversal.id);
});

test("zero opening correction explicitly identifies the current receipt and never erases history", async () => {
  const { t, input, read } = await fixture();
  const zero = { ...input, amount: { currency: "COP", minorUnits: 0 } };
  await t.mutation(api.accounting.recordOpeningPosition, zero);
  const replacement = { ...input, idempotencyKey: "opening-2" };
  expect(
    await caught(t.mutation(api.accounting.recordOpeningPosition, replacement)),
  ).toMatchObject({ data: { code: "opening_already_recorded" } });
  expect(
    await caught(
      t.mutation(api.accounting.recordOpeningPosition, {
        ...replacement,
        replacesOpeningKey: "wrong",
      }),
    ),
  ).toMatchObject({ data: { code: "opening_replacement_conflict" } });
  const posted = await t.mutation(api.accounting.recordOpeningPosition, {
    ...replacement,
    replacesOpeningKey: zero.idempotencyKey,
    accountingDate: "2026-09-18",
  });
  expect(posted.profile.opening).toMatchObject({
    status: "posted",
    accountingDate: "2026-09-18",
  });
  if (!posted.journalEntry) throw new Error("Expected posted opening");
  await reverse(t, input.workspaceId, posted.journalEntry.id);
  const backToZero = await t.mutation(api.accounting.recordOpeningPosition, {
    ...zero,
    idempotencyKey: "opening-3",
    replacesOpeningKey: "opening-2",
    accountingDate: "2026-09-22",
  });
  expect(backToZero.profile.opening).toMatchObject({
    status: "zero",
    accountingDate: "2026-09-22",
  });
  const originalReplay = await t.mutation(api.accounting.recordOpeningPosition, zero);
  expect(originalReplay.profile).toEqual(backToZero.profile);
  expect(originalReplay.journalEntry).toBeNull();
  expect(originalReplay.replay).toBe(true);
  for (const changed of [
    { idempotencyKey: "opening-3", replacesOpeningKey: "opening-3" },
    { idempotencyKey: "opening-4", replacesOpeningKey: "opening-1" },
  ]) {
    expect(
      await caught(t.mutation(api.accounting.recordOpeningPosition, {
        ...input,
        accountingDate: "2026-09-24",
        ...changed,
      })),
    ).toMatchObject({ data: { code: changed.idempotencyKey === "opening-3"
      ? "idempotency_key_conflict"
      : "opening_replacement_conflict" } });
  }
  expect((await read.balances())[0]?.balance.minorUnits).toBe(0);
  expect(
    await t.run((ctx) => ctx.db.query("openingPositions").collect()),
  ).toHaveLength(3);
});

test("initial opening cannot retroactively place existing activity before its date", async () => {
  const { t, input, profile, read } = await fixture();
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(input.workspaceId, profile.id, { accountingDate: "2026-09-19" }),
  );
  expect(
    await caught(t.mutation(api.accounting.recordOpeningPosition, input)),
  ).toMatchObject({ data: { code: "activity_before_opening" } });
  expect(await read.entries()).toHaveLength(1);
});

test("zero and nonzero openings reject Locked Periods and malformed dates atomically", async () => {
  const { t, input, read } = await fixture();
  await lock(t, input.workspaceId, { year: 2026, month: 9 });
  for (const minorUnits of [0, 1000]) {
    expect(
      await caught(
        t.mutation(api.accounting.recordOpeningPosition, {
          ...input,
          amount: { currency: "COP", minorUnits },
        }),
      ),
    ).toMatchObject({ data: { code: "locked_period" } });
  }
  expect(
    await caught(
      t.mutation(api.accounting.recordOpeningPosition, {
        ...input,
        accountingDate: "2026-02-30",
      }),
    ),
  ).toMatchObject({ data: { code: "accounting_date_required" } });
  expect(await read.entries()).toEqual([]);
  expect(
    await t.run((ctx) => ctx.db.query("openingPositions").collect()),
  ).toEqual([]);
});

test("actual AccountingCore opening uses the Convex store and the supplied clock", async () => {
  const { t, input } = await fixture();
  const result = await t.run((ctx) =>
    createAccountingCore(convexStore(ctx.db), {
      now: () => new Date(123456),
    }).recordOpeningPosition({ ...input, actor: owner }),
  );
  expect(result.journalEntry?.postedAt).toBe(123456);
  expect(result.journalEntry?.amount.minorUnits).toBe(1000);
});

test("opening cannot link a malformed or foreign profile or claim a cash journal key", async () => {
  const { t, input, profile, read } = await fixture();
  const foreignWorkspace = await createAdditionalWorkspaceFixture(t);
  const foreign = await createProfile(
    t,
    foreignWorkspace.id,
    "Foreign",
    "loan",
  );
  for (const id of ["not-an-id", input.workspaceId, foreign.id]) {
    expect(
      await caught(
        t.mutation(api.accounting.recordOpeningPosition, {
          ...input,
          financialAccountProfileId: id,
        }),
      ),
    ).toMatchObject({ data: { code: "financial_account_profile_not_found" } });
  }
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(input.workspaceId, profile.id, {
      idempotencyKey: input.idempotencyKey,
    }),
  );
  expect(
    await caught(t.mutation(api.accounting.recordOpeningPosition, input)),
  ).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await read.entries()).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.query("openingPositions").collect()),
  ).toEqual([]);
});
