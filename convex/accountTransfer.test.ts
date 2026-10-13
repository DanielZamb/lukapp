/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  createOwnedWorkspace,
  createProfile,
  createAdditionalWorkspaceFixture,
  caught,
  reader,
  lock,
  reverse,
  owner,
} from "../src/accounting/convexHarness";
import { createAccountingCore } from "../src/accounting/core";
import { convexStore } from "./store";
import { postJournalEntry } from "../src/accounting/posting";
import type { FinancialAccountProductKind } from "../src/accounting/types";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

async function fixture(
  sourceKind: FinancialAccountProductKind = "bankAccount",
  destinationKind: FinancialAccountProductKind = "savingsAccount",
) {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const source = await createProfile(t, workspace.id, "Source", sourceKind);
  const destination = await createProfile(
    t,
    workspace.id,
    "Destination",
    destinationKind,
  );
  const input = {
    workspaceId: workspace.id,
    sourceFinancialAccountProfileId: source.id,
    destinationFinancialAccountProfileId: destination.id,
    amount: { currency: "COP", minorUnits: 250 },
    accountingDate: "2026-09-24",
    description: "Move value",
    idempotencyKey: "transfer-1",
  };
  return {
    t,
    workspace,
    source,
    destination,
    input,
    read: reader(t, workspace.id),
  };
}

test.each([
  ["bankAccount", "savingsAccount"],
  ["bankAccount", "creditCard"],
  ["loan", "bankAccount"],
  ["creditCard", "loan"],
] satisfies [FinancialAccountProductKind, FinancialAccountProductKind][])(
  "transfer %s to %s debits destination and credits source without income or expense",
  async (sourceKind, destinationKind) => {
    const { t, source, destination, input, read } = await fixture(
      sourceKind,
      destinationKind,
    );
    const posted = await t.mutation(
      api.accounting.recordAccountTransfer,
      input,
    );
    expect(posted.policy).toBe("account-transfer@1");
    expect(posted.financialAccountProfileId).toBe(source.id);
    expect(posted.accountTransfer).toEqual({
      sourceFinancialAccountProfileId: source.id,
      destinationFinancialAccountProfileId: destination.id,
      sourceNature:
        sourceKind === "creditCard" || sourceKind === "loan"
          ? "Liability"
          : "Asset",
      destinationNature:
        destinationKind === "creditCard" || destinationKind === "loan"
          ? "Liability"
          : "Asset",
    });
    expect(
      posted.lines.map((line) => [
        line.financialAccountProfileId,
        line.debitMinorUnits,
        line.creditMinorUnits,
      ]),
    ).toEqual([
      [destination.id, 250, 0],
      [source.id, 0, 250],
    ]);
    for (const profile of [source, destination]) {
      expect(
        await t.query(api.accounting.listJournalEntries, {
          workspaceId: input.workspaceId,
          financialAccountProfileId: profile.id,
        }),
      ).toEqual([posted]);
    }
    const balances = await read.balances();
    expect(balances.map((row) => row.balance.minorUnits)).toEqual([
      sourceKind === "loan" || sourceKind === "creditCard" ? 250 : -250,
      destinationKind === "loan" || destinationKind === "creditCard"
        ? -250
        : 250,
    ]);
    const trial = await read.trialBalance();
    expect(
      trial
        .filter((row) => row.nature === "Expense" || row.nature === "Revenue")
        .map((row) => [row.debitMinorUnits, row.creditMinorUnits]),
    ).toEqual([]);
    expect(
      trial.reduce(
        (sum, row) => sum + row.debitMinorUnits - row.creditMinorUnits,
        0,
      ),
    ).toBe(0);
  },
);

test("transfer replay survives locking and reversal while changed facts conflict", async () => {
  const { t, input, read } = await fixture();
  const first = await t.mutation(api.accounting.recordAccountTransfer, input);
  const reversal = await reverse(t, input.workspaceId, first.id);
  await lock(t, input.workspaceId, { year: 2026, month: 9 });
  const replay = await t.mutation(api.accounting.recordAccountTransfer, input);
  expect(replay).toEqual({
    ...first,
    accountingPeriod: { year: 2026, month: 9, status: "locked" },
    replay: true,
    reversedByEntryId: reversal.id,
  });
  expect(
    await caught(
      t.mutation(api.accounting.recordAccountTransfer, {
        ...input,
        sourceFinancialAccountProfileId:
          input.destinationFinancialAccountProfileId,
        destinationFinancialAccountProfileId:
          input.sourceFinancialAccountProfileId,
      }),
    ),
  ).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await read.entries()).toHaveLength(2);
  expect((await read.balances()).map((row) => row.balance.minorUnits)).toEqual([
    0, 0,
  ]);
});

