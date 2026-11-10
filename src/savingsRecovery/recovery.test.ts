import { cancelPlan } from "./cancelPlan";
import { correctContribution } from "./correctContribution";
import { expect, test } from "vitest";
import { activatePlan } from "./activatePlan";
import { evaluateWorkspace } from "./evaluate";
import { recordContribution } from "./recordContribution";
import { recordRecoveryMove, type PostRecoveryTransfer } from "./recordRecoveryMove";
import { RecoveryError } from "./policy";
import type {
  RecoveryCancellation,
  RecoveryCorrection,
  RecoveryContribution,
  RecoveryLedgerEntry,
  RecoveryPlan,
  RecoveryProfile,
  RecoveryWriteStore,
} from "./types";

function memory() {
  const plans: RecoveryPlan[] = [];
  const cancellations: RecoveryCancellation[] = [];
  const corrections: RecoveryCorrection[] = [];
  const contributions: RecoveryContribution[] = [];
  const entries = new Map<string, RecoveryLedgerEntry>();
  const reversals = new Map<string, string>();
  const profiles: RecoveryProfile[] = [
    { id: "daily", workspaceId: "ws", name: "Daily", productKind: "bankAccount" },
    { id: "savings", workspaceId: "ws", name: "Savings", productKind: "savingsAccount" },
  ];
  let next = 1;
  const store: RecoveryWriteStore = {
    listCancellations: async () => cancellations,
    listCorrections: async () => corrections,
    insertCancellation: async item => { const saved = { ...item, id: 'cancel-' + next++ }; cancellations.push(saved); return saved; },
    insertCorrection: async item => { const saved = { ...item, id: 'correct-' + next++ }; corrections.push(saved); return saved; },
    functionalCurrency: async () => "COP",
    timeZone: async () => "America/Bogota",
    listPlans: async () => plans,
    listContributions: async () => contributions,
    listProfiles: async () => profiles,
    getEntry: async (id) => entries.get(id) ?? null,
    findReversalOf: async (id) => {
      const reversalId = reversals.get(id);
      return reversalId ? entries.get(reversalId) ?? null : null;
    },
    listExpenseEntries: async () => [...entries.values()].filter((entry) =>
      entry.policy === "cash-expense@1" && !entry.reversesEntryId && !reversals.has(entry.id)),
    findPlanRequest: async (key) => plans.find((plan) => plan.idempotencyKey === key) ?? null,
    findContributionRequest: async (key) =>
      contributions.find((contribution) => contribution.idempotencyKey === key && !contribution.correctsContributionId) ?? null,
    insertPlan: async (plan) => {
      const saved = { ...plan, id: `plan-${next++}` };
      plans.push(saved);
      return saved;
    },
    insertContribution: async (contribution) => {
      const saved = { ...contribution, id: `gift-${next++}` };
      contributions.push(saved);
      return saved;
    },
  };
  function put(entry: RecoveryLedgerEntry) {
    entries.set(entry.id, entry);
    if (entry.reversesEntryId) reversals.set(entry.reversesEntryId, entry.id);
    return entry;
  }
  const expense = put({
    id: "exp-laptop", workspaceId: "ws", policy: "cash-expense@1",
    description: "Laptop repair", accountingDate: "2026-09-09", amountMinorUnits: 1_200_000,
    financialAccountProfileId: "daily",
  });
  return {
    store, expense, profiles,
    put,
    activate: (patch?: Partial<Parameters<typeof activatePlan>[1]>) => activatePlan(store, {
      workspaceId: "ws", sourceJournalEntryId: expense.id, destinationFinancialAccountProfileId: "savings",
      installmentCount: 6, installmentMinorUnits: 230_000, idempotencyKey: "activate-1",
      actorId: "owner", now: Date.UTC(2026, 8, 17), ...patch,
    }),
    contribute: (transferId: string, key = "gift-1") => recordContribution(store, {
      workspaceId: "ws", planId: plans[0]?.id ?? "missing", transferJournalEntryId: transferId,
      idempotencyKey: key, actorId: "owner", now: Date.UTC(2026, 8, 18),
    }),
    read: () => evaluateWorkspace(store, { now: Date.UTC(2026, 8, 17) }),
    transfer: (id = "xfer-1", amount = 230_000) => put({
      id, workspaceId: "ws", policy: "account-transfer@1", description: "Recovery: Laptop repair",
      accountingDate: "2026-09-18", amountMinorUnits: amount, financialAccountProfileId: "daily",
      destinationFinancialAccountProfileId: "savings",
    }),
  };
}

