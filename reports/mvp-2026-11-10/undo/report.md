# Undo a Place backend handoff

Branch `t3/undo-place-workflow`, based on integration `c4ddf965ff0e4f4fe27ac9de0dcfbfdf119a55c1`. Implementation commits are `f67ab30e60b698b0e86de1c9631d0087add7ff83` and `0e58b1c4497be80c4dead300bdb32c925eb67819`. The tested source is `0e58b1c4497be80c4dead300bdb32c925eb67819`. The report commit follows the implementation commits. No push, PR, deployment, device access, package change, Python workaround, or production action occurred.

**Public contract change. Place status now includes `undoing`.** `FinancialAccountProfile.status`, `accounting.placeClosure.status`, and the optional status filters on `accounting.listFinancialAccountProfiles` and `accounting.postedActivity` accept `open | undoing | closed | undone`, with `all` also available as a filter. Existing fields remain. Omitted filters still select open Places. Mobile consumers must handle the new union member and explicitly request `undoing` or `all` to display progress.

Implementation tracking is SEN-118 in the Lukapp Linear project. It remains In Progress. This is local regression evidence. Deployment, real Clerk admission, deployed public API acceptance, and native UI acceptance remain open.

## Behavior and ownership

Undo records one durable operation, excludes the Place from new choices, and refuses new activity immediately. The scheduler reverses all original entries touching its posting account, including incoming transfers whose primary profile is another Place. Existing reversals are skipped. Journal entries remain immutable. A successful completion requires reaching the end of the indexed account lines and an exactly zero balance, then appends `placeEndings.act = undo` and marks the operation done in the same mutation.

Every reversal uses the existing `reversePostedEntry` domain command. Account and category identities are mirrored. Normal journal balancing, period, opening-date, summary, amount-range, and linked-record checks still run. Recovery's existing `cancelReopenedPlans` reaction runs in that transaction for each new reversal, exactly as in the ordinary public reversal adapter. Budget continues to derive consumption from posted journal lines. No new accounting implementation duplicates these rules.

The durable operation is `placeUndoOperations`, indexed by workspace/request and profile. Profiles gain no persisted status flag. The store derives `undoOperationId` from a non-done operation and `placeStatus` maps it to `undoing`. `requireOpenPlace` raises `place_undo_in_progress` for it. Endings retain their original higher priority. The narrow store capability used by the worker removes only its own operation's guard, while retaining all ended-Place guards.

A Place stays named in History. Its name remains reserved while undoing and becomes free after its ending is appended. There is no cancel, abandon, or reopen command.

## Public functions and validators

All public functions live in `convex/accounting.ts`. Their validators are `convex/accountingUndoValues.ts`, `convex/accountingPlaceValues.ts`, and `convex/validators.ts`. Public argument IDs are strings. Stored operation workspace/profile IDs use `v.id` validators. Convex rejects unknown fields, wrong types, and missing required fields before execution. Money retains `{ currency: string, minorUnits: number }`.

`accounting.startUndoPlace` is a public action with these arguments:

```ts
{
  workspaceId: string;
  financialAccountProfileId: string;
  idempotencyKey: string;
  replacementDefaultFinancialAccountProfileId?: string;
}
```

It returns `{ operation: UndoOperation, replay: boolean }`. The action obtains the normal live Clerk observation and invokes `internal.accountingWrites.startUndoPlace`. That mutation checks current device/session binding, membership, Owner workspace administration, and accounting correction permission before receipt recognition. The caller cannot supply an actor, provider observation, journal key, reversal date, cursor, driver version, or operation state.

Start atomically repeats the structural checks, refuses a locked current period, validates any default replacement, moves the default, stores the canonical request and operation, and schedules the first batch. A rejection writes none of those facts. A whitespace-only key is refused. Default replacement uses `place-undo-default:${idempotencyKey}` and inherits the existing guarded setting-change receipt behavior.

