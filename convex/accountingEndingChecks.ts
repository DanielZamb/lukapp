import { findActiveOpening } from "../src/accounting/openingControl";
import { totalsByAccount } from "../src/accounting/ledgerTotals";
import { AccountingError } from "../src/accounting/errors";
import { assertBalancedLines } from "../src/accounting/posting";
import { requireCategoryAssignments } from "../src/accounting/categories/assignments";
import type { StoredJournalEntry } from "../src/accounting/types";
import type { Infer } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { placeCloseBlocker } from "./accountingPlaceValues";
import type { undoBlocker } from "./accountingUndoValues";
import { convexReadStore } from "./store";

export const ENDING_LINE_LIMIT = 1000;
export async function touchingOriginals(
  ctx: QueryCtx,
  workspaceId: string,
  profileId: string,
) {
  const store = convexReadStore(ctx.db);
  const profile = await store.getProfile(profileId);
  if (!profile || profile.workspaceId !== workspaceId)
    throw new AccountingError("financial_account_profile_not_found");
  const workspace = ctx.db.normalizeId("workspaces", workspaceId);
  const account = ctx.db.normalizeId(
    "ledgerAccounts",
    profile.postingAccountId,
  );
  if (!workspace || !account)
    throw new AccountingError("ledger_account_not_found");
  const lines = await ctx.db
    .query("journalLines")
    .withIndex("by_workspace_account", (q) =>
      q.eq("workspaceId", workspace).eq("ledgerAccountId", account),
    )
    .take(ENDING_LINE_LIMIT + 1);
  if (lines.length > ENDING_LINE_LIMIT) return null;
  const entries: StoredJournalEntry[] = [];
  for (const id of new Set(lines.map((l) => l.journalEntryId))) {
    const entry = await store.getJournalEntry(id);
    if (!entry) throw new AccountingError("journal_entry_not_found");
    if (!entry.reversesEntryId && !(await store.findReversalOf(id)))
      entries.push(entry);
  }
  return entries;
}
export async function endingBlockers(
  ctx: QueryCtx,
  workspaceId: string,
  profileId: string,
  today: string,
  prepared?: StoredJournalEntry[] | null,
): Promise<Infer<typeof placeCloseBlocker>[]> {
  const workspace = ctx.db.normalizeId("workspaces", workspaceId);
  const profile = ctx.db.normalizeId("financialAccountProfiles", profileId);
  if (!workspace || !profile)
    throw new AccountingError("financial_account_profile_not_found");
  const blockers: Infer<typeof placeCloseBlocker>[] = [];
  // The date index provides the upper bound. Reversed future facts do not block ending.
  const future = await ctx.db
    .query("journalEntryProfiles")
    .withIndex("by_workspace_profile_date", (q) =>
      q
        .eq("workspaceId", workspace)
        .eq("financialAccountProfileId", profile)
        .gt("accountingDate", today),
    )
    .order("desc")
    .take(ENDING_LINE_LIMIT + 1);
  if (future.length > ENDING_LINE_LIMIT)
    return [{ code: "place_ending_scan_limit" }];
  for (const row of future) {
    if (
      !row.reversesEntryId &&
      !(await ctx.db
        .query("journalEntries")
        .withIndex("by_reverses", (q) =>
          q.eq("reversesEntryId", row.journalEntryId),
        )
        .first())
    ) {
      blockers.push({
        code: "place_future_entries",
        latestAccountingDate: row.accountingDate,
      });
      break;
    }
  }
  const profiles = await convexReadStore(ctx.db).listProfiles(workspaceId);
  const undoing = profiles.filter(
    (p) => p.id !== profileId && p.undoOperationId,
  );
  const operations = await ctx.db
    .query("placeUndoOperations")
    .withIndex("by_workspace_request", (q) => q.eq("workspaceId", workspace))
    .collect();
  const active = operations.filter(
    (o) =>
      o.financialAccountProfileId !== profileId &&
      o.state.kind !== "done" &&
      o.state.kind !== "aborted",
  );
  const dependencies = active.filter((o) =>
    o.counterparties?.some(
      (p) =>
        p.financialAccountProfileId === profileId && p.remainingEntries > 0,
    ),
  );
  const places = dependencies.flatMap((o) => {
    const p = profiles.find((p) => p.id === o.financialAccountProfileId);
    return p ? [{ id: p.id, name: p.name }] : [];
  });
  if (places.length) blockers.push({ code: "place_undo_dependency", places });
  const legacyUndoing = undoing.filter((p) =>
    active.some(
      (o) => o._id === p.undoOperationId && o.counterparties === undefined,
    ),
  );
  if (legacyUndoing.length) {
    const entries =
      prepared === undefined
        ? await touchingOriginals(ctx, workspaceId, profileId)
        : prepared;
    if (!entries) return [...blockers, { code: "place_ending_scan_limit" }];
    const accounts = new Set(
      entries.flatMap((e) => e.lines.map((l) => l.ledgerAccountId)),
    );
    const places = legacyUndoing
      .filter(
        (p) =>
          accounts.has(p.postingAccountId) ||
          entries.some((e) => e.financialAccountProfileId === p.id),
      )
      .map((p) => ({ id: p.id, name: p.name }));
    if (places.length) blockers.push({ code: "place_undo_dependency", places });
  }
  return blockers;
}
export async function reversalBlockers(
  ctx: QueryCtx,
  workspaceId: string,
  profileId: string,
  today: string,
  entries: StoredJournalEntry[] | null,
): Promise<Infer<typeof undoBlocker>[]> {
  if (!entries) return [{ code: "place_ending_scan_limit" }];
  const store = convexReadStore(ctx.db);
  const profiles = await store.listProfiles(workspaceId);
  const touched = new Set(
    entries.flatMap((e) => e.lines.map((l) => l.ledgerAccountId)),
  );
  const places = profiles
    .filter(
      (p) =>
        p.id !== profileId &&
        p.ending &&
        (touched.has(p.postingAccountId) ||
          entries.some((e) => e.financialAccountProfileId === p.id)),
    )
    .map((p) => ({ id: p.id, name: p.name }));
  const blockers: Infer<typeof undoBlocker>[] = places.length
    ? [{ code: "place_undo_ended_counterparty", places }]
    : [];
  const accounts = new Map(
    (await store.listLedgerAccounts(workspaceId)).map((a) => [a.id, a]),
  );
  const categories = new Map(
    (await store.listCategories(workspaceId)).map((c) => [c.id, c]),
  );
  for (const entry of entries) {
    try {
      assertBalancedLines(entry.lines);
      if (
        entry.financialAccountProfileId &&
        !profiles.some((p) => p.id === entry.financialAccountProfileId)
      )
        throw new AccountingError("financial_account_profile_not_found");
      for (const line of entry.lines) {
        if (!accounts.has(line.ledgerAccountId))
          throw new AccountingError("ledger_account_not_found");
        for (const id of requireCategoryAssignments(line)) {
          const category = categories.get(id);
          if (!category) throw new AccountingError("category_not_found");
          if (!category.nature)
            throw new AccountingError("category_nature_required");
        }
      }
    } catch (error) {
      if (!(error instanceof AccountingError)) throw error;
      blockers.push({
        code: "place_undo_invalid_entry",
        journalEntryId: entry.id,
        reason: error.code,
      });
    }
  }
  for (const profile of profiles.filter((p) =>
    touched.has(p.postingAccountId),
  )) {
    const opening = await findActiveOpening(store, workspaceId, profile.id);
    if (opening && opening.accountingDate > today) {
      const entry = entries.find((e) =>
        e.lines.some((l) => l.ledgerAccountId === profile.postingAccountId),
      );
      if (entry)
        blockers.push({
          code: "place_undo_invalid_entry",
          journalEntryId: entry.id,
          reason: "activity_before_opening",
        });
    }
  }
  const mirrored = totalsByAccount(
    entries.map((e) => ({
      ...e,
      lines: e.lines.map((l) => ({
        ...l,
        debitMinorUnits: l.creditMinorUnits,
        creditMinorUnits: l.debitMinorUnits,
      })),
    })),
  );
  for (const period of [undefined, today.slice(0, 7)]) {
    const totals = await store.accountTotals(workspaceId, period);
    for (const [id, delta] of mirrored) {
      const prior = totals.get(id);
      if (
        !Number.isSafeInteger(
          (prior?.debitMinorUnits ?? 0) + delta.debitMinorUnits,
        ) ||
        !Number.isSafeInteger(
          (prior?.creditMinorUnits ?? 0) + delta.creditMinorUnits,
        )
      ) {
        const entry = entries.find((e) =>
          e.lines.some((l) => l.ledgerAccountId === id),
        );
        if (entry)
          blockers.push({
            code: "place_undo_invalid_entry",
            journalEntryId: entry.id,
            reason: "ledger_totals_out_of_range",
          });
      }
    }
  }
  return blockers;
}
// This account-indexed existence check uses journal identities, never stored line positions.
export async function hasUnreversedOriginal(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  accountId: Id<"ledgerAccounts">,
) {
  const checked = new Set<string>();
  for await (const line of ctx.db
    .query("journalLines")
    .withIndex("by_workspace_account", (q) =>
      q.eq("workspaceId", workspaceId).eq("ledgerAccountId", accountId),
    )) {
    if (checked.has(line.journalEntryId)) continue;
    checked.add(line.journalEntryId);
    const entry = await ctx.db.get(line.journalEntryId);
    if (!entry) throw new AccountingError("journal_entry_not_found");
    if (
      !entry.reversesEntryId &&
      !(await ctx.db
        .query("journalEntries")
        .withIndex("by_reverses", (q) => q.eq("reversesEntryId", entry._id))
        .first())
    )
      return true;
  }
  return false;
}