test("same profile, foreign profile, wrong currency, invalid amount, and locked date reject atomically", async () => {
  const { t, input, source, read } = await fixture();
  const foreignWorkspace = await createAdditionalWorkspaceFixture(t);
  const foreign = await createProfile(
    t,
    foreignWorkspace.id,
    "Foreign",
    "loan",
  );
  const attempts = [
    {
      args: { ...input, destinationFinancialAccountProfileId: source.id },
      code: "account_transfer_same_profile",
    },
    {
      args: { ...input, destinationFinancialAccountProfileId: foreign.id },
      code: "financial_account_profile_not_found",
    },
    {
      args: { ...input, sourceFinancialAccountProfileId: foreign.id },
      code: "financial_account_profile_not_found",
    },
    {
      args: { ...input, amount: { currency: "USD", minorUnits: 250 } },
      code: "currency_mismatch",
    },
    ...[0, -1, 0.5, Number.POSITIVE_INFINITY].map((minorUnits) => ({
      args: { ...input, amount: { currency: "COP", minorUnits } },
      code: "amount_must_be_positive",
    })),
    {
      args: { ...input, accountingDate: "2026-02-30" },
      code: "accounting_date_required",
    },
  ];
  for (const attempt of attempts)
    expect(
      await caught(
        t.mutation(api.accounting.recordAccountTransfer, attempt.args),
      ),
    ).toMatchObject({ data: { code: attempt.code } });
  await lock(t, input.workspaceId, { year: 2026, month: 9 });
  expect(
    await caught(t.mutation(api.accounting.recordAccountTransfer, input)),
  ).toMatchObject({ data: { code: "locked_period" } });
  expect(await read.entries()).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("journalLines").collect())).toEqual(
    [],
  );
  expect((await read.balances()).map((row) => row.balance.minorUnits)).toEqual([
    0, 0,
  ]);
  expect(
    await caught(
      t.query(api.accounting.listJournalEntries, {
        workspaceId: input.workspaceId,
        financialAccountProfileId: foreign.id,
      }),
    ),
  ).toMatchObject({ data: { code: "financial_account_profile_not_found" } });
});

test.each(["source", "destination"])(
  "transfer rejects pre-opening activity on the %s even with no source entry link",
  async (side) => {
    const { t, input, source, destination, read } = await fixture();
    const profile = side === "source" ? source : destination;
    await t.mutation(api.accounting.recordOpeningPosition, {
      workspaceId: input.workspaceId,
      financialAccountProfileId: profile.id,
      amount: { currency: "COP", minorUnits: 0 },
      accountingDate: "2026-09-25",
      description: "Start Tracking",
      idempotencyKey: "opening",
    });
    expect(
      await caught(t.mutation(api.accounting.recordAccountTransfer, input)),
    ).toMatchObject({ data: { code: "activity_before_opening" } });
    expect(await read.entries()).toEqual([]);
    const permitted = await t.mutation(api.accounting.recordAccountTransfer, {
      ...input,
      accountingDate: "2026-09-25",
    });
    expect(permitted.amount.minorUnits).toBe(250);
  },
);

test("shared Posting enforces opening dates on every line, even without a profile link", async () => {
  const { t, input, source, destination } = await fixture();
  await t.mutation(api.accounting.recordOpeningPosition, {
    workspaceId: input.workspaceId,
    financialAccountProfileId: destination.id,
    amount: { currency: "COP", minorUnits: 0 },
    accountingDate: "2026-09-25",
    description: "Start Tracking",
    idempotencyKey: "opening",
  });
  const result = await caught(
    t.run((ctx) =>
      postJournalEntry(
        convexStore(ctx.db),
        { now: () => new Date() },
        {
          actor: owner,
          workspaceId: input.workspaceId,
          draft: {
            accountingDate: input.accountingDate,
            description: input.description,
            idempotencyKey: input.idempotencyKey,
            policy: "account-transfer@1",
            lines: [
              {
                ledgerAccountId: destination.ledgerAccountId,
                debitMinorUnits: 250,
                creditMinorUnits: 0,
              },
              {
                ledgerAccountId: source.ledgerAccountId,
                debitMinorUnits: 0,
                creditMinorUnits: 250,
              },
            ],
          },
        },
      ),
    ),
  );
  expect(result).toMatchObject({ code: "activity_before_opening" });
});

test("actual AccountingCore transfer writes through the store and returns the profile projection", async () => {
  const { t, input, destination } = await fixture("bankAccount", "creditCard");
  const result = await t.run((ctx) =>
    createAccountingCore(convexStore(ctx.db), {
      now: () => new Date(789),
    }).recordAccountTransfer({ ...input, actor: owner }),
  );
  expect(result.postedAt).toBe(789);
  expect(result.accountTransfer?.destinationFinancialAccountProfileId).toBe(
    destination.id,
  );
  expect(result.accountTransfer?.destinationNature).toBe("Liability");
});
