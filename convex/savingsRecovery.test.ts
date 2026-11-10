import { expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { api } from "./_generated/api";
import { accountingFixture, fixtureIdentity, octNow } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);

async function setup() {
  const fixture = await accountingFixture(modules);
  const { t } = fixture;
  vi.setSystemTime(Date.UTC(2026, 8, 1, 12));
  const { workspace, financialAccountProfile } = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota",
  });
  vi.setSystemTime(Date.UTC(2026, 8, 17, 12));
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
    read: (month?: string) => t.query(api.savingsRecovery.evaluate, { workspaceId: workspace.id, ...(month ? { month } : {}) }),
    move: (planId: string, key: string, amount = 230_000, accountingDate = "2026-09-18") => t.action(api.savingsRecovery.recordContribution, {
      workspaceId: workspace.id, planId, sourceFinancialAccountProfileId: financialAccountProfile.id,
      amount: { currency: "COP", minorUnits: amount }, accountingDate,
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

async function secondPlan(s: Awaited<ReturnType<typeof setup>>) {
  const expense = await s.t.action(api.accounting.recordCashExpense, {
    workspaceId: s.workspaceId, financialAccountProfileId: s.dailyId,
    amount: { currency: "COP", minorUnits: 1_200_000 }, accountingDate: "2026-09-10",
    description: "Second expense", idempotencyKey: "second-expense",
  });
  return (await s.t.action(api.savingsRecovery.activatePlan, {
    ...s.activate, sourceJournalEntryId: expense.id, idempotencyKey: "second-plan",
  })).plan;
}

test.each([false, true])("cancellation preserves frozen terms and recorded saving, contributed=%s", async contributed => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const gift = contributed ? await s.move(plan.id, "saved") : undefined;
  const before = await s.ledger();
  const args = { workspaceId: s.workspaceId, planId: plan.id, reason: "  Different schedule  ", idempotencyKey: "cancel" };
  const first = await s.t.action(api.savingsRecovery.cancelPlan, args);
  expect(first).toMatchObject({ replay: false, cancellation: {
    planId: plan.id, createdBy: "owner-1", reason: "Different schedule", eventTime: Date.now(), recordedAt: Date.now(),
  } });
  expect(await s.t.action(api.savingsRecovery.cancelPlan, args)).toEqual({ ...first, replay: true });
  await expect(s.t.action(api.savingsRecovery.cancelPlan, { ...args, reason: "changed" }))
    .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await expect(s.t.action(api.savingsRecovery.cancelPlan, { ...args, idempotencyKey: "other" }))
    .rejects.toMatchObject({ data: { code: "plan_already_cancelled" } });
  expect(await s.read()).toMatchObject({
    plans: [{ status: "cancelled", recoveredMinorUnits: contributed ? 230_000 : 0, remainingMinorUnits: 0, dueMinorUnits: 0,
      targetMinorUnits: 1_380_000, installmentMinorUnits: 230_000, cancellation: first.cancellation }],
    candidates: [{ journalEntryId: s.expenseId, amountMinorUnits: contributed ? 1_000_000 : 1_200_000 }],
  });
  await expect(s.move(plan.id, "after-cancel")).rejects.toMatchObject({ data: { code: "plan_cancelled" } });
  if (gift) expect(await s.move(plan.id, "saved")).toEqual({ ...gift, replay: true });
  expect(await s.ledger()).toEqual(before);
  expect(await s.t.run(ctx => ctx.db.query("savingsRecoveryPlans").collect())).toMatchObject([{
    principalMinorUnits: 1_200_000, installmentMinorUnits: 230_000,
  }]);
  expect(await s.t.run(ctx => ctx.db.query("savingsRecoveryCancellations").collect())).toHaveLength(1);
});

test.each([false, true])("suspended plans can be cancelled, contributed=%s; completed plans cannot", async contributed => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  if (contributed) await s.move(plan.id, "saved");
  await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: s.expenseId, idempotencyKey: "reverse-source" });
  const before = await s.ledger();
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey: "cancel-suspended" });
  expect((await s.read()).plans[0]).toMatchObject({ status: "cancelled", recoveredMinorUnits: contributed ? 230_000 : 0, dueMinorUnits: 0 });
  expect((await s.read()).candidates).toEqual([]);
  expect(await s.ledger()).toEqual(before);
  const completed = await secondPlan(s);
  await s.move(completed.id, "complete", 1_380_000);
  await expect(s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: completed.id, idempotencyKey: "cancel-complete" }))
    .rejects.toMatchObject({ data: { code: "plan_already_complete" } });
  for (const reason of [" ", "x".repeat(1001)])
    await expect(s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: completed.id, reason, idempotencyKey: "bad-reason" }))
      .rejects.toMatchObject({ data: { code: "reason_invalid" } });
});

