import { RecoveryError } from "../src/savingsRecovery/policy";
import { run } from "./accountingErrors";
import { ConvexError, v, type Infer } from "convex/values";
import { internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { convexReadStore, convexStore } from "./store";
import { AccountingError } from "../src/accounting/errors";
import { reversePostedEntry } from "../src/accounting/commands/reversePostedEntry";
import { calendarDate, workspaceTimeZone } from "../src/accounting/timeZone";
import { periodFromAccountingDate } from "../src/accounting/period";
import { placeClosure } from "../src/accounting/commands/closePlace";
import { placeClosingServices, placeClosureServices } from "./accountingPlaces";
import { contributedExpensePlans } from "../src/savingsRecovery/placeUndoBlockers";
import { cancelReopenedPlans } from "../src/savingsRecovery/cancelReopenedPlans";
import { recoveryReadStore, recoveryWriteStore } from "./savingsRecoveryStore";
import { requireSelectableDefaultPlace } from "../src/accounting/commands/chooseDefaultPlace";
import type { Actor, StoredJournalEntry } from "../src/accounting/types";
import { undoPlace, undoOperation, undoReceipt, type undoBlocker } from "./accountingUndoValues";

export const UNDO_BATCH_SIZE = 20;
const RETRY_MS = 60_000;
function view(doc: Doc<"placeUndoOperations">): Infer<typeof undoOperation> {
  const { _id, _creationTime, ...operation } = doc;
  return { id: _id, ...operation };
}
export async function operationForPlace(ctx: QueryCtx, profileId: string) {
  const id = ctx.db.normalizeId("financialAccountProfiles", profileId);
  return id ? ctx.db.query("placeUndoOperations").withIndex("by_profile", q => q.eq("financialAccountProfileId", id)).unique() : null;
}
export async function readUndoStatus(ctx: QueryCtx, workspaceId: string, profileId: string) {
  const profile = await convexReadStore(ctx.db).getProfile(profileId);
  if (!profile || profile.workspaceId !== workspaceId) throw new AccountingError("financial_account_profile_not_found");
  const operation = await operationForPlace(ctx, profileId);
  return operation ? view(operation) : null;
}
async function undoContext(ctx: QueryCtx, actor: Actor, args: { workspaceId: string; financialAccountProfileId: string }) {
  const store = convexReadStore(ctx.db);
  const closure = await placeClosure(store, { now: () => new Date() }, placeClosureServices(ctx, actor, args.workspaceId), { ...args, actor });
  const blockers: Infer<typeof undoBlocker>[] = [...closure.blockers];
  const plans = await contributedExpensePlans(recoveryReadStore(ctx, args.workspaceId), args.financialAccountProfileId);
  if (plans.length) blockers.push({ code: "place_recovery_covered_expenses", plans });
  if ((await store.getAccountingPeriod(args.workspaceId, periodFromAccountingDate(closure.accountingDate)))?.status === "locked")
    blockers.push({ code: "place_undo_current_period_locked" });
  return { closure, blockers };
}
async function pageLines(ctx: QueryCtx, profile: { workspaceId: Id<"workspaces">; postingAccountId: Id<"ledgerAccounts"> }, cursor: string | null) {
  return ctx.db.query("journalLines").withIndex("by_workspace_account", q => q.eq("workspaceId", profile.workspaceId).eq("ledgerAccountId", profile.postingAccountId))
    .paginate({ cursor, numItems: UNDO_BATCH_SIZE });
}
function isRepresentative(entry: StoredJournalEntry, line: Doc<"journalLines">) {
  return !entry.reversesEntryId && entry.lines.findIndex(item => item.ledgerAccountId === line.ledgerAccountId) === line.lineNumber;
}
export async function previewUndo(ctx: QueryCtx, actor: Actor, args: { workspaceId: string; financialAccountProfileId: string; cursor?: string | null }) {
  const { closure, blockers } = await undoContext(ctx, actor, args);
  const profileId = ctx.db.normalizeId("financialAccountProfiles", args.financialAccountProfileId);
  const profile = profileId && await ctx.db.get(profileId);
  if (!profile) throw new AccountingError("financial_account_profile_not_found");
  const page = await pageLines(ctx, profile, args.cursor ?? null);
  const store = convexReadStore(ctx.db);
  const profiles = await store.listProfiles(args.workspaceId);
  const accounts = new Map((await store.listLedgerAccounts(args.workspaceId)).map(a => [a.id, a]));
  const deltas = new Map<string, number>();
  let entriesToReverse = 0, alreadyReversed = 0, lockedMonthEntries = 0, expense = 0, income = 0;
  for (const line of page.page) {
    const entry = await store.getJournalEntry(line.journalEntryId);
    if (!entry) throw new AccountingError("journal_entry_not_found");
    if (!isRepresentative(entry, line)) continue;
    if (await store.findReversalOf(entry.id)) { alreadyReversed++; continue; }
    entriesToReverse++;
    if ((await store.getAccountingPeriod(args.workspaceId, entry.period))?.status === "locked") lockedMonthEntries++;
    for (const item of entry.lines) {
      const account = accounts.get(item.ledgerAccountId);
      const reverseDebit = item.creditMinorUnits - item.debitMinorUnits;
      if (account?.nature === "Expense") expense += reverseDebit;
      if (account?.nature === "Revenue") income -= reverseDebit;
      const other = profiles.find(p => p.id !== profile._id && p.postingAccountId === item.ledgerAccountId);
      if (other) deltas.set(other.id, (deltas.get(other.id) ?? 0) + (account?.normalSide === "Debit" ? reverseDebit : -reverseDebit));
    }
  }
  const currency = closure.balance.currency;
  return { closure, canUndo: blockers.length === 0, blockers,
    operation: await readUndoStatus(ctx, args.workspaceId, args.financialAccountProfileId),
    page: { entriesToReverse, alreadyReversed, lockedMonthEntries,
      otherPlaces: profiles.filter(p => deltas.has(p.id)).map(p => ({ financialAccountProfileId: p.id, name: p.name, balanceChange: { currency, minorUnits: deltas.get(p.id) ?? 0 } })),
      currentMonthExpenseChange: { currency, minorUnits: expense }, currentMonthIncomeChange: { currency, minorUnits: income },
      scannedLines: page.page.length, isDone: page.isDone, continueCursor: page.continueCursor } };
}
const undoInput = v.object(undoPlace);
export async function startUndo(ctx: MutationCtx, actor: Actor, args: Infer<typeof undoInput>): Promise<Infer<typeof undoReceipt>> {
  if (!args.idempotencyKey.trim()) throw new AccountingError("idempotency_key_required");
  const workspaceId = ctx.db.normalizeId("workspaces", args.workspaceId);
  if (!workspaceId) throw new AccountingError("workspace_membership_required");
  const request = JSON.stringify({ act: "undo", financialAccountProfileId: args.financialAccountProfileId,
    replacementDefaultFinancialAccountProfileId: args.replacementDefaultFinancialAccountProfileId ?? null });
  const prior = await ctx.db.query("placeUndoOperations").withIndex("by_workspace_request", q => q.eq("workspaceId", workspaceId).eq("idempotencyKey", args.idempotencyKey)).unique();
  if (prior) {
    if (prior.request !== request) throw new AccountingError("idempotency_key_conflict");
    return { operation: view(prior), replay: true };
  }
  const context = await undoContext(ctx, actor, args);
  if (context.blockers[0]) throw new AccountingError(context.blockers[0].code);
  const replacement = args.replacementDefaultFinancialAccountProfileId;
  if (context.closure.isDefault && !replacement) throw new AccountingError("place_default_replacement_required");
  if (replacement !== undefined) {
    if (!context.closure.isDefault || replacement === args.financialAccountProfileId) throw new AccountingError("place_default_replacement_invalid");
    await requireSelectableDefaultPlace(convexStore(ctx.db), { actor, workspaceId: args.workspaceId, financialAccountProfileId: replacement });
    await placeClosingServices(ctx, actor, args.workspaceId).replaceDefault(replacement, `place-undo-default:${args.idempotencyKey}`);
  }
  const profileId = ctx.db.normalizeId("financialAccountProfiles", args.financialAccountProfileId);
  if (!profileId) throw new AccountingError("financial_account_profile_not_found");
  const fields = { workspaceId, financialAccountProfileId: profileId, idempotencyKey: args.idempotencyKey,
    request, authorizedBy: actor.userId, startedAt: Date.now(),
    ...(replacement !== undefined ? { replacementDefaultFinancialAccountProfileId: replacement } : {}),
    state: { kind: "pending" } as const, version: 0, cursor: null, reversedCount: 0, alreadyReversedCount: 0, scannedLineCount: 0, lockedMonthCount: 0 };
  const id = await ctx.db.insert("placeUndoOperations", fields);
  await ctx.scheduler.runAfter(0, internal.accountingUndo.drive, { operationId: id, version: 0 });
  return { operation: { id, ...fields }, replay: false };
}
const batchArgs = { operationId: v.id("placeUndoOperations"), version: v.number() };

// Only the authorized operation gets this capability. Public commands always use the ordinary store.
function operationStore(ctx: MutationCtx, operation: Doc<"placeUndoOperations">) {
  const store = convexStore(ctx.db);
  function allowOwnPlace<T extends { id: string; undoOperationId?: string }>(profile: T): T {
    return profile.undoOperationId === operation._id ? { ...profile, undoOperationId: undefined } : profile;
  }
  return { ...store,
    isMember: async (workspaceId: string, userId: string) => workspaceId === operation.workspaceId && userId === operation.authorizedBy,
    getProfile: async (id: string) => { const p = await store.getProfile(id); return p ? allowOwnPlace(p) : undefined; },
    listProfiles: async (id: string) => (await store.listProfiles(id)).map(allowOwnPlace),
  };
}
function errorCode(error: unknown): string {
  if (error instanceof AccountingError || error instanceof RecoveryError) return error.code;
  if (error instanceof ConvexError && error.data && typeof error.data === "object" && "code" in error.data && typeof error.data.code === "string") return error.data.code;
  return "place_undo_unexpected_failure";
}
function errorDetail(error: unknown): string {
  if (error instanceof AccountingError || error instanceof RecoveryError) return error.message;
  if (error instanceof ConvexError && error.data && typeof error.data === "object") {
    if ("detail" in error.data && typeof error.data.detail === "string") return error.data.detail;
    if ("message" in error.data && typeof error.data.message === "string") return error.data.message;
  }
  return "The batch failed unexpectedly and was rolled back. Investigate before retrying";
}
export const processBatch = internalMutation({
  args: batchArgs, returns: v.null(),
  handler: async (ctx, args): Promise<null> => run(async () => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation || operation.version !== args.version || operation.state.kind === "done" || operation.state.kind === "needs_attention") return null;
    const workspace = await ctx.db.get(operation.workspaceId);
    const profile = await ctx.db.get(operation.financialAccountProfileId);
    const active = await operationForPlace(ctx, operation.financialAccountProfileId);
    if (!workspace || !profile || profile.workspaceId !== workspace._id || active?._id !== operation._id) throw new AccountingError("place_undo_operation_not_found");
    const today = calendarDate(new Date(), workspaceTimeZone(workspace));
    const store = operationStore(ctx, operation);
    if ((await store.getAccountingPeriod(workspace._id, periodFromAccountingDate(today)))?.status === "locked") throw new AccountingError("place_undo_current_period_locked");
    const page = await pageLines(ctx, profile, operation.cursor);
    let reversedCount = operation.reversedCount, alreadyReversedCount = operation.alreadyReversedCount, lockedMonthCount = operation.lockedMonthCount;
    for (const line of page.page) {
      try {
        const original = await store.getJournalEntry(line.journalEntryId);
        if (!original) throw new AccountingError("journal_entry_not_found");
        if (!isRepresentative(original, line)) continue;
        if (await store.findReversalOf(original.id)) { alreadyReversedCount++; continue; }
        if ((await store.getAccountingPeriod(operation.workspaceId, original.period))?.status === "locked") lockedMonthCount++;
        const key = `place-undo:${JSON.stringify([operation._id, original.id])}`;
        if (await store.findJournalEntryByIdempotencyKey(operation.workspaceId, key) || await store.findOpeningMarkerByIdempotencyKey(operation.workspaceId, key))
          throw new AccountingError("idempotency_key_conflict");
        const reversal = await reversePostedEntry(store, { now: () => new Date() }, {
          actor: { userId: operation.authorizedBy }, workspaceId: operation.workspaceId, journalEntryId: original.id,
          accountingDate: today, idempotencyKey: key,
        });
        await cancelReopenedPlans(recoveryWriteStore(ctx, operation.workspaceId), {
          workspaceId: operation.workspaceId, actorId: operation.authorizedBy, now: Date.now(),
          cause: { kind: "transfer_reversed", transferJournalEntryId: original.id, reversalJournalEntryId: reversal.id },
        });
        reversedCount++;
      } catch (error) {
        throw new ConvexError({ code: errorCode(error), detail: errorDetail(error), journalEntryId: line.journalEntryId });
      }
    }
    const progress = { cursor: page.continueCursor, reversedCount, alreadyReversedCount, lockedMonthCount,
      scannedLineCount: operation.scannedLineCount + page.page.length, version: operation.version + 1 };
    if (page.isDone) {
      const totals = (await store.accountTotals(operation.workspaceId)).get(profile.postingAccountId);
      if (totals && totals.debitMinorUnits !== totals.creditMinorUnits) throw new AccountingError("place_undo_balance_not_zero");
      const now = Date.now();
      const ending = await store.insertPlaceEnding({ act: "undo", workspaceId: operation.workspaceId,
        financialAccountProfileId: operation.financialAccountProfileId, occurredAt: now, recordedAt: now,
        endedBy: operation.authorizedBy, idempotencyKey: `place-undo-ending:${operation._id}`, request: operation.request,
        entries: [], undoOperationId: operation._id,
        ...(operation.replacementDefaultFinancialAccountProfileId ? { replacementDefaultFinancialAccountProfileId: operation.replacementDefaultFinancialAccountProfileId } : {}) });
      await ctx.db.patch(operation._id, { ...progress, state: { kind: "done", endingId: ending.id, completedAt: now } });
    } else {
      await ctx.db.patch(operation._id, { ...progress, state: { kind: "running" } });
      await ctx.scheduler.runAfter(0, internal.accountingUndo.drive, { operationId: operation._id, version: progress.version });
    }
    return null;
  }),
});
export const drive = internalMutation({
  args: batchArgs, returns: v.null(),
  handler: async (ctx, args): Promise<null> => run(async () => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation || operation.version !== args.version || operation.state.kind === "done" || operation.state.kind === "needs_attention") return null;
    try {
      await ctx.runMutation(internal.accountingUndo.processBatch, args);
    } catch (error) {
      const code = errorCode(error);
      if (code === "place_undo_current_period_locked" || code === "locked_period" || code === "ledger_summary_not_ready" || code === "reversal_date_before_original" || code === "activity_before_opening") {
        await ctx.db.patch(operation._id, { state: { kind: "paused", code, retryAt: Date.now() + RETRY_MS } });
        await ctx.scheduler.runAfter(RETRY_MS, internal.accountingUndo.drive, args);
      } else {
        const data = error instanceof ConvexError ? error.data : null;
        const journalEntryId = data && typeof data === "object" && "journalEntryId" in data && typeof data.journalEntryId === "string" ? data.journalEntryId : undefined;
        await ctx.db.patch(operation._id, { state: { kind: "needs_attention", code, detail: errorDetail(error), ...(journalEntryId ? { journalEntryId } : {}) } });
      }
    }
    return null;
  }),
});
export const retryAfterRepair = internalMutation({
  args: { operationId: v.id("placeUndoOperations") }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => run(async () => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation || operation.state.kind === "done") return null;
    const version = operation.version + 1;
    await ctx.db.patch(operation._id, { version, state: { kind: "pending" } });
    await ctx.scheduler.runAfter(0, internal.accountingUndo.drive, { operationId: operation._id, version });
    return null;
  }),
});
