import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { convexReadStore } from "./store";
import { listPostedExpenses } from "../src/accounting/queries/listPostedExpenses";
import { balances } from "../src/accounting/queries/balances";
import type { Plan, RecoveryEvent, RecoveryLedger, RecoveryReadStore, RecoveryStore } from "../src/savingsRecovery/types";

function toPlan({ _id, _creationTime, ...fields }: Doc<"recoveryPlans">): Plan { return { id: _id, ...fields }; }
function toEvent({ _id, _creationTime, ...fields }: Doc<"recoveryEvents">): RecoveryEvent { return { id: _id, ...fields }; }
export function recoveryLedger(db: QueryCtx["db"]): RecoveryLedger {
  const store = convexReadStore(db);
  return {
    getWorkspace: store.getWorkspace, membershipRole: store.membershipRole,
    getJournalEntry: store.getJournalEntry, findReversalOf: store.findReversalOf,
    listJournalSourceEffects: store.listJournalSourceEffects,
    listAccountTransferEntriesInRange: store.listAccountTransferEntriesInRange,
    getProfile: store.getProfile, getLedgerAccount: store.getLedgerAccount, getAccountingPeriod: store.getAccountingPeriod,
    expenses: input => listPostedExpenses(store, input), balances: input => balances(store, input),
  };
}
export function recoveryReadStore(db: QueryCtx["db"]): RecoveryReadStore {
  return {
    async snapshot(workspaceId) {
      const [plans, events] = await Promise.all([
        db.query("recoveryPlans").withIndex("by_workspace", q => q.eq("workspaceId", workspaceId)).collect(),
        db.query("recoveryEvents").withIndex("by_workspace", q => q.eq("workspaceId", workspaceId)).collect(),
      ]);
      return { plans: plans.map(toPlan), events: events.map(toEvent) };
    },
    async receipt(workspaceId, key) {
      const receipt = await db.query("recoveryReceipts").withIndex("by_workspace_key", q => q.eq("workspaceId", workspaceId).eq("key", key)).unique();
      return receipt ? { fingerprint: receipt.fingerprint, resultId: receipt.resultId } : undefined;
    },
  };
}
export function recoveryStore(db: MutationCtx["db"]): RecoveryStore {
  return {
    ...recoveryReadStore(db),
    insertPlan: plan => db.insert("recoveryPlans", plan),
    async updatePlan({ id, ...plan }) {
      const normalized = db.normalizeId("recoveryPlans", id);
      if (!normalized) throw new Error("Invalid Recovery plan id");
      await db.replace(normalized, plan);
    },
    appendEvent: event => db.insert("recoveryEvents", event),
    async saveReceipt(workspaceId, key, receipt) { await db.insert("recoveryReceipts", { workspaceId, key, ...receipt }); },
  };
}