test("linked replacements reserve only unrecovered principal and link in both directions", async () => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  await s.move(plan.id, "saved");
  const args = { ...s.activate, replacesPlanId: plan.id, installmentMinorUnits: 180_000, idempotencyKey: "replacement" };
  await expect(s.t.action(api.savingsRecovery.activatePlan, args)).rejects.toMatchObject({ data: { code: "replacement_plan_not_cancelled" } });
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey: "cancel" });
  const before = await s.ledger();
  const replacement = await s.t.action(api.savingsRecovery.activatePlan, args);
  expect(replacement.plan).toMatchObject({ principalMinorUnits: 1_000_000, replacesPlanId: plan.id });
  expect(await s.t.action(api.savingsRecovery.activatePlan, args)).toEqual({ ...replacement, replay: true });
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...args, replacesPlanId: undefined }))
    .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  const view = await s.read();
  expect(view.plans.find(p => p.id === plan.id)).toMatchObject({ replacedByPlanId: replacement.plan.id, recoveredMinorUnits: 230_000 });
  expect(view.plans.find(p => p.id === replacement.plan.id)).toMatchObject({ replacesPlanId: plan.id, recoveredMinorUnits: 0, remainingMinorUnits: 1_080_000 });
  expect(view.candidates).toEqual([]);
  expect(await s.ledger()).toEqual(before);
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...args, idempotencyKey: "duplicate-replacement" }))
    .rejects.toMatchObject({ data: { code: "replacement_already_exists" } });
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...s.activate, idempotencyKey: "overlap" }))
    .rejects.toMatchObject({ data: { code: "expense_already_recovered" } });
});

test("replacement references reject missing, foreign-workspace and different-expense plans", async () => {
  const s = await setup();
  const other = await secondPlan(s);
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: other.id, idempotencyKey: "cancel-second" });
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...s.activate, replacesPlanId: other.id }))
    .rejects.toMatchObject({ data: { code: "replacement_expense_mismatch" } });
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...s.activate, replacesPlanId: "missing" }))
    .rejects.toMatchObject({ data: { code: "replacement_plan_not_found" } });
  await s.t.run(async ctx => {
    const id = ctx.db.normalizeId("savingsRecoveryPlans", other.id);
    if (!id) throw Error("Missing plan");
    const ws = await ctx.db.insert("workspaces", { functionalCurrency: "COP", kind: "Personal", chartOfAccountsTemplate: "co-puc-personal@1" });
    await ctx.db.patch(id, { workspaceId: ws });
  });
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...s.activate, replacesPlanId: other.id }))
    .rejects.toMatchObject({ data: { code: "replacement_plan_not_found" } });
});

