import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  createProfile,
  reader,
  reverse,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);

async function fixture(productKind: "loan" | "creditCard", owed = 12_300_000) {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const bank = await createDaily(t, workspace.id);
  const debt = await createProfile(t, workspace.id, `SEN-97 ${productKind}`, productKind);
  for (const [profile, amount] of [[bank, 100_000_000], [debt, owed]] as const) {
    await t.action(api.accounting.recordOpeningPosition, {
      workspaceId: workspace.id,
      financialAccountProfileId: profile.id,
      amount: { currency: "COP", minorUnits: amount },
      accountingDate: "2026-09-01",
      description: "SEN-97 exact test fixture, not the user's original balance",
      idempotencyKey: `opening-${profile.id}`,
    });
  }
  const payment = (minorUnits: number, idempotencyKey = "repayment") => ({
    workspaceId: workspace.id,
    sourceFinancialAccountProfileId: bank.id,
    destinationFinancialAccountProfileId: debt.id,
    amount: { currency: "COP", minorUnits },
    accountingDate: "2026-09-24",
    description: "SEN-97 repayment",
    idempotencyKey,
  });
  const read = reader(t, workspace.id);
  const snapshot = () => t.run(async (ctx) => ({
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
    totals: await ctx.db.query("ledgerAccountTotals").collect(),
    summaries: await ctx.db.query("ledgerSummaryEntries").collect(),
    history: await ctx.db.query("journalEntryProfiles").collect(),
    periods: await ctx.db.query("accountingPeriods").collect(),
    intake: await ctx.db.query("notificationIntakeReceipts").collect(),
  }));
  const expectBalances = async (owed: number, cash: number) => {
    const balances = await read.balances();
    expect(balances.find((row) => row.financialAccountProfileId === debt.id)?.balance)
      .toEqual({ currency: "COP", minorUnits: owed });
    expect(balances.find((row) => row.financialAccountProfileId === bank.id)?.balance)
      .toEqual({ currency: "COP", minorUnits: cash });
  };
  return { t, workspace, bank, debt, payment, read, snapshot, expectBalances };
}

test.each(["loan", "creditCard"] as const)("%s rejects COP 450,000 against an exact COP 123,000 fixture atomically", async (kind) => {
  const { t, payment, snapshot, expectBalances } = await fixture(kind);
  const before = await snapshot();
  await expect(t.action(api.accounting.recordAccountTransfer, payment(45_000_000)))
    .rejects.toMatchObject({ data: { kind: "accounting", code: "repayment_exceeds_debt" } });
  expect(await snapshot()).toEqual(before);
  await expectBalances(12_300_000, 100_000_000);
});