The canonical request includes the act, target Place, and replacement default or null. Its workspace/key is unique by transactional lookup. Exact replay returns the same operation identity and its current progress, with `replay: true`, without rescheduling or writing. Changing the Place or replacement under the key is a conflict. A fresh key for an undoing Place is refused with `place_undo_in_progress`; a fresh key after completion is refused with `financial_account_profile_ended`. A nondefault Place cannot carry a replacement.

`accounting.placeUndoStatus` is a query with `{ workspaceId: string, financialAccountProfileId: string }`. It requires normal admitted-device workspace read authorization. It returns null for an existing Place without an operation, otherwise:

```ts
type UndoOperation = {
  id: string;
  workspaceId: string;
  financialAccountProfileId: string;
  idempotencyKey: string;
  request: string;
  authorizedBy: string;
  startedAt: number;
  replacementDefaultFinancialAccountProfileId?: string;
  version: number;
  cursor: string | null;
  reversedCount: number;
  alreadyReversedCount: number;
  scannedLineCount: number;
  lockedMonthCount: number;
  state:
    | { kind: "pending" }
    | { kind: "running" }
    | { kind: "paused"; code: string; retryAt: number }
    | { kind: "needs_attention"; code: string; detail: string; journalEntryId?: string }
    | { kind: "done"; endingId: string; completedAt: number };
};
```

Timestamps are epoch milliseconds. `cursor` is opaque and is not accepted by Start. Counts describe committed processing. `lockedMonthCount` counts reversed original entries from locked months, not distinct months. `alreadyReversedCount` counts originals encountered that already had a reversal. Reversal rows themselves do not increment either count. The operation does not promise an exact grand total before the paged scan completes.

`accounting.previewUndoPlace` is an authorized workspace-read query with `{ workspaceId: string, financialAccountProfileId: string, cursor?: string | null }`. Its result is:

```ts
{
  closure: PlaceClosure;
  canUndo: boolean;
  blockers: UndoBlocker[];
  operation: UndoOperation | null;
  page: {
    entriesToReverse: number;
    alreadyReversed: number;
    lockedMonthEntries: number;
    otherPlaces: Array<{
      financialAccountProfileId: string;
      name: string;
      balanceChange: Money;
    }>;
    currentMonthExpenseChange: Money;
    currentMonthIncomeChange: Money;
    scannedLines: number;
    isDone: boolean;
    continueCursor: string;
  };
}
```

`PlaceClosure` retains all of Close's fields: `financialAccountProfileId`, `status`, `canClose`, `blockers`, `isDefault`, `requiresReplacementDefault`, `openPlaceCount`, `balance`, `nature`, and `accountingDate`. Its blockers add `{ code: "place_undo_in_progress" }`. Default status is advisory and requires a replacement at Start rather than blocking entry to confirmation.

Undo blockers comprise Close's existing ended, last-open, Recovery-destination, and undo-in-progress blockers, plus `{ code: "place_recovery_covered_expenses", plans: Array<{ id, title }> }` and `{ code: "place_undo_current_period_locked" }`. The destination blocker uses Recovery's existing unfinished noncancelled-plan question, including active and suspended plans. Completed or cancelled destination plans do not block, as in Close. The expense blocker is Recovery-owned and deliberately counts historical contributions even after cancellation, correction, or contribution reversal. Accounting asks Recovery rather than interpreting its tables.

The preview numbers are explicitly per page. The caller starts without a cursor, requests each `continueCursor` until `isDone`, sums counts and monthly effects, and groups the other-Place deltas by profile ID before confirmation. A positive balance change increases that Place's normal-side balance. A negative amount decreases it. Zero net deltas may remain in the list. Names are stored data. The preview does not append translated suffixes.

The monthly deltas describe reversing those pending originals on the current workspace calendar day. Expense and income are reported separately with signed minor units. Locked-month entries therefore affect the current month, never the original locked month. A future-dated original cannot reverse before its date and pauses processing if encountered.