test.each([false, true])("planning correction preserves journals and balances across locks, reattribute=%s", async reattribute => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const target = await secondPlan(s);
  const gift = await s.move(plan.id, "saved");
  vi.setSystemTime(octNow);
  await s.t.action(api.accounting.lockAccountingPeriod, { workspaceId: s.workspaceId, period: { year: 2026, month: 9 } });
  const before = await s.ledger();
  const args = { workspaceId: s.workspaceId, contributionId: gift.contribution.id, reason: "Wrong plan",
    ...(reattribute ? { targetPlanId: target.id } : {}), idempotencyKey: "correct" };
  const first = await s.t.action(api.savingsRecovery.correctContribution, args);
  expect(first.correction).toMatchObject({ contributionDate: "2026-09-18", recordedAt: octNow, createdBy: "owner-1", reason: "Wrong plan" });
  expect(first.replacementContribution?.amountMinorUnits).toBe(reattribute ? 230_000 : undefined);
  expect(await s.t.action(api.savingsRecovery.correctContribution, args)).toEqual({ ...first, replay: true });
  for (const changed of [{ reason: "Other" }, { targetPlanId: plan.id }, { contributionId: "missing" }])
    await expect(s.t.action(api.savingsRecovery.correctContribution, { ...args, ...changed }))
      .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await expect(s.t.action(api.savingsRecovery.correctContribution, { ...args, idempotencyKey: "second-correction" }))
    .rejects.toMatchObject({ data: { code: "contribution_already_corrected" } });
  const view = await s.read();
  expect(view.plans.find(p => p.id === plan.id)).toMatchObject({ recoveredMinorUnits: 0, remainingMinorUnits: 1_380_000, dueMinorUnits: 460_000,
    contributionHistory: [{ id: gift.contribution.id, status: "corrected", transferJournalEntryId: gift.transfer.id,
      contributionDate: "2026-09-18", recordedAt: gift.contribution.recordedAt, correction: first.correction }] });
  expect(view.plans.find(p => p.id === target.id)?.recoveredMinorUnits).toBe(reattribute ? 230_000 : 0);
  if (reattribute) expect(view.plans.find(p => p.id === target.id)?.contributionHistory[0]).toMatchObject({
    status: "active", transferJournalEntryId: gift.transfer.id, contributionDate: "2026-09-18", recordedAt: octNow,
    correctsContributionId: gift.contribution.id,
  });
  expect(await s.ledger()).toEqual(before);
  expect((await s.ledger()).entries).toHaveLength(before.entries.length);
  expect(await s.move(plan.id, "saved")).toEqual({ ...gift, replay: true });
});

test("a reversed contribution is void in history and cannot be corrected; cancelling does not erase it", async () => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const gift = await s.move(plan.id, "saved");
  await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: gift.transfer.id, idempotencyKey: "reverse-transfer" });
  await expect(s.t.action(api.savingsRecovery.correctContribution, { workspaceId: s.workspaceId, contributionId: gift.contribution.id, reason: "Wrong", idempotencyKey: "correct-void" }))
    .rejects.toMatchObject({ data: { code: "contribution_voided" } });
  expect((await s.read()).plans[0]).toMatchObject({ recoveredMinorUnits: 0,
    contributionHistory: [{ id: gift.contribution.id, status: "voided", transferReversed: true }] });
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey: "cancel" });
  expect((await s.read()).plans[0].contributionHistory).toHaveLength(1);
});

test("correction target must be active on the transfer date, in the workspace, with matching destination and capacity", async () => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const gift = await s.move(plan.id, "saved");
  const args = { workspaceId: s.workspaceId, contributionId: gift.contribution.id, reason: "Wrong", idempotencyKey: "correct" };
  await expect(s.t.action(api.savingsRecovery.correctContribution, { ...args, targetPlanId: plan.id })).rejects.toMatchObject({ data: { code: "correction_target_same_plan" } });
  await expect(s.t.action(api.savingsRecovery.correctContribution, { ...args, targetPlanId: "missing" })).rejects.toMatchObject({ data: { code: "plan_not_found" } });
  vi.setSystemTime(octNow);
  const target = await secondPlan(s);
  await expect(s.t.action(api.savingsRecovery.correctContribution, { ...args, targetPlanId: target.id })).rejects.toMatchObject({ data: { code: "transfer_predates_activation" } });
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: target.id, idempotencyKey: "cancel-target" });
  await expect(s.t.action(api.savingsRecovery.correctContribution, { ...args, targetPlanId: target.id })).rejects.toMatchObject({ data: { code: "plan_cancelled" } });
  for (const reason of [" ", "x".repeat(1001)]) await expect(s.t.action(api.savingsRecovery.correctContribution, { ...args, reason }))
    .rejects.toMatchObject({ data: { code: "reason_invalid" } });
  await expect(s.t.action(api.savingsRecovery.correctContribution, { ...args, contributionId: "missing" })).rejects.toMatchObject({ data: { code: "contribution_not_found" } });
  expect(await s.t.run(ctx => ctx.db.query("savingsRecoveryCorrections").collect())).toEqual([]);
});

