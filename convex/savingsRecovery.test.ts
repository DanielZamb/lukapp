import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { accountingFixture, fixtureIdentity, septNow, octNow } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);

async function setup() {
  const fixture = await accountingFixture(modules);
  const { t } = fixture;
  vi.setSystemTime(Date.UTC(2026, 8, 1, 12));
  const { workspace, financialAccountProfile } = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota",
  });
  vi.setSystemTime(septNow);
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
    move: (planId: string, key: string, amount = 230_000) => t.action(api.savingsRecovery.recordContribution, {
      workspaceId: workspace.id, planId, sourceFinancialAccountProfileId: financialAccountProfile.id,
      amount: { currency: "COP", minorUnits: amount }, accountingDate: "2026-09-18",
      description: "Recovery: Laptop repair", idempotencyKey: key,
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

test("one guarded movement posts the transfer and contribution, and a reversal lowers progress", async () => {
  const s = await setup();
  const plan = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const gift = await s.move(plan.plan.id, "move-1");
  expect(gift).toMatchObject({
    replay: false,
    transfer: { amount: { currency: "COP", minorUnits: 230_000 } },
    contribution: { transferJournalEntryId: gift.transfer.id, amountMinorUnits: 230_000, contributionDate: "2026-09-18" },
  });
  expect(await s.move(plan.plan.id, "move-1")).toEqual({ ...gift, replay: true });
  const after = await s.ledger();
  expect(after.entries.filter((entry) => entry.policy === "account-transfer@1")).toHaveLength(1);
  expect((await s.read()).plans[0]).toMatchObject({ recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000 });
  await s.t.action(api.accounting.reversePostedEntry, {
    workspaceId: s.workspaceId, journalEntryId: gift.transfer.id, idempotencyKey: "reverse-move",
  });
  expect((await s.read()).plans[0]).toMatchObject({ recoveredMinorUnits: 0, remainingMinorUnits: 1_380_000 });
  expect(await s.t.run((ctx) => ctx.db.query("savingsRecoveryContributions").collect())).toHaveLength(1);
});

test("a transfer posted under the same key before the contribution is adopted on retry", async () => {
  const s = await setup();
  const plan = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const posted = await s.t.action(api.accounting.recordAccountTransfer, {
    workspaceId: s.workspaceId, sourceFinancialAccountProfileId: s.dailyId,
    destinationFinancialAccountProfileId: s.savingsId, amount: { currency: "COP", minorUnits: 230_000 },
    accountingDate: "2026-09-18", description: "Recovery: Laptop repair", idempotencyKey: "move-crash",
  });
  const gift = await s.move(plan.plan.id, "move-crash");
  expect(gift.transfer.id).toBe(posted.id);
  expect(gift.replay).toBe(false);
  expect(await s.move(plan.plan.id, "move-crash")).toEqual({ ...gift, replay: true });
  const after = await s.ledger();
  expect(after.entries.filter((entry) => entry.policy === "account-transfer@1")).toHaveLength(1);
});

test("reversing the source suspends recovery without undoing saved money or replay receipts", async () => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const gift = await s.move(plan.id, "saved-before-reversal");
  await s.t.action(api.accounting.reversePostedEntry, {
    workspaceId: s.workspaceId, journalEntryId: s.expenseId, idempotencyKey: "reverse-expense",
  });
  const before = await s.ledger();
  expect((await s.read()).plans[0]).toMatchObject({
    status: "suspended", recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000,
    dueMinorUnits: 0,
  });
  await expect(s.move(plan.id, "new-after-reversal")).rejects.toMatchObject({
    data: { kind: "recovery", code: "expense_not_recoverable" },
  });
  expect(await s.move(plan.id, "saved-before-reversal")).toEqual({ ...gift, replay: true });
  await expect(s.move(plan.id, "saved-before-reversal", 300_000)).rejects.toMatchObject({
    data: { kind: "accounting", code: "idempotency_key_conflict" },
  });
  expect(await s.ledger()).toEqual(before);
  expect(await s.t.run((ctx) => ctx.db.query("savingsRecoveryContributions").collect())).toHaveLength(1);
});

test("a card source or liability destination is rejected without a second ledger write", async () => {
  const s = await setup();
  const card = await s.t.action(api.accounting.createFinancialAccountProfile, {
    workspaceId: s.workspaceId, name: "Card", productKind: "creditCard",
  });
  const before = await s.ledger();
  await expect(s.t.action(api.savingsRecovery.activatePlan, {
    ...s.activate, destinationFinancialAccountProfileId: card.id, idempotencyKey: "activate-card",
  })).rejects.toMatchObject({ data: { kind: "recovery", code: "destination_must_be_asset" } });
  const plan = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  await expect(s.t.action(api.savingsRecovery.recordContribution, {
    workspaceId: s.workspaceId, planId: plan.plan.id, sourceFinancialAccountProfileId: card.id,
    amount: { currency: "COP", minorUnits: 230_000 }, accountingDate: "2026-09-18",
    description: "Recovery: Laptop repair", idempotencyKey: "from-card",
  })).rejects.toMatchObject({ data: { kind: "recovery", code: "source_must_be_asset" } });
  expect(await s.ledger()).toEqual(before);
});

test("recovery writes require authentication and a registered device and leave the ledger untouched on rejection", async () => {
  const s = await setup();
  const before = await s.ledger();
  await expect(s.root.query(api.savingsRecovery.evaluate, { workspaceId: s.workspaceId }))
    .rejects.toMatchObject({ data: { code: "authentication_required" } });
  const stranger = s.root.withIdentity({ ...fixtureIdentity, subject: "stranger" });
  await expect(stranger.query(api.savingsRecovery.evaluate, { workspaceId: s.workspaceId }))
    .rejects.toMatchObject({ data: { code: "device_registration_required" } });
  await expect(s.t.action(api.savingsRecovery.activatePlan, {
    ...s.activate, installmentMinorUnits: 199_999, idempotencyKey: "too-small",
  })).rejects.toMatchObject({ data: { kind: "recovery", code: "installment_below_minimum" } });
  expect(await s.ledger()).toEqual(before);
  expect((await s.read()).plans).toEqual([]);
});

test("a retry that changes the date, description or currency conflicts instead of replaying", async () => {
  const s = await setup();
  const plan = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const args = {
    workspaceId: s.workspaceId, planId: plan.plan.id, sourceFinancialAccountProfileId: s.dailyId,
    amount: { currency: "COP", minorUnits: 230_000 }, accountingDate: "2026-09-18",
    description: "Recovery: Laptop repair", idempotencyKey: "move-changed",
  };
  const gift = await s.t.action(api.savingsRecovery.recordContribution, args);
  for (const changed of [
    { ...args, accountingDate: "2026-09-19" },
    { ...args, description: "Something else" },
    { ...args, amount: { currency: "USD", minorUnits: 230_000 } },
  ]) {
    await expect(s.t.action(api.savingsRecovery.recordContribution, changed))
      .rejects.toMatchObject({ data: { code: expect.stringMatching(/idempotency_key_conflict|currency_mismatch/) } });
  }
  expect(await s.t.action(api.savingsRecovery.recordContribution, args)).toEqual({ ...gift, replay: true });
  const after = await s.ledger();
  expect(after.entries.filter((entry) => entry.policy === "account-transfer@1")).toHaveLength(1);
});

test("progress for a month counts only contributions made by that month's end", async () => {
  const s = await setup();
  const plan = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  vi.setSystemTime(octNow);
  await s.t.action(api.savingsRecovery.recordContribution, {
    workspaceId: s.workspaceId, planId: plan.plan.id, sourceFinancialAccountProfileId: s.dailyId,
    amount: { currency: "COP", minorUnits: 230_000 }, accountingDate: "2026-10-02",
    description: "Recovery: Laptop repair", idempotencyKey: "move-october",
  });
  const month = (value: string) =>
    s.t.query(api.savingsRecovery.evaluate, { workspaceId: s.workspaceId, month: value });
  expect((await month("2026-09")).plans[0]).toMatchObject({
    recoveredMinorUnits: 0, remainingMinorUnits: 1_380_000, dueMinorUnits: 230_000,
  });
  expect((await month("2026-10")).plans[0]).toMatchObject({
    recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000, dueMinorUnits: 230_000,
  });
});

test("a plan activated late on the month's last evening belongs to that month in the workspace zone", async () => {
  const s = await setup();
  vi.setSystemTime(Date.parse("2026-10-31T23:30:00-05:00"));
  const plan = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  expect(plan.plan.activationMonth).toBe("2026-10");
  expect(await s.read()).toMatchObject({ currentMonth: "2026-10" });
});