test("activating a plan freezes the edited suggestion and does not post money", async () => {
  const s = memory();
  const first = await s.activate();
  expect(first).toMatchObject({
    replay: false,
    plan: {
      title: "Laptop repair", principalMinorUnits: 1_200_000, installmentCount: 6,
      installmentMinorUnits: 230_000, impliedAnnualRateBps: expect.any(Number),
      activationMonth: "2026-09",
    },
  });
  expect(first.plan.impliedAnnualRateBps).toBeGreaterThan(0);
  expect(await s.activate()).toEqual({ ...first, replay: true });
  expect((await s.read()).plans).toMatchObject([{
    recoveredMinorUnits: 0, remainingMinorUnits: 1_380_000, dueMinorUnits: 230_000,
    targetMinorUnits: 1_380_000,
  }]);
  expect((await s.read()).candidates.map((candidate) => candidate.journalEntryId)).toEqual([]);
});

test("a contribution counts a posted transfer and a reversed transfer lowers progress", async () => {
  const s = memory();
  await s.activate();
  const transfer = s.transfer();
  const gift = await s.contribute(transfer.id);
  expect(gift).toMatchObject({
    replay: false,
    contribution: { transferJournalEntryId: transfer.id, amountMinorUnits: 230_000, contributionDate: "2026-09-18" },
  });
  expect(await s.contribute(transfer.id)).toEqual({ ...gift, replay: true });
  expect((await s.read()).plans[0]).toMatchObject({
    recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000, dueMinorUnits: 0,
  });
  expect((await evaluateWorkspace(s.store, { now: Date.UTC(2026, 9, 17), month: "2026-10" })).plans[0])
    .toMatchObject({ dueMinorUnits: 230_000, recoveredMinorUnits: 230_000 });
  expect((await evaluateWorkspace(s.store, { now: Date.UTC(2026, 7, 17), month: "2026-08" })).plans[0])
    .toMatchObject({ dueMinorUnits: 0 });
  s.put({
    id: "rev-1", workspaceId: "ws", policy: "reversal@1", description: "Reversal",
    accountingDate: "2026-09-19", amountMinorUnits: 230_000, reversesEntryId: transfer.id,
  });
  expect((await s.read()).plans[0]).toMatchObject({
    recoveredMinorUnits: 0, remainingMinorUnits: 1_380_000, dueMinorUnits: 230_000,
  });
  expect((await evaluateWorkspace(s.store, { now: Date.UTC(2026, 9, 17), month: "2026-10" })).plans[0])
    .toMatchObject({ recoveredMinorUnits: 0, dueMinorUnits: 460_000 });
  expect(await s.store.listContributions()).toHaveLength(1);
});

test("idempotent retries replay and changed keys or reused transfers are rejected", async () => {
  const s = memory();
  await s.activate();
  await expect(s.activate({
    installmentMinorUnits: 300_000, idempotencyKey: "activate-1",
  })).rejects.toBeInstanceOf(RecoveryError);
  const first = s.transfer("xfer-a", 230_000);
  await s.contribute(first.id, "gift-a");
  await expect(s.contribute("xfer-missing", "gift-a")).rejects.toMatchObject({ code: "idempotency_key_conflict" });
  await expect(s.contribute(first.id, "gift-b")).rejects.toMatchObject({ code: "transfer_already_attributed" });
  s.put({
    id: "income-1", workspaceId: "ws", policy: "cash-income@1", description: "Salary",
    accountingDate: "2026-09-01", amountMinorUnits: 230_000,
  });
  await expect(s.contribute("income-1", "gift-c")).rejects.toMatchObject({ code: "transfer_not_found" });
});