test.each(["signed-out", "inactive", "stale", "revoked", "non-member"] as const)("Recovery lifecycle commands recheck authorization before replay, denial=%s", async denial => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const gift = await s.move(plan.id, "saved");
  const cancelArgs = { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey: "cancel" };
  const correctArgs = { workspaceId: s.workspaceId, contributionId: gift.contribution.id, reason: "Wrong", idempotencyKey: "correct" };
  await s.t.action(api.savingsRecovery.correctContribution, correctArgs);
  await s.t.action(api.savingsRecovery.cancelPlan, cancelArgs);
  const state = () => s.t.run(async ctx => ({
    plans: await ctx.db.query("savingsRecoveryPlans").collect(),
    contributions: await ctx.db.query("savingsRecoveryContributions").collect(),
    cancellations: await ctx.db.query("savingsRecoveryCancellations").collect(),
    corrections: await ctx.db.query("savingsRecoveryCorrections").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
  }));
  const before = await state();
  const session = { userId: s.providerSession.user_id, clerkSessionId: s.providerSession.id, clerkClientId: s.providerSession.client_id,
    verifiedAt: Date.now(), expiresAt: s.providerSession.expire_at, abandonsAt: s.providerSession.abandon_at };
  let code: string;
  if (denial === "inactive") { s.providerSession.status = "ended"; code = "session_inactive"; }
  else if (denial === "stale") { session.verifiedAt -= 5001; code = "session_verification_required"; }
  else if (denial === "revoked") { await s.root.run(ctx => ctx.db.patch(s.deviceId, { revokedAt: Date.now() })); code = "device_revoked"; }
  else if (denial === "non-member") {
    await s.root.run(async ctx => {
      const member = await ctx.db.query("workspaceMemberships").unique();
      if (!member) throw Error("Missing member");
      await ctx.db.delete(member._id);
    });
    code = "membership_required";
  } else code = "authentication_required";
  const client = denial === "signed-out" ? s.root : s.t;
  const calls = denial === "stale" ? [
    () => client.mutation(internal.savingsRecoveryWrites.cancelPlan, { ...cancelArgs, session }),
    () => client.mutation(internal.savingsRecoveryWrites.correctContribution, { ...correctArgs, session }),
    () => client.mutation(internal.savingsRecoveryWrites.activatePlan, { ...s.activate, session }),
  ] : [
    () => client.action(api.savingsRecovery.cancelPlan, cancelArgs),
    () => client.action(api.savingsRecovery.correctContribution, correctArgs),
    () => client.action(api.savingsRecovery.activatePlan, s.activate),
  ];
  if (denial === "revoked" || denial === "non-member") calls.push(
    () => client.mutation(internal.savingsRecoveryWrites.cancelPlan, { ...cancelArgs, session }),
    () => client.mutation(internal.savingsRecoveryWrites.correctContribution, { ...correctArgs, session }),
    () => client.mutation(internal.savingsRecoveryWrites.activatePlan, { ...s.activate, session }),
  );
  for (const call of calls) await expect(call()).rejects.toMatchObject({ data: { code } });
  expect(await state()).toEqual(before);
});

test("corrections can remove attribution from a cancelled plan and restore its candidate principal", async () => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const gift = await s.move(plan.id, "saved");
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey: "cancel" });
  expect((await s.read()).candidates[0].amountMinorUnits).toBe(1_000_000);
  await s.t.action(api.savingsRecovery.correctContribution, { workspaceId: s.workspaceId, contributionId: gift.contribution.id, reason: "Not recovery", idempotencyKey: "correct" });
  expect(await s.read()).toMatchObject({ candidates: [{ amountMinorUnits: 1_200_000 }],
    plans: [{ status: "cancelled", recoveredMinorUnits: 0, remainingMinorUnits: 0, dueMinorUnits: 0 }] });
});

test("pre-activation public contribution is rejected before posting money", async () => {
  const s = await setup();
  vi.setSystemTime(octNow);
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const before = await s.ledger();
  await expect(s.move(plan.id, "predates")).rejects.toMatchObject({ data: { code: "transfer_predates_activation" } });
  expect(await s.ledger()).toEqual(before);
});

