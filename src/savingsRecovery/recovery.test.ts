import { expect, test } from "vitest";
import { activatePlan } from "./activatePlan";
import { evaluateWorkspace } from "./evaluate";
import { recordContribution } from "./recordContribution";
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
    recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000, dueMinorUnits: 230_000,
  });
  s.put({
    id: "rev-1", workspaceId: "ws", policy: "reversal@1", description: "Reversal",
    accountingDate: "2026-09-19", amountMinorUnits: 230_000, reversesEntryId: transfer.id,
  });
  expect((await s.read()).plans[0]).toMatchObject({
    recoveredMinorUnits: 0, remainingMinorUnits: 1_380_000, dueMinorUnits: 230_000,
  });
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