for (const kind of ["loan", "creditCard"] as const) {
  test.each([
    ["below the illustrative COP 10,000 statement", 500_000, 11_800_000, 99_500_000],
    ["above the illustrative statement, below total debt", 1_500_000, 10_800_000, 98_500_000],
    ["equal to total debt", 12_300_000, 0, 87_700_000],
  ] as const)(`${kind} accepts a payment %s`, async (_label, amount, remaining, cash) => {
    const s = await fixture(kind);
    const receipt = await s.t.action(api.accounting.recordAccountTransfer, s.payment(amount));
    expect(receipt).toMatchObject({ replay: false, amount: { currency: "COP", minorUnits: amount } });
    await s.expectBalances(remaining, cash);
    expect(await s.read.entries()).toHaveLength(3);
  });

  test.each([0, 12_300_000])(`${kind} rejects one minor unit over debt %i without partial writes`, async (owed) => {
    const s = await fixture(kind, owed);
    const before = await s.snapshot();
    await expect(s.t.action(api.accounting.recordAccountTransfer, {
      ...s.payment(owed + 1), accountingDate: "2026-10-01",
    })).rejects.toMatchObject({ data: { code: "repayment_exceeds_debt" } });
    expect(await s.snapshot()).toEqual(before);
    await s.expectBalances(owed, 100_000_000);
  });

  test(`${kind} checks a stale draft against intervening ledger writes and accepts a correction`, async () => {
    const s = await fixture(kind);
    const stale = s.payment(12_300_000, "stale");
    await s.t.action(api.accounting.recordAccountTransfer, s.payment(3_000_000, "intervening"));
    const before = await s.snapshot();
    await expect(s.t.action(api.accounting.recordAccountTransfer, stale))
      .rejects.toMatchObject({ data: { code: "repayment_exceeds_debt" } });
    expect(await s.snapshot()).toEqual(before);
    await s.t.action(api.accounting.recordAccountTransfer, s.payment(9_300_000, "corrected"));
    await s.expectBalances(0, 87_700_000);
  });

  test(`${kind} concurrent distinct payments cannot jointly exceed total debt`, async () => {
    const s = await fixture(kind);
    const results = await Promise.allSettled(["a", "b"].map((key) =>
      s.t.action(api.accounting.recordAccountTransfer, s.payment(7_000_000, key))));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { data: { code: "repayment_exceeds_debt" } } });
    await s.expectBalances(5_300_000, 93_000_000);
    expect(await s.read.entries()).toHaveLength(3);
    expect((await s.snapshot()).lines).toHaveLength(6);
  });

  test(`${kind} concurrent exact retries return one receipt even after payoff, and changed payloads conflict`, async () => {
    const s = await fixture(kind);
    const request = s.payment(12_300_000);
    const results = await Promise.all([s.t.action(api.accounting.recordAccountTransfer, request),
      s.t.action(api.accounting.recordAccountTransfer, request)]);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(results.map((result) => result.replay).sort()).toEqual([false, true]);
    const first = results.find((result) => !result.replay);
    const before = await s.snapshot();
    expect(await s.t.action(api.accounting.recordAccountTransfer, request)).toEqual({ ...first, replay: true });
    await expect(s.t.action(api.accounting.recordAccountTransfer, {
      ...request, amount: { currency: "COP", minorUnits: 1 },
    })).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
    await expect(s.t.action(api.accounting.recordAccountTransfer, s.payment(1, "new-after-payoff")))
      .rejects.toMatchObject({ data: { code: "repayment_exceeds_debt" } });
    expect(await s.snapshot()).toEqual(before);
    await s.expectBalances(0, 87_700_000);
  });

  test(`${kind} repayment reversals restore capacity without changing the original and allow repayment again`, async () => {
    const s = await fixture(kind);
    const request = s.payment(12_300_000);
    const first = await s.t.action(api.accounting.recordAccountTransfer, request);
    const undone = await reverse(s.t, s.workspace.id, first.id);
    await s.expectBalances(12_300_000, 100_000_000);
    expect(undone.lines).toEqual(first.lines.map((line) => ({ ...line,
      debitMinorUnits: line.creditMinorUnits, creditMinorUnits: line.debitMinorUnits })));
    expect(await reverse(s.t, s.workspace.id, first.id)).toEqual({ ...undone, replay: true });
    expect(await s.t.action(api.accounting.recordAccountTransfer, request))
      .toEqual({ ...first, replay: true, reversedByEntryId: undone.id });
    await s.t.action(api.accounting.recordAccountTransfer, s.payment(12_300_000, "after-reversal"));
    await s.expectBalances(0, 87_700_000);
    expect(await s.read.entries()).toHaveLength(5);
  });

  test(`${kind} allows debt increases and their valid reversal after repayment, then caps new payments at current debt`, async () => {
    const s = await fixture(kind);
    const expense = (minorUnits: number, idempotencyKey: string) => ({
      workspaceId: s.workspace.id, financialAccountProfileId: s.debt.id,
      amount: { currency: "COP", minorUnits }, accountingDate: "2026-09-24",
      description: "SEN-97 debt increase", idempotencyKey,
    });
    const increase = await s.t.action(api.accounting.recordCashExpense, expense(3_000_000, "increase"));
    await s.t.action(api.accounting.recordAccountTransfer, s.payment(15_300_000));
    await reverse(s.t, s.workspace.id, increase.id);
    await s.expectBalances(-3_000_000, 84_700_000);
    const before = await s.snapshot();
    await expect(s.t.action(api.accounting.recordAccountTransfer, s.payment(1, "credit-balance")))
      .rejects.toMatchObject({ data: { code: "repayment_exceeds_debt" } });
    expect(await s.snapshot()).toEqual(before);
    await s.t.action(api.accounting.recordCashExpense, expense(4_000_000, "new-increase"));
    await s.t.action(api.accounting.recordAccountTransfer, s.payment(1_000_000, "new-debt-repaid"));
    await s.expectBalances(0, 83_700_000);
  });

  test(`${kind} cash income cannot bypass the cap and valid income retries still work`, async () => {
    const s = await fixture(kind);
    const request = { workspaceId: s.workspace.id, financialAccountProfileId: s.debt.id,
      amount: { currency: "COP" as const, minorUnits: 12_300_001 }, accountingDate: "2026-09-24",
      description: "SEN-97 incoming on debt", idempotencyKey: "income" };
    const before = await s.snapshot();
    await expect(s.t.action(api.accounting.recordCashIncome, request))
      .rejects.toMatchObject({ data: { code: "repayment_exceeds_debt" } });
    expect(await s.snapshot()).toEqual(before);
    const valid = { ...request, amount: { currency: "COP", minorUnits: 12_300_000 } };
    const receipt = await s.t.action(api.accounting.recordCashIncome, valid);
    expect(await s.t.action(api.accounting.recordCashIncome, valid)).toEqual({ ...receipt, replay: true });
    await s.expectBalances(0, 100_000_000);
  });

  test(`${kind} notification intake inherits the debt cap without leaving a receipt on rejection`, async () => {
    const s = await fixture(kind);
    const suggestion = { direction: "in" as const, description: "SEN-97 incoming notification",
      amount: { currency: "COP" as const, minorUnits: 12_300_001 }, accountingDate: "2026-09-24",
      financialAccountProfileId: s.debt.id, userCategoryIds: [], primaryUserCategoryId: null };
    const request = { workspaceId: s.workspace.id, candidateId: "sen-97-incoming",
      suggestion, confirmed: suggestion, parserVersion: "sen-97@1", consentVersion: "sen-97@1" };
    const before = await s.snapshot();
    await expect(s.t.action(api.notificationIntake.confirmOne, request))
      .rejects.toMatchObject({ data: { code: "repayment_exceeds_debt" } });
    expect(await s.snapshot()).toEqual(before);
    const valid = { ...request, confirmed: { ...suggestion, amount: { currency: "COP" as const, minorUnits: 12_300_000 } } };
    const receipt = await s.t.action(api.notificationIntake.confirmOne, valid);
    expect(await s.t.action(api.notificationIntake.confirmOne, valid))
      .toEqual({ ...receipt, replay: true, posted: { ...receipt.posted, replay: true } });
    await s.expectBalances(0, 100_000_000);
    expect((await s.snapshot()).intake).toHaveLength(1);
  });
}