test("lifecycle commands validate request keys and missing plan references without writes", async () => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const gift = await s.move(plan.id, "saved");
  const before = await s.ledger();
  for (const idempotencyKey of [" ", "x".repeat(201)]) {
    await expect(s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey }))
      .rejects.toMatchObject({ data: { code: "idempotency_key_invalid" } });
    await expect(s.t.action(api.savingsRecovery.correctContribution, { workspaceId: s.workspaceId, contributionId: gift.contribution.id, reason: "Wrong", idempotencyKey }))
      .rejects.toMatchObject({ data: { code: "idempotency_key_invalid" } });
  }
  await expect(s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: "missing", idempotencyKey: "missing" }))
    .rejects.toMatchObject({ data: { code: "plan_not_found" } });
  expect(await s.ledger()).toEqual(before);
  expect(await s.t.run(ctx => ctx.db.query("savingsRecoveryCancellations").collect())).toEqual([]);
  expect(await s.t.run(ctx => ctx.db.query("savingsRecoveryCorrections").collect())).toEqual([]);
});

async function cancelledWithReplacement(s: Awaited<ReturnType<typeof setup>>) {
  const { plan: original } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const gift = await s.move(original.id, "saved");
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: original.id, idempotencyKey: "cancel-original" });
  const { plan: replacement } = await s.t.action(api.savingsRecovery.activatePlan, {
    ...s.activate, replacesPlanId: original.id, installmentCount: 4, installmentMinorUnits: 250_000, idempotencyKey: "replacement",
  });
  expect(replacement.principalMinorUnits).toBe(1_000_000);
  return { original, gift, replacement };
}

test("correction cannot move a cancelled plan's contribution into a plan for the same expense", async () => {
  const s = await setup();
  const { original, gift, replacement } = await cancelledWithReplacement(s);
  const before = await s.ledger();
  const args = { workspaceId: s.workspaceId, contributionId: gift.contribution.id,
    reason: "Wrong plan", targetPlanId: replacement.id, idempotencyKey: "same-expense" };
  await expect(s.t.action(api.savingsRecovery.correctContribution, args))
    .rejects.toMatchObject({ data: { code: "correction_target_same_expense" } });
  expect(await s.t.run(ctx => ctx.db.query("savingsRecoveryCorrections").collect())).toEqual([]);
  expect((await s.read()).plans.find(p => p.id === original.id)).toMatchObject({ recoveredMinorUnits: 230_000 });
  const removed = await s.t.action(api.savingsRecovery.correctContribution, { ...args, targetPlanId: undefined });
  expect(removed).toMatchObject({ replay: false, correction: { contributionId: gift.contribution.id } });
  expect(await s.t.action(api.savingsRecovery.correctContribution, { ...args, targetPlanId: undefined }))
    .toEqual({ ...removed, replay: true });
  await expect(s.t.action(api.savingsRecovery.correctContribution, args))
    .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await s.ledger()).toEqual(before);
});

test.each(["reversal", "correction"])("released principal returns after the replacement completes following %s", async release => {
  const s = await setup();
  const { original, gift, replacement } = await cancelledWithReplacement(s);
  if (release === "reversal") {
    await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: gift.transfer.id, idempotencyKey: "void-old" });
  } else {
    await s.t.action(api.savingsRecovery.correctContribution, { workspaceId: s.workspaceId, contributionId: gift.contribution.id, reason: "Ordinary savings", idempotencyKey: "remove-old" });
  }
  expect((await s.read()).candidates).toEqual([]);
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...s.activate, installmentCount: 4, installmentMinorUnits: 50_000, idempotencyKey: "too-early" }))
    .rejects.toMatchObject({ data: { code: "expense_already_recovered" } });
  await s.move(replacement.id, "finish-replacement", 1_000_000);
  const view = await s.read();
  expect(view.plans.find(p => p.id === original.id)).toMatchObject({ status: "cancelled", recoveredMinorUnits: 0 });
  expect(view.plans.find(p => p.id === replacement.id)).toMatchObject({ status: "completed", recoveredMinorUnits: 1_000_000, remainingMinorUnits: 0 });
  expect(view.candidates).toMatchObject([{ journalEntryId: s.expenseId, amountMinorUnits: 200_000 }]);
  const { plan: remainder } = await s.t.action(api.savingsRecovery.activatePlan, {
    ...s.activate, installmentCount: 4, installmentMinorUnits: 50_000, idempotencyKey: "remainder",
  });
  expect(remainder.principalMinorUnits).toBe(200_000);
  expect((await s.read()).candidates).toEqual([]);
});