test("only an asset-to-asset transfer into the plan destination counts", async () => {
  const s = memory();
  s.profiles.push({ id: "card", workspaceId: "ws", name: "Card", productKind: "creditCard" });
  await expect(s.activate({
    destinationFinancialAccountProfileId: "card", idempotencyKey: "activate-card",
  })).rejects.toMatchObject({ code: "destination_must_be_asset" });
  await s.activate();
  s.transfer("xfer-card", 230_000);
  s.put({
    id: "xfer-card", workspaceId: "ws", policy: "account-transfer@1",
    description: "Pay card", accountingDate: "2026-09-18", amountMinorUnits: 230_000,
    financialAccountProfileId: "card", destinationFinancialAccountProfileId: "savings",
  });
  await expect(s.contribute("xfer-card")).rejects.toMatchObject({ code: "source_must_be_asset" });
});

test("a reversed source cannot accept a new contribution or post a recovery transfer", async () => {
  const s = memory();
  const { plan } = await s.activate();
  const transfer = s.transfer();
  s.put({
    id: "reverse-expense", workspaceId: "ws", policy: "reversal@1", description: "Correction",
    accountingDate: "2026-09-19", amountMinorUnits: s.expense.amountMinorUnits,
    reversesEntryId: s.expense.id,
  });
  await expect(s.contribute(transfer.id)).rejects.toMatchObject({ code: "expense_not_recoverable" });
  let posts = 0;
  await expect(recordRecoveryMove(s.store, async () => {
    posts++;
    return { id: transfer.id, amountMinorUnits: transfer.amountMinorUnits, accountingDate: transfer.accountingDate };
  }, {
    workspaceId: "ws", planId: plan.id, sourceFinancialAccountProfileId: "daily",
    amount: { currency: "COP", minorUnits: 230_000 }, accountingDate: "2026-09-20",
    description: "Recovery", idempotencyKey: "blocked-move", actorId: "owner", now: Date.UTC(2026, 8, 20),
  })).rejects.toMatchObject({ code: "expense_not_recoverable" });
  expect(posts).toBe(0);
  expect(await s.store.listContributions()).toEqual([]);
});

test("a crash after the transfer posts retries the same pair under one key", async () => {
  const s = memory();
  await s.activate();
  const posted = new Map<string, { id: string; amountMinorUnits: number; accountingDate: string }>();
  const postTransfer: PostRecoveryTransfer = async (input) => {
    const prior = posted.get(input.idempotencyKey);
    if (prior) return prior;
    const entry = s.transfer(`xfer-${posted.size + 1}`, input.amount.minorUnits);
    const receipt = { id: entry.id, amountMinorUnits: entry.amountMinorUnits, accountingDate: entry.accountingDate };
    posted.set(input.idempotencyKey, receipt);
    return receipt;
  };
  const insert = s.store.insertContribution;
  let crash = true;
  s.store.insertContribution = async (contribution) => {
    if (crash) { crash = false; throw new Error("crash between steps"); }
    return insert(contribution);
  };
  const input = {
    workspaceId: "ws", planId: (await s.store.listPlans())[0].id,
    sourceFinancialAccountProfileId: "daily",
    amount: { currency: "COP", minorUnits: 230_000 },
    accountingDate: "2026-09-18", description: "Recovery: Laptop repair",
    idempotencyKey: "move-1", actorId: "owner", now: Date.UTC(2026, 8, 18),
  };
  await expect(recordRecoveryMove(s.store, postTransfer, input)).rejects.toThrow("crash between steps");
  const first = await recordRecoveryMove(s.store, postTransfer, input);
  const replay = await recordRecoveryMove(s.store, postTransfer, input);
  expect(posted.size).toBe(1);
  expect(first).toMatchObject({
    replay: false,
    transfer: { id: "xfer-1", amountMinorUnits: 230_000 },
    contribution: { transferJournalEntryId: "xfer-1", amountMinorUnits: 230_000 },
  });
  expect(replay).toEqual({ ...first, replay: true });
  expect(await s.store.listContributions()).toHaveLength(1);
});