test("ordinary asset transfers and debt-to-debt transfers preserve their direction", async () => {
  const s = await fixture("loan");
  const savings = await createProfile(s.t, s.workspace.id, "Savings", "savingsAccount");
  await s.t.action(api.accounting.recordAccountTransfer, {
    ...s.payment(20_000_000, "ordinary"), destinationFinancialAccountProfileId: savings.id,
  });
  const card = await createProfile(s.t, s.workspace.id, "Card", "creditCard");
  await s.t.action(api.accounting.recordAccountTransfer, {
    ...s.payment(12_300_000), sourceFinancialAccountProfileId: card.id,
  });
  await s.expectBalances(0, 80_000_000);
  expect((await s.read.balances()).find((row) => row.financialAccountProfileId === card.id)?.balance.minorUnits)
    .toBe(12_300_000);
});

test("an unavailable canonical summary rejects before writing rather than treating debt as zero", async () => {
  const s = await fixture("loan");
  await s.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("workspaces", s.workspace.id);
    if (!id) throw new Error("Missing workspace");
    await ctx.db.patch(id, { ledgerSummaryVersion: undefined });
  });
  const before = await s.snapshot();
  await expect(s.t.action(api.accounting.recordAccountTransfer, s.payment(1)))
    .rejects.toMatchObject({ data: { code: "ledger_summary_not_ready" } });
  expect(await s.snapshot()).toEqual(before);
});
