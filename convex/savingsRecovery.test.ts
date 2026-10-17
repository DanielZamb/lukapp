import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { accountingFixture, fixtureIdentity } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);

async function setup() {
  const fixture = await accountingFixture(modules);
  const { t } = fixture;
  const { workspace, financialAccountProfile } = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0,
  });
  const savings = await t.action(api.accounting.createFinancialAccountProfile, {
    workspaceId: workspace.id, name: "Savings", productKind: "savingsAccount",
  });
  const expense = await t.action(api.accounting.recordCashExpense, {
    workspaceId: workspace.id, financialAccountProfileId: financialAccountProfile.id,
    amount: { currency: "COP", minorUnits: 1_200_000 }, accountingDate: "2026-09-09",
    description: "Laptop repair", idempotencyKey: "laptop",
  });
  const activate = {
    workspaceId: workspace.id, sourceJournalEntryId: expense.id,
    destinationFinancialAccountProfileId: savings.id, installmentCount: 6,
    installmentMinorUnits: 230_000, idempotencyKey: "activate-laptop",
  };
  return {
    ...fixture, workspaceId: workspace.id, dailyId: financialAccountProfile.id, savingsId: savings.id,
    expenseId: expense.id, activate,
    ledger: async () => ({
      entries: await t.query(api.accounting.listJournalEntries, { workspaceId: workspace.id }),
      balances: await t.query(api.accounting.balances, { workspaceId: workspace.id }),
    }),
    read: () => t.query(api.savingsRecovery.evaluate, { workspaceId: workspace.id }),
    move: (key: string, amount = 230_000) => t.action(api.accounting.recordAccountTransfer, {
      workspaceId: workspace.id, sourceFinancialAccountProfileId: financialAccountProfile.id,
      destinationFinancialAccountProfileId: savings.id, amount: { currency: "COP", minorUnits: amount },
      accountingDate: "2026-09-18", description: "Recovery: Laptop repair", idempotencyKey: key,
    }),
  };
}

test("activation freezes an edited suggestion without writing the ledger", async () => {
  const s = await setup();
  const before = await s.ledger();
  const first = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  expect(first).toMatchObject({
    replay: false,
    plan: { title: "Laptop repair", principalMinorUnits: 1_200_000, installmentMinorUnits: 230_000 },
  });
  expect(first.plan.impliedAnnualRateBps).toBeGreaterThan(0);
  expect(await s.t.action(api.savingsRecovery.activatePlan, s.activate)).toEqual({ ...first, replay: true });
  expect(await s.ledger()).toEqual(before);
  expect(await s.read()).toMatchObject({
    currency: "COP",
    plans: [{ recoveredMinorUnits: 0, remainingMinorUnits: 1_380_000, dueMinorUnits: 230_000 }],
    candidates: [],
  });
});

test("a contribution follows a posted transfer and a reversal lowers progress without deleting history", async () => {
  const s = await setup();
  const plan = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const transfer = await s.move("move-1");
  const gift = await s.t.action(api.savingsRecovery.recordContribution, {
    workspaceId: s.workspaceId, planId: plan.plan.id, transferJournalEntryId: transfer.id, idempotencyKey: "gift-1",
  });
  expect(gift.contribution).toMatchObject({
    transferJournalEntryId: transfer.id, amountMinorUnits: 230_000, contributionDate: "2026-09-18",
  });
  expect(await s.t.action(api.savingsRecovery.recordContribution, {
    workspaceId: s.workspaceId, planId: plan.plan.id, transferJournalEntryId: transfer.id, idempotencyKey: "gift-1",
  })).toEqual({ ...gift, replay: true });
  expect((await s.read()).plans[0]).toMatchObject({ recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000 });
  await s.t.action(api.accounting.reversePostedEntry, {
    workspaceId: s.workspaceId, journalEntryId: transfer.id, idempotencyKey: "reverse-move",
  });
  expect((await s.read()).plans[0]).toMatchObject({ recoveredMinorUnits: 0, remainingMinorUnits: 1_380_000 });
  expect(await s.t.run((ctx) => ctx.db.query("savingsRecoveryContributions").collect())).toHaveLength(1);
});

test("recovery writes require an admitted owner and leave the ledger untouched on rejection", async () => {
  const s = await setup();
  const before = await s.ledger();
  await expect(s.root.query(api.savingsRecovery.evaluate, { workspaceId: s.workspaceId }))
    .rejects.toMatchObject({ data: { code: "authentication_required" } });
  const stranger = s.root.withIdentity({ ...fixtureIdentity, subject: "stranger" });
  await expect(stranger.query(api.savingsRecovery.evaluate, { workspaceId: s.workspaceId }))
    .rejects.toMatchObject({ data: { code: "owner_required" } });
  await expect(s.t.action(api.savingsRecovery.activatePlan, {
    ...s.activate, installmentMinorUnits: 199_999, idempotencyKey: "too-small",
  })).rejects.toMatchObject({ data: { kind: "recovery", code: "installment_below_minimum" } });
  expect(await s.ledger()).toEqual(before);
  expect((await s.read()).plans).toEqual([]);
});