The preview is advisory, not a multi-query frozen ledger snapshot. Activity before Start may change the final count, including an entry committed immediately before Start. Refresh confirmation as appropriate and discard page accumulation when its context changes. Start repeats the structural/default/period blockers atomically. It does not run an unbounded preflight of every original. Domain integrity failures found later are reported through needs attention.

## Read bounds and ordering

Preview and progress each paginate at most 20 `journalLines` rows through the new `by_workspace_account` index, restricted to the exact workspace and posting account. Convex index order gives deterministic creation order, with its document tie-breaker. Processing selects the first line for that account in each original, so an unusual journal with several lines on the same account is handled once. Reversal rows are ignored. Incoming and outgoing transfers are both included.

This uses the authoritative journal lines rather than `journalEntryProfiles`, so old entries missing the History projection still participate without a migration. The index builds over existing data on deployment. There is no `listJournalEntries` call in preview or processing. A regression removes History links and makes unbounded journal-list calls throw, then successfully previews and completes Undo.

Each fetched original/reversal resolves its bounded journal lines and ordinary domain metadata. Profile/account/category metadata, existing account-summary rows, and Recovery's existing plan/contribution collections are still read by their current adapters. This bounds ledger work by the page rather than a Place's full entry history; it does not introduce pagination for the separate Recovery collections or arbitrary metadata growth. The batch size is 20 account lines, hence at most 20 reversals. It may reverse fewer because the page includes earlier reversals or already-reversed originals.

The operation freezes new activity on the target at Start. No application command can append an original after that boundary. Generated reversal rows may appear later in the index and can be encountered on subsequent pages, but create no more work. Reaching the index end proves all originals in the frozen target have been examined. Completion also checks lifetime account totals for exactly equal debit and credit minor units.

## State machine and scheduler

The driver is `internal.accountingUndo.drive`, a scheduled mutation. It calls `internal.accountingUndo.processBatch` as a Convex mutation subtransaction. The existing SDK supports subtransaction rollback. This avoids an action gap between financial posting and durable failure recording. Successful batches commit their cursor, counts, new journals, summaries, Recovery reactions, and next scheduler task together. The final batch commits its ending and done state together.

| From | Event | To | Durable effect |
| --- | --- | --- | --- |
| No operation | Authorized Start passes all initial guards | pending | Request, authority, default replacement, initial task |
| pending, running, or paused | Current-version batch succeeds with more rows | running | Journals, summaries, Recovery reactions, cursor/counts, next version/task |
| pending, running, or paused | Current-version batch finishes and balance is zero | done | Same writes plus `placeEndings` fact and completion receipt |
| pending, running, or paused | Temporary posting condition | paused | Failed batch rolls back; reason and retry time persist; task scheduled after 60 seconds |
| paused | Scheduled retry still blocked | paused | New retry time/task; no journals |
| pending, running, or paused | Permanent or unexpected failure | needs_attention | Failed batch rolls back; code, safe detail, and offending journal when available persist |
| needs_attention or paused | Operator repairs cause and invokes `retryAfterRepair` | pending | Cursor/counts retained; version advanced; task scheduled |
| pending or running | Operator invokes internal `retryAfterRepair` | pending | Same work retained; version advanced; prior queued tasks become stale |
| done | Any driver or repair retry | done | No write |
| Any existing state | Exact public Start replay | Same state | Current operation returned, no write |
| Any state | Duplicate/stale driver version | Same state | No write |

The version is an optimistic batch identity. Two drivers read/write the same operation row under Convex transaction conflict detection. One commits a page and advances the version. The other retries against the advanced row and returns without effects. A retried committed batch with the old version is also a no-op. Each original's derived key is `place-undo:${JSON.stringify([operationId, originalJournalEntryId])}`. Normal original-level reversal uniqueness remains enforced in the domain. A failed batch rolls back every journal in that page, even if an earlier reversal succeeded before the injected later failure. Its cursor and counters remain unchanged.