test("released principal returns when the unfinished replacement is cancelled", async () => {
  const s = await setup();
  const { gift, replacement } = await cancelledWithReplacement(s);
  await s.t.action(api.savingsRecovery.correctContribution, { workspaceId: s.workspaceId, contributionId: gift.contribution.id, reason: "Ordinary savings", idempotencyKey: "remove" });
  await s.move(replacement.id, "part", 250_000);
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: replacement.id, idempotencyKey: "cancel-replacement" });
  expect((await s.read()).candidates).toMatchObject([{ amountMinorUnits: 950_000 }]);
});

test.each(["reversal", "correction"])("a completed plan reopened by %s and a newer plan cannot reserve more than the expense", async release => {
  const s = await setup();
  const { gift, replacement } = await cancelledWithReplacement(s);
  const completed = await s.move(replacement.id, "finish", 1_000_000);
  await s.t.action(api.savingsRecovery.correctContribution, { workspaceId: s.workspaceId, contributionId: gift.contribution.id, reason: "Ordinary savings", idempotencyKey: "release-first" });
  const { plan: newer } = await s.t.action(api.savingsRecovery.activatePlan, {
    ...s.activate, installmentCount: 4, installmentMinorUnits: 50_000, idempotencyKey: "newer",
  });
  if (release === "reversal") {
    await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: completed.transfer.id, idempotencyKey: "void-completed" });
  } else {
    await s.t.action(api.savingsRecovery.correctContribution, { workspaceId: s.workspaceId, contributionId: completed.contribution.id, reason: "Wrong attribution", idempotencyKey: "remove-completed" });
  }
  const view = await s.read();
  expect(view.plans.find(p => p.id === replacement.id)).toMatchObject({ status: "active", principalMinorUnits: 1_000_000, remainingMinorUnits: 1_000_000 });
  expect(view.plans.find(p => p.id === newer.id)).toMatchObject({ status: "active", principalMinorUnits: 200_000, remainingMinorUnits: 200_000 });
  expect(view.plans.filter(p => p.status === "active").reduce((sum, p) => sum + p.principalMinorUnits, 0)).toBe(1_200_000);
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...s.activate, idempotencyKey: "overlap-reopened" }))
    .rejects.toMatchObject({ data: { code: "expense_already_recovered" } });
  await s.move(newer.id, "finish-newer", 200_000);
  expect((await s.read()).candidates).toEqual([]);
  await s.move(replacement.id, "refinish", 1_000_000);
  const finished = await s.read();
  expect(finished.plans.filter(p => p.status === "completed").map(p => p.principalMinorUnits).sort((a,b) => a-b)).toEqual([200_000, 1_000_000]);
  expect(finished.candidates).toEqual([]);
});

test.each(["2026-10-02T12:00:00Z", "2026-10-01T02:00:00Z"])("cancellation uses its workspace month and retains later history at %s", async eventTime => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  vi.setSystemTime(Date.parse(eventTime));
  const { cancellation } = await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey: "cancel-later" });
  const september = (await s.read("2026-09")).plans[0];
  const october = (await s.read("2026-10")).plans[0];
  expect(september).toMatchObject(eventTime === "2026-10-02T12:00:00Z"
    ? { status: "active", dueMinorUnits: 230_000, remainingMinorUnits: 1_380_000, cancellation }
    : { status: "cancelled", dueMinorUnits: 0, remainingMinorUnits: 0, cancellation });
  expect(october).toMatchObject({ status: "cancelled", dueMinorUnits: 0, remainingMinorUnits: 0, cancellation });
  expect((await s.read("2026-09")).candidates).toEqual(eventTime === "2026-10-02T12:00:00Z"
    ? [] : [expect.objectContaining({ journalEntryId: s.expenseId, amountMinorUnits: 1_200_000 })]);
  expect(september).toMatchObject({ canCancel: false, acceptsContributions: false });
});