function cancelInput(planId: string, key = "cancel") {
  return { workspaceId: "ws", planId, idempotencyKey: key, actorId: "owner", now: Date.UTC(2026, 8, 20) };
}
function correctInput(contributionId: string, targetPlanId?: string) {
  return { workspaceId: "ws", contributionId, targetPlanId, reason: "Wrong attribution", idempotencyKey: "correct", actorId: "owner", now: Date.UTC(2026, 9, 2) };
}

async function anotherPlan(s: ReturnType<typeof memory>, id = "expense-2", amount = 1_200_000) {
  s.put({ ...s.expense, id, amountMinorUnits: amount });
  return (await s.activate({ sourceJournalEntryId: id, idempotencyKey: id, installmentMinorUnits: amount / 6 })).plan;
}

test("cancellation releases principal without unpaid premium, including after correction or reversal", async () => {
  const s = memory();
  const { plan } = await s.activate();
  s.transfer();
  const gift = await s.contribute("xfer-1");
  const first = await cancelPlan(s.store, cancelInput(plan.id));
  expect(await cancelPlan(s.store, cancelInput(plan.id))).toEqual({ ...first, replay: true });
  expect((await s.read()).candidates).toMatchObject([{ amountMinorUnits: 1_000_000 }]);
  await correctContribution(s.store, correctInput(gift.contribution.id));
  expect((await s.read()).candidates).toMatchObject([{ amountMinorUnits: 1_200_000 }]);
  expect((await s.read()).plans[0]).toMatchObject({ status: "cancelled", remainingMinorUnits: 0, dueMinorUnits: 0, recoveredMinorUnits: 0 });
  const replacement = await s.activate({ replacesPlanId: plan.id, idempotencyKey: "replace", installmentMinorUnits: 200_000 });
  expect(replacement.plan.principalMinorUnits).toBe(1_200_000);
  await expect(cancelPlan(s.store, { ...cancelInput(plan.id), planId: replacement.plan.id }))
    .rejects.toMatchObject({ code: "idempotency_key_conflict" });
  await expect(cancelPlan(s.store, cancelInput(plan.id, "other"))).rejects.toMatchObject({ code: "plan_already_cancelled" });
});

test("partial transfer capacity can be shared, corrected, and reused without exceeding the real transfer", async () => {
  const s = memory();
  const { plan } = await s.activate({ installmentMinorUnits: 200_000 });
  const target = await anotherPlan(s);
  s.transfer("large", 1_300_000);
  const gift = await s.contribute("large");
  expect(gift.contribution.amountMinorUnits).toBe(1_200_000);
  const shared = await recordContribution(s.store, { ...cancelInput(target.id, "shared"), transferJournalEntryId: "large" });
  expect(shared.contribution.amountMinorUnits).toBe(100_000);
  await expect(recordContribution(s.store, { ...cancelInput(target.id, "over-capacity"), transferJournalEntryId: "large" }))
    .rejects.toMatchObject({ code: "transfer_already_attributed" });
  const correction = await correctContribution(s.store, correctInput(gift.contribution.id));
  expect(await correctContribution(s.store, correctInput(gift.contribution.id))).toEqual({ ...correction, replay: true });
  const reused = await recordContribution(s.store, { ...cancelInput(target.id, "reused"), transferJournalEntryId: "large" });
  expect(reused.contribution.amountMinorUnits).toBe(1_100_000);
  expect((await s.read()).plans.find(p => p.id === plan.id)?.recoveredMinorUnits).toBe(0);
  expect((await s.read()).plans.find(p => p.id === target.id)?.recoveredMinorUnits).toBe(1_200_000);
  expect(await s.contribute("large")).toEqual({ ...gift, replay: true });
});