No app call drives progress. Scheduler mutations survive the app closing and benefit from Convex's durable mutation retries. There is no public progress, cancel, or abandon endpoint. The device only reads status. Pending, running, paused, and needs-attention operations all keep their Place `undoing` and guarded.

The ending retains all previous fields and adds optional `undoOperationId`. Undo stores `entries: []` rather than an unbounded array of reversal snapshots in one fact. Its receipt is the linked durable operation, immutable canonical request, final counts, ending ID, and deterministic original/reversal journal links. Close continues to store its existing entry snapshots. Undo's ending key is `place-undo-ending:${operationId}`.

## Authorization during progress and concurrency

Start is an authorized commitment to finish Undo. Device revocation, Clerk sign-out or expiry, provider unavailability, and later membership removal do not revoke that already-started work. Otherwise an account ending could be stranded by closing the app or removing the initiating device. A batch uses the initiating user's recorded ID as attribution, not a fabricated live identity or token. The operation-scoped accounting store grants only its stored workspace/user membership capability. It is never used by public endpoints.

Every batch checks that the workspace exists, the Place still belongs to it, this operation is still the active profile operation, the requested version is current, and the state permits progress. It also checks today's period and all ordinary reversal invariants. Public queries and Start replays keep the normal current-device/membership checks. A test removes membership and revokes the initiating device after Start, observes public replay denial, and observes scheduler completion without an ending-state bypass.

Fresh Close and Undo requests in the same workspace refuse while any Undo is active. This is deliberately broader than the target-only posting guard. It prevents another Place from ending between batches of a shared transfer, and prevents two simultaneous Undos from competing over a shared original. An exact old Close receipt can still replay because it creates no activity. Ordinary activity on other open Places remains allowed. The target has no new posting or external reversal path while undoing.

Recovery adds the source-expense Place guard to `requireContributablePlan`. This closes the race in which a plan with no contributions at Start receives its first attribution before its expense's scheduled reversal. This shared gate covers ordinary contributions and corrections assigning to that plan. Replays still return before creating new activity. Recovery choices exclude undoing Places. An allowed unfunded source plan becomes suspended when its source expense reverses.

## Pauses, failures, and repair

A first Start with today's period locked refuses with `place_undo_current_period_locked` and no operation. During progress, that condition or the ordinary `locked_period` produces a visible pause. Processing retries every 60 seconds. As existing period locking has no ordinary unlock operation, normal recovery is the next open workspace month. The internal repair retry can also be used after an authorized configuration repair.

`ledger_summary_not_ready` pauses until the existing summary migration completes. `reversal_date_before_original` and `activity_before_opening` pause until the workspace calendar reaches a permitted day. A batch always uses its execution day's date, so an operation crossing a month boundary can legitimately have reversals in several current periods. It never shifts a reversal into a future unlocked month merely to avoid today's lock.

Every other failure becomes needs attention. Codes preserve accounting and Recovery error identities. Known errors carry their safe domain message as `detail`. Unexpected exceptions use `place_undo_unexpected_failure` with a safe generic detail and do not expose arbitrary exception messages. A per-entry failure includes its journal ID. Failures before entry processing or the final balance check may have no journal ID.

Examples include a missing/corrupted linked record, a journal/category integrity error, out-of-range ledger totals, a derived-key collision, a failed Recovery reaction, a missing workspace/profile, and the final nonzero balance. The operation remains active and no ending is appended. The operator investigates and repairs the actual cause, then invokes the internal `accountingUndo.retryAfterRepair({ operationId })`. That command retains all work, invalidates stale scheduled versions, and schedules continuation. It is not exposed to a device and grants no permission to rewrite posted facts.

A significant pre-existing constraint is a transfer touching another Place that had already ended before Start. Its reversal raises `financial_account_profile_ended`. The operation stops with that exact transfer ID, and its failed batch rolls back. The historical transfer cannot be reversed through ordinary software while preserving the other Place's permanent ending. This is an owner/support decision, not a repair retry that silently reopens it. The implementation never bypasses that guard or skips the transfer. The regression covers this case. Needs attention can therefore require an explicit future product decision rather than an automatic repair. No such new decision is invented here.