test("all-time action facts agree with commands while month-scoped completion stays historical", async () => {
  const s = await setup();
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  expect((await s.read()).plans[0]).toMatchObject({ status: "active", canCancel: true, acceptsContributions: true });
  const future = await s.move(plan.id, "future-finish", 1_380_000, "2026-11-20");
  expect((await s.read("2026-09")).plans[0]).toMatchObject({ status: "active", recoveredMinorUnits: 0,
    dueMinorUnits: 230_000, canCancel: false, acceptsContributions: false });
  expect((await s.read("2026-11")).plans[0]).toMatchObject({ status: "completed", recoveredMinorUnits: 1_380_000,
    remainingMinorUnits: 0, canCancel: false, acceptsContributions: false });
  await expect(s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey: "cancel-complete-future" }))
    .rejects.toMatchObject({ data: { code: "plan_already_complete" } });
  const before = await s.ledger();
  await expect(s.move(plan.id, "more" )).rejects.toMatchObject({ data: { code: "plan_already_complete" } });
  expect(await s.ledger()).toEqual(before);
  await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: future.transfer.id, idempotencyKey: "void-future" });
  await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: s.expenseId, idempotencyKey: "void-source" });
  expect((await s.read()).plans[0]).toMatchObject({ status: "suspended", canCancel: true, acceptsContributions: false });
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey: "cancel-suspended-flags" });
  expect((await s.read()).plans[0]).toMatchObject({ status: "cancelled", canCancel: false, acceptsContributions: false });
});

test("replacement chains link omitted references and freeze independently calculated principals", async () => {
  const s = await setup();
  const { plan: a } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  await s.move(a.id, "a-part");
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: a.id, idempotencyKey: "cancel-a" });
  const bArgs = { ...s.activate, installmentCount: 4, installmentMinorUnits: 333_333, idempotencyKey: "b-inferred" };
  const b = await s.t.action(api.savingsRecovery.activatePlan, bArgs);
  expect(b.plan).toMatchObject({ principalMinorUnits: 1_000_000, replacesPlanId: a.id });
  expect(await s.t.action(api.savingsRecovery.activatePlan, bArgs)).toEqual({ ...b, replay: true });
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...bArgs, replacesPlanId: a.id }))
    .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await s.move(b.plan.id, "b-part", 333_333);
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: b.plan.id, idempotencyKey: "cancel-b" });
  const cArgs = { ...s.activate, installmentCount: 4, installmentMinorUnits: 200_000, idempotencyKey: "c-inferred" };
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...cArgs, replacesPlanId: a.id }))
    .rejects.toMatchObject({ data: { code: "replacement_already_exists" } });
  const c = await s.t.action(api.savingsRecovery.activatePlan, cArgs);
  expect(c.plan).toMatchObject({ principalMinorUnits: 750_000, replacesPlanId: b.plan.id });
  expect(await s.t.action(api.savingsRecovery.activatePlan, bArgs)).toEqual({ ...b, replay: true });
  const view = await s.read();
  expect(view.plans.find(p => p.id === a.id)).toMatchObject({ replacedByPlanId: b.plan.id });
  expect(view.plans.find(p => p.id === b.plan.id)).toMatchObject({ replacesPlanId: a.id, replacedByPlanId: c.plan.id });
});

test("cancellation floors a nondivisible recovered principal split by hand", async () => {
  const s = await setup();
  const expense = await s.t.action(api.accounting.recordCashExpense, {
    workspaceId: s.workspaceId, financialAccountProfileId: s.dailyId,
    amount: { currency: "COP", minorUnits: 1_001 }, accountingDate: "2026-09-10", description: "Rounding", idempotencyKey: "odd-expense",
  });
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, { ...s.activate,
    sourceJournalEntryId: expense.id, installmentCount: 4, installmentMinorUnits: 300, idempotencyKey: "odd-plan" });
  await s.move(plan.id, "odd-gift", 101);
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey: "odd-cancel" });
  expect((await s.read()).candidates.find(c => c.journalEntryId === expense.id)).toMatchObject({ amountMinorUnits: 917 });
});