test("correction rejects completed, suspended, wrong-destination and pre-activation targets without appending", async () => {
  const s = memory();
  const { plan } = await s.activate();
  const small = await anotherPlan(s, "small", 120_000);
  s.transfer();
  const gift = await s.contribute("xfer-1");
  const input = correctInput(gift.contribution.id, small.id);
  await expect(correctContribution(s.store, input)).rejects.toMatchObject({ code: "correction_exceeds_plan_remaining" });
  const target = await anotherPlan(s);
  s.put({ id: "reverse-source", workspaceId: "ws", policy: "reversal@1", description: "Reversal", accountingDate: "2026-09-19", amountMinorUnits: 1_200_000, reversesEntryId: target.sourceJournalEntryId });
  await expect(correctContribution(s.store, { ...input, targetPlanId: target.id })).rejects.toMatchObject({ code: "expense_not_recoverable" });
  s.profiles.push({ id: "elsewhere", workspaceId: "ws", name: "Elsewhere", productKind: "savingsAccount" });
  s.put({ ...s.expense, id: "third" });
  const wrong = await s.activate({ sourceJournalEntryId: "third", destinationFinancialAccountProfileId: "elsewhere", idempotencyKey: "third" });
  await expect(correctContribution(s.store, { ...input, targetPlanId: wrong.plan.id })).rejects.toMatchObject({ code: "transfer_destination_mismatch" });
  expect(await s.store.listCorrections()).toEqual([]);
  expect((await s.store.listContributions()).map(c => c.id)).toEqual([gift.contribution.id]);
  expect((await s.read()).plans.find(p => p.id === plan.id)?.recoveredMinorUnits).toBe(230_000);
});

test("correction chains retain each attribution and a later ledger reversal voids the active replacement", async () => {
  const s = memory();
  await s.activate();
  const target = await anotherPlan(s);
  s.transfer();
  const original = await s.contribute("xfer-1");
  const first = await correctContribution(s.store, correctInput(original.contribution.id, target.id));
  if (!first.replacementContribution) throw Error("Missing replacement");
  const third = await anotherPlan(s, "third");
  const second = await correctContribution(s.store, { ...correctInput(first.replacementContribution.id, third.id), idempotencyKey: "correct-again" });
  expect(second.replacementContribution?.amountMinorUnits).toBe(230_000);
  expect(await correctContribution(s.store, correctInput(original.contribution.id, target.id))).toEqual({ ...first, replay: true });
  s.put({ id: "reverse-transfer", workspaceId: "ws", policy: "reversal@1", description: "Reversal", accountingDate: "2026-10-02", amountMinorUnits: 230_000, reversesEntryId: "xfer-1" });
  const view = await s.read();
  expect(view.plans.map(p => p.recoveredMinorUnits)).toEqual([0, 0, 0]);
  expect(view.plans.flatMap(p => p.contributionHistory).map(c => c.status).sort()).toEqual(["corrected", "corrected", "voided"]);
});

test("late recording cannot claim a transfer before the plan's activation date in its timezone", async () => {
  const s = memory();
  await s.activate({ now: Date.parse("2026-09-19T02:00:00Z") });
  s.transfer();
  expect((await s.contribute("xfer-1")).contribution.amountMinorUnits).toBe(230_000);
  const late = memory();
  await late.activate({ now: Date.parse("2026-09-19T05:00:00Z") });
  late.transfer();
  await expect(late.contribute("xfer-1")).rejects.toMatchObject({ code: "transfer_predates_activation" });
});

test("re-attribution refuses a transfer whose existing active claims already exceed its capacity", async () => {
  const s = memory();
  await s.activate();
  const target = await anotherPlan(s);
  s.transfer();
  const gift = await s.contribute("xfer-1");
  await s.store.insertContribution({ ...gift.contribution, planId: target.id, amountMinorUnits: 1, idempotencyKey: "legacy-extra" });
  await expect(correctContribution(s.store, correctInput(gift.contribution.id, target.id)))
    .rejects.toMatchObject({ code: "transfer_capacity_exceeded" });
  expect(await s.store.listCorrections()).toEqual([]);
  expect(await s.store.listContributions()).toHaveLength(2);
});
