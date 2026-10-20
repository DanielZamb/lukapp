import { expect, test } from "vitest";
import { activatePlan } from "./activatePlan";
import { evaluateWorkspace } from "./evaluate";
import { recordContribution } from "./recordContribution";
import { recordRecoveryMove, type PostRecoveryTransfer } from "./recordRecoveryMove";
import { RecoveryError } from "./policy";
import type {
  RecoveryContribution,
  RecoveryLedgerEntry,
  RecoveryPlan,
  RecoveryProfile,
  RecoveryWriteStore,
} from "./types";

function memory() {
  const plans: RecoveryPlan[] = [];
  const contributions: RecoveryContribution[] = [];
  const entries = new Map<string, RecoveryLedgerEntry>();
  const reversals = new Map<string, string>();
  const profiles: RecoveryProfile[] = [
    { id: "daily", workspaceId: "ws", name: "Daily", productKind: "bankAccount" },
    { id: "savings", workspaceId: "ws", name: "Savings", productKind: "savingsAccount" },
  ];
  let next = 1;
  const store: RecoveryWriteStore = {
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
      contributions.find((contribution) => contribution.idempotencyKey === key) ?? null,
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