test("stored pre-activation contributions remain readable, cancellable and correctable", async () => {
  const s = await setup();
  const transfer = await s.t.action(api.accounting.recordAccountTransfer, { workspaceId: s.workspaceId,
    sourceFinancialAccountProfileId: s.dailyId, destinationFinancialAccountProfileId: s.savingsId,
    amount: { currency: "COP", minorUnits: 230_000 }, accountingDate: "2026-09-10", description: "Historical saving", idempotencyKey: "historical-transfer" });
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  const contributionId = await s.t.run(async ctx => {
    const workspaceId = ctx.db.normalizeId("workspaces", s.workspaceId);
    const planId = ctx.db.normalizeId("savingsRecoveryPlans", plan.id);
    const transferJournalEntryId = ctx.db.normalizeId("journalEntries", transfer.id);
    if (!workspaceId || !planId || !transferJournalEntryId) throw Error("Invalid fixture IDs");
    return ctx.db.insert("savingsRecoveryContributions", { workspaceId, planId, transferJournalEntryId,
      amountMinorUnits: 230_000, contributionDate: "2026-09-10", idempotencyKey: "historical-gift", createdBy: "owner-1", recordedAt: Date.now() });
  });
  expect((await s.read()).plans[0]).toMatchObject({ recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000, dueMinorUnits: 0 });
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: plan.id, idempotencyKey: "historical-cancel" });
  expect((await s.read()).candidates).toMatchObject([{ amountMinorUnits: 1_000_000 }]);
  await s.t.action(api.savingsRecovery.correctContribution, { workspaceId: s.workspaceId, contributionId, reason: "Ordinary savings", idempotencyKey: "historical-correct" });
  expect((await s.read()).candidates).toMatchObject([{ amountMinorUnits: 1_200_000 }]);
  expect((await s.read()).plans[0]).toMatchObject({ recoveredMinorUnits: 0, contributionHistory: [{ status: "corrected", contributionDate: "2026-09-10" }] });
});

test("legacy linked and unlinked activation receipts preserve exact retry intent", async () => {
  const s = await setup();
  const { plan: a } = await s.t.action(api.savingsRecovery.activatePlan, s.activate);
  await s.move(a.id, "legacy-a-part");
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: a.id, idempotencyKey: "legacy-cancel-a" });
  const args = { ...s.activate, installmentCount: 4, installmentMinorUnits: 250_000, idempotencyKey: "legacy-unlinked" };
  const legacyId = await s.t.run(async ctx => {
    const id = ctx.db.normalizeId("savingsRecoveryPlans", a.id);
    const original = id && await ctx.db.get(id);
    if (!original) throw Error("Missing plan");
    const { _id, _creationTime, ...row } = original;
    return ctx.db.insert("savingsRecoveryPlans", { ...row, principalMinorUnits: 1_000_000,
      installmentCount: 4, installmentMinorUnits: 250_000, idempotencyKey: "legacy-unlinked" });
  });
  const legacy = await s.t.action(api.savingsRecovery.activatePlan, args);
  expect(legacy).toMatchObject({ replay: true, plan: { id: legacyId, principalMinorUnits: 1_000_000 } });
  expect(legacy.plan.replacesPlanId).toBeUndefined();
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...args, replacesPlanId: a.id }))
    .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: legacyId, idempotencyKey: "legacy-cancel-b" });
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...args, replacesPlanId: a.id, idempotencyKey: "stale-predecessor" }))
    .rejects.toMatchObject({ data: { code: "replacement_plan_not_latest" } });
  const linkedArgs = { ...args, replacesPlanId: legacyId, idempotencyKey: "legacy-linked" };
  const linked = await s.t.action(api.savingsRecovery.activatePlan, linkedArgs);
  expect(linked.plan).toMatchObject({ principalMinorUnits: 1_000_000, replacesPlanId: legacyId });
  expect(await s.t.action(api.savingsRecovery.activatePlan, linkedArgs)).toEqual({ ...linked, replay: true });
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...linkedArgs, replacesPlanId: undefined }))
    .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
});