## Error contract

Public domain errors keep the existing `{ kind: "accounting", code, message }` envelope. Added stable accounting codes are `place_undo_in_progress`, `place_recovery_covered_expenses`, `place_undo_current_period_locked`, `place_undo_operation_not_found`, and `place_undo_balance_not_zero`. `place_undo_unexpected_failure` is a status reason for unexpected batch exceptions. Status reason fields are strings so normal accounting and Recovery error codes remain representable.

Start also uses the existing `idempotency_key_required`, `idempotency_key_conflict`, `financial_account_profile_not_found`, `financial_account_profile_ended`, `place_last_open`, `place_recovery_destination`, `place_default_replacement_required`, and `place_default_replacement_invalid` codes. Default replacement retains `defaults_unavailable` and `default_place_stale` from the setting boundary. Structural/read failures such as `ledger_summary_not_ready` and existing membership/calendar/configuration errors propagate rather than fabricate a preview. The shared activity guard emits `place_undo_in_progress` for new activity into either side of a target transfer, external reversal, zero opening, metadata change, or selection as default. Existing exact posting receipts retain their prior replay behavior.

Current authentication failures keep their existing security envelope and codes, including `authentication_required`, `session_required`, `session_inactive`, `provider_unavailable`, `session_verification_required`, `device_registration_required`, `device_revoked`, `membership_required`, and `permission_denied`. The shared boundary suite includes Start, preview, and status in its appropriate matrices, including mutation-time membership/device changes. Convex argument validators remain authoritative for field/type errors.

## Close display-name addition

`accounting.closePlace` and its internal mutation add optional string fields `closingAdjustmentExpenseName` and `closingAdjustmentIncomeName`. Both are trimmed, must contain visible text under the existing category-name rule, and must be at most 80 UTF-16 code units, just like existing category names. Invalid names fail even when that adjustment nature is unused. Names are stored category data, never translated later by the server.

The normalized optional names participate in the canonical Close request. Surrounding whitespace does not change intent. Changing either name under the old key is a conflict, including an unused name. Omitting both preserves the exact old request format, so existing pre-change receipts replay without migration. Omission retains the English defaults.

A name applies only when creating the built-in category for that nature. A matching classification identity keeps its existing name, including after a user rename. Recreating a deleted built-in uses the supplied name for the new identity. Name collisions retain the existing numeric-suffix behavior and truncate the base as necessary to keep the final stored name within 80 characters. Tests cover both charts, expense and income creation, trimming, replay comparison, reuse without renaming, empty/invisible/overlong validation, and the existing English fallback cases.

## Validation and scope

`pnpm install --frozen-lockfile --offline` exited 0. The existing ignored dependency-build-script warning remained. No package versions changed.

Final `pnpm vitest run` passes 177 files and 2,865 tests with no failures. Final `pnpm typecheck` passes root and mobile `tsc --noEmit`, both with exit 0. `git diff --check` passes. Validation summaries and raw logs are local under this report's directory.

The added `convex/undoPlace.test.ts` has 25 tests through the normal public Convex functions, existing store adapters, controlled Clerk fixture, and scheduler. Internal functions are called directly only to expose retry/concurrency/batch boundaries or exercise the explicit operator repair path. Persisted journal/summary/ending facts are compared with literal expected values or independently summed journal lines. The main both-chart case has opening 1,000, expense 120, income 30, outgoing transfer 200, and incoming transfer 70. Preview reports five pending originals, other-Place changes of -200 and +70, expense -120 and income -30. Completion has ten balanced journals, one mirror per original, and zero Place balances. Other tests cover all initial blockers, defaults, racing new activity, pre-Start entries, earlier reversals, more than one batch, duplicate/concurrent drivers, locked and future dates, Budget, Recovery suspension and automatic cancellation, revoked-device/removed-membership continuation, corrupted totals, legacy History omissions, permanent-counterparty failure, and Close names.

