import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { AccountingTest } from "./convexHarness";

type Close = FunctionArgs<typeof api.accounting.closePlace>;
type Undo = FunctionArgs<typeof api.accounting.startUndoPlace>;
const closes = new WeakMap<AccountingTest, Map<string, Pick<Close, "reviewedBalance" | "reviewedAccountingDate">>>();
const undos = new WeakMap<AccountingTest, Map<string, string>>();

// Existing lifecycle tests review immediately before their first attempt, then retain committed request values for replay.
export async function submitClose(t: AccountingTest, args: Omit<Close, "reviewedBalance" | "reviewedAccountingDate"> & Partial<Pick<Close, "reviewedBalance" | "reviewedAccountingDate">>) {
  const cache = closes.get(t) ?? new Map();
  closes.set(t, cache);
  const key = JSON.stringify([args.workspaceId, args.idempotencyKey]);
  const closure = cache.get(key) ?? await t.query(api.accounting.placeClosure, { workspaceId: args.workspaceId, financialAccountProfileId: args.financialAccountProfileId }).then(read => ({ reviewedBalance: read.balance, reviewedAccountingDate: read.accountingDate }));
  const input = { ...closure, ...args };
  const result = await t.action(api.accounting.closePlace, input);
  cache.set(key, { reviewedBalance: input.reviewedBalance, reviewedAccountingDate: input.reviewedAccountingDate });
  return result;
}
export async function submitUndo(t: AccountingTest, args: Omit<Undo, "previewFingerprint"> & Partial<Pick<Undo, "previewFingerprint">>) {
  const cache = undos.get(t) ?? new Map();
  undos.set(t, cache);
  const key = JSON.stringify([args.workspaceId, args.idempotencyKey]);
  const fingerprint = cache.get(key) ?? (await t.query(api.accounting.previewUndoPlace, { workspaceId: args.workspaceId, financialAccountProfileId: args.financialAccountProfileId })).fingerprint;
  const input = { previewFingerprint: fingerprint, ...args };
  const result = await t.action(api.accounting.startUndoPlace, input);
  cache.set(key, input.previewFingerprint);
  return result;
}