Early local checks caught an incorrect expected first-batch count because an earlier reversal row also consumes page space, and missing serialization of top-level batch errors across a subtransaction. Those were corrected. A temporary syntax mistake while wrapping handlers and a wrong device-table type in a fixture were also corrected. No final failure remains. The stale conventions' Drafts baseline failure did not occur.

Production source changes outside the named accounting/schema scope are the Recovery-owned question, its store/type propagation, exclusion of undoing choices, and the shared contributable-plan guard needed for the first-contribution race. `convex/_generated/api.d.ts` adds local type references for the new modules without running deployment or reading environment files. No mobile source or navigation changed. No notification-source mappings were added to the server. `.verification/`, `.git`, and private retained inputs were preserved. The authoritative provider receipt was not edited.

## Coordinator acceptance still open

No deployment URL or deployed source exists for this implementation. No app build or actual end-user Clerk admission was produced. The coordinator must record the exact integrated source/build, development deployment URL and deployed source, actual admitted Clerk user/device, public API requests, expected and observed outcomes, negative/retry checks, and UI acceptance in `.verification/provider/provider-verification.json`. SEN-118 must remain open until those requirements are met.

Against the real development deployment, repeat both-chart financial mirroring and summary reconciliation, paging, locked/current-month behavior, scheduler continuation after app termination, duplicate drivers, failure/repair visibility, default replacement, Recovery blockers/reactions, and authenticated replay denial after device/membership changes. No development records were reset or deleted here. Only isolated in-memory fixture records were modified by tests. Production/cutover restrictions remain unchanged.

The mobile worker must finish preview pagination and combine all other-Place deltas before confirmation. It must show locked-month counts, default replacement, the `undoing` status, paused retry information, needs-attention entry/reason, and completion. It must freeze an unknown Start payload/key for reconciliation. It must localize new copy/errors and pass Spanish stored adjustment names when Close first creates those categories. History and read-only ended pages must request the necessary statuses and preserve stored names.

The device-only notification-source blocker remains the app's responsibility, as in Close. Refuse while a source maps to the Place and name the apps. Keep old selections visible in Drafts/Candidates until the person chooses an open Place. The server has no such mappings. Native return, Android system Back, and sheet dismissal must restore the existing caller twice without stacking it. Physical-device and platform gaps must remain explicitly labelled.

## Design record and throughput checkpoint

Blocking first steps were the owner ADRs, conventions, Close report, engineering lessons, dependency install, and tracing posting/default/Recovery ownership. Independent workstreams were not delegated because this worker is explicitly forbidden to start subagents. The competing designs considered were a scheduled action with separate batch/failure mutations and a scheduled mutation with a rollback subtransaction. The latter keeps failures and next tasks inside the driver's transaction, avoiding an extra action interruption gap.

Shared mutable state is the target's immutable journal history plus summaries, default, operation progress, Recovery reactions, and ending fact. They need transactional ordering. The smallest safe decomposition was one owner for guards/contracts, durable batches, and public regression checks, with a separate committed handoff. No parallel writer or extra compatibility API was introduced.

Model the Domain shaped the discriminated operation state instead of independent progress/failure booleans. Type System Discipline shaped schema-derived operation/receipt types and the explicit new public status. Prove It Works shaped the persisted financial assertions, scheduler tests, and separation of local evidence from real-provider acceptance. Their leaf skills were read. The requested Poteto, TypeScript, Technical Writing, and Unslop instructions were applied. The worker's no-subagent rule overrides the routed skills' delegated exploration and comment-review steps. Comment review was performed directly, keeping the two short comments that explain the operation capability and historical-contribution rule.

Independent delegated and cross-model review was not run because this implementation worker is forbidden to start subagents. The source and decision record received direct review only. This is an explicit review gap, not a claim of independent agreement.
