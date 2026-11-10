# Place Close and Undo hardening handoff

Branch `t3/harden-place-undo`. Implementation source `1250f254007fadaf4231124733b24d0bfc15f81a`. Reproduction commit `6f73a531121572e34fd59b77904ad363c62ed4bc` precedes the fix. The final handoff commit adds this report and validation receipts. Obtain that head with `git log -1` on this branch.

This implements the eight review decisions under SEN-118. No push, PR, deployment, device access, dependency change or modification of the primary checkout occurred. Local tests use controlled Clerk fixtures and an in-memory Convex store. Runtime acceptance remains open.

## What changed

Undo refuses known irreversible dependencies before freezing the Place. Preview and Start report the ended counterparty's identity and name, including a closed account's closing transfer and a Recovery contribution into an ended destination. An original with invalid category metadata, line structure, account/profile references, an incompatible opening date, or projected summary overflow is also refused before Start. Already-reversed originals and reversal entries are excluded.

Close and Undo freeze only their target. An operation's outstanding shared-entry counts protect its counterparties until those originals are reversed. Those counts decrease in the same transaction as the reversals, so an unrelated Place can end immediately and a former counterparty can end before the entire Undo finishes. Legacy operations lacking these counts use a conservative bounded ledger check. Undoing Places do not count as open, cannot replace the default, and concurrent endings cannot consume the last open Place. This replaces the old blanket workspace check without removing the necessary shared-entry and last-open protections.

Closing an expense's source Place no longer affects Recovery. Activation, funding and attribution corrections can use an expense paid from a closed source. An undoing or undone source refuses new recovery. A closed, undone or undoing destination refuses new funding and target attribution. Cancellation remains available on unfinished, uncancelled plans regardless of source/destination state, as the cancellation command already permits. The reads now report those same rules. Undo additionally refuses any destination plan with historical contributions, regardless of cancellation, completion, reversal or correction. Close still asks the separate unfinished-destination question.

Future unreversed entries refuse both endings, with the latest date in the read and mutation error context. The normal public posting commands continue to accept future dates. Locking the current workspace month during an unfinished Undo is refused in the domain lock command. Previously locked future months can still be encountered after a calendar change. Transient failures now back off and eventually require attention.

Batches reverse at most ten representative original entries. They prepare profiles, endings, operation state, accounts and categories once, and reuse profiles when inserting History projections. A separately scheduled watchdog survives a whole driver mutation's rollback. Completion directly checks for an unreversed original through the account index, then checks zero balance and appends the ending in that same mutation. A new `journalLines.by_entry_account` index chooses a representative by document identity, independently of stored line numbers, including when several lines hit the same account.

Close line descriptions and Undo reversal prefixes come from the caller. History uses these stored descriptions. Existing callers retain English defaults. Close also canonicalizes adjustment Money key order, matching transfer and expense lines.

## Complete current mobile contract

This section replaces the earlier Close and Undo handoffs. Authoritative validators are `convex/accountingPlaceValues.ts`, `convex/accountingUndoValues.ts`, `convex/accountingValues.ts` and `convex/validators.ts`. All functions below are in `api.accounting`. Public IDs are strings. Money has `{ currency: string, minorUnits: number }`. Dates are `YYYY-MM-DD` workspace calendar dates; timestamps are epoch milliseconds.

### Authorization and validation

`closePlace` and `startUndoPlace` are actions. Each verifies the current Clerk session through the provider, then rechecks the admitted device, session observation and current workspace permissions in `internal.accountingWrites`. Close requires `workspace:admin` and `accounting:post`; Undo requires `workspace:admin` and `accounting:correct`. These combinations require the Owner role today. Exact replays still undergo those checks. Reads require the admitted device and `workspace:read`.

Convex argument validators reject unknown fields, missing required fields, wrong discriminants and wrong value types. The caller never supplies actor, session observation, accounting date, operation state, journal key or ending timestamp to Close or Start. Amounts must be positive safe integer minor units in the workspace currency. The zero-balance Close uses no lines.

New optional Close descriptions and reversal prefixes are trimmed, must contain visible text and have at most 1,000 UTF-16 code units. Invisible-only, whitespace-only and overlong values raise `description_invalid`. A prefix is literal text, followed by one space and the original description. It is not a placeholder template. The original stored description is preserved. Adjustment category names are optional, trimmed, visible and at most 80 UTF-16 code units. Invalid names raise `name_required` or `category_name_too_long`, even if that nature is unused.

### Close request and receipt

```ts
closePlace({
  workspaceId: string,
  financialAccountProfileId: string,
  idempotencyKey: string,
  replacementDefaultFinancialAccountProfileId?: string,
  closingAdjustmentExpenseName?: string,
  closingAdjustmentIncomeName?: string,
  lines: Array<
    | { kind: "transfer", otherFinancialAccountProfileId: string, amount: Money, description?: string }
    | { kind: "expense", userCategoryId: string, amount: Money, description?: string }
    | { kind: "adjustment", amount: Money, description?: string }
  >
}): Promise<{ ending: PlaceEnding, replay: boolean }>

type PlaceEnding = {
  id: string,
  workspaceId: string,
  financialAccountProfileId: string,
  act: "close" | "undo",
  occurredAt: number,
  recordedAt: number,
  endedBy: string,
  idempotencyKey: string,
  request: string,
  entries: PostedJournalEntry[],
  undoOperationId?: string,
  replacementDefaultFinancialAccountProfileId?: string
}
```

Close always returns `act: "close"`. Its entire settlement, new adjustment categories/accounts, summary updates, default change and ending are atomic. The ordered line amounts must add to the absolute lifetime normal-side balance exactly. All lines settle in the same direction. The command posts them on the current workspace day and refuses an unreversed future entry rather than settling a future balance today.

| Balance | Transfer direction | Picked expense | Adjustment |
| --- | --- | --- | --- |
| Positive asset | Target to other open Place | Allowed | Expense |
| Negative asset, overdraft | Other open Place to target | Refused | Income |
| Positive liability, debt owed | Other open Place to target | Refused | Income |
| Negative liability, overpayment | Target to other open Place | Refused | Expense |
| Zero | No lines | No lines | No lines |

There is no extra sufficient-funds rule. Other endpoints must be open and in the same workspace. A nonzero Close respects normal opening-date and period locks. A zero Close can occur in a locked month because it posts nothing. Close remains permitted for a completed or cancelled Recovery destination, subject to other blockers.

An omitted transfer/expense description becomes `Closing a Place`; an omitted adjustment description becomes `Closing Adjustment`. Category-name defaults remain `Closing Adjustment (expense)` and `Closing Adjustment (income)`. Supplied names apply only when creating a category, never to rename an existing one. Categories are reused by classification identity, separately by nature, with existing collision suffix rules. Expense/income posting codes remain `53959501`/`42959503` in `co-puc-personal@1`, and `6170`/`4970` in `us-gaap-personal@1`.

An exact Close replay returns the original saved ending and entry snapshots, with outer `replay: true`, before current ending/period checks. The request compares normalized optional names/descriptions, target, replacement and every ordered line field. Changed order, descriptions, amounts, category or endpoint under an old key conflict. Omitted new fields retain the old request encoding. Whitespace around supplied descriptions/names does not change intent. The inner entry snapshots retain their original `replay: false`.

The derived journal key for line `i` is `place-close:${JSON.stringify([idempotencyKey, i])}`. The derived setting key is `place-close-default:${idempotencyKey}`. A first Close refuses to adopt independently existing facts under those keys.

```ts
type PostedJournalEntry = {
  id: string,
  policy: "opening-position@1" | "start-tracking@1" | "cash-expense@1" | "cash-income@1" | "account-transfer@1" | "reversal@1",
  description: string,
  accountingDate: string,
  accountingPeriod: { year: number, month: number, status: "open" | "locked" | "not_opened" },
  amount: Money,
  financialAccountProfileId?: string,
  financialAccountProfileName?: string,
  reversesEntryId?: string,
  reversedByEntryId?: string,
  postedBy: string,
  postedAt: number,
  replay: boolean,
  lines: Array<{
    ledgerAccountId: string, code: string, name: string, nature: AccountNature,
    debitMinorUnits: number, creditMinorUnits: number,
    userCategoryId?: string, userCategoryName?: string, userCategoryIds?: string[],
    primaryUserCategoryId?: string,
    userCategories: Array<{ id: string, name: string }>
  }>
}
type AccountNature = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
```

### Can-close read and blockers

```ts
placeClosure({ workspaceId: string, financialAccountProfileId: string }): Promise<{
  financialAccountProfileId: string,
  status: PlaceStatus,
  canClose: boolean,
  blockers: CloseBlocker[],
  isDefault: boolean,
  requiresReplacementDefault: boolean,
  openPlaceCount: number,
  balance: Money,
  nature: AccountNature,
  accountingDate: string
}>
type PlaceStatus = "open" | "undoing" | "closed" | "undone";
type NamedPlan = { id: string, title: string };
type NamedPlace = { id: string, name: string };
type CloseBlocker =
  | { code: "financial_account_profile_ended" }
  | { code: "place_undo_in_progress" }
  | { code: "place_last_open" }
  | { code: "place_recovery_destination", plans: NamedPlan[] }
  | { code: "place_future_entries", latestAccountingDate: string }
  | { code: "place_ending_scan_limit" }
  | { code: "place_undo_dependency", places: NamedPlace[] };
```

`canClose` means no structural blocker. It does not validate hypothetical settlement lines, replacement choice or the posting period. Default status does not itself make `canClose` false; the command requires a replacement. The mutation recomputes the read and rejects its first blocker, including that blocker as `error.data.context`.

The future check makes one descending range lookup on `journalEntryProfiles.by_workspace_profile_date`, followed by reversal-existence lookups. It reports the latest unreversed original's date, ignoring reversal entries and originals already reversed. This uses the existing History projection maintained by normal posting; retain/rebuild that projection if repairing legacy projection omissions. It does not claim to detect manually deleted projection records.

### Undo Start, preview and status

```ts
startUndoPlace({
  workspaceId: string,
  financialAccountProfileId: string,
  idempotencyKey: string,
  replacementDefaultFinancialAccountProfileId?: string,
  reversalDescriptionPrefix?: string
}): Promise<{ operation: UndoOperation, replay: boolean }>

previewUndoPlace({
  workspaceId: string,
  financialAccountProfileId: string,
  cursor?: string | null
}): Promise<{
  closure: Awaited<ReturnType<typeof placeClosure>>,
  canUndo: boolean,
  blockers: UndoBlocker[],
  operation: UndoOperation | null,
  page: {
    entriesToReverse: number,
    alreadyReversed: number,
    lockedMonthEntries: number,
    otherPlaces: Array<{ financialAccountProfileId: string, name: string, balanceChange: Money }>,
    currentMonthExpenseChange: Money,
    currentMonthIncomeChange: Money,
    scannedLines: number,
    isDone: boolean,
    continueCursor: string
  }
}>

placeUndoStatus({ workspaceId: string, financialAccountProfileId: string }): Promise<UndoOperation | null>

type UndoBlocker = CloseBlocker
  | { code: "place_undo_ended_counterparty", places: NamedPlace[] }
  | { code: "place_undo_invalid_entry", journalEntryId: string, reason: string }
  | { code: "place_recovery_contributed_destination", plans: NamedPlan[] }
  | { code: "place_recovery_covered_expenses", plans: NamedPlan[] }
  | { code: "place_undo_current_period_locked" };

type UndoOperation = {
  id: string,
  workspaceId: string,
  financialAccountProfileId: string,
  idempotencyKey: string,
  request: string,
  authorizedBy: string,
  startedAt: number,
  replacementDefaultFinancialAccountProfileId?: string,
  reversalDescriptionPrefix?: string,
  counterparties?: Array<{ financialAccountProfileId: string, remainingEntries: number }>,
  state: UndoState,
  version: number,
  cursor: string | null,
  reversedCount: number,
  hasReversedEntries: boolean,
  alreadyReversedCount: number,
  scannedLineCount: number,
  lockedMonthCount: number,
  heartbeatAt?: number,
  retryCount?: number,
  watchdogCount?: number
}
type UndoState =
  | { kind: "pending" }
  | { kind: "running" }
  | { kind: "paused", code: string, retryAt: number }
  | { kind: "needs_attention", code: string, detail: string, journalEntryId?: string }
  | { kind: "aborted", abortedAt: number, abortedBy: string }
  | { kind: "done", endingId: string, completedAt: number };
```

Start repeats every structural check atomically, then replaces the default if required, records the owner authorization, freezes the target and schedules both a driver and an independent watchdog. It never posts a reversal in Start. The operation reverses every unreversed original touching the posting account, including openings, expenses, income and both transfer directions. Old locked-month originals reverse into the current workspace day. It never reverses into an ended Place, skips a refusing original, or un-reverses an entry.

The new prefix is normalized and compared in the saved Start request, then stored once for every batch. Omission produces `Reversal: ${original.description}`. An exact Start retry returns the same operation identity with its current progress/state and `replay: true`, including done or aborted. Changed target, replacement or normalized prefix under that workspace/key conflicts. After abort, a new attempt requires a new key; the aborted receipt remains historical. Status returns an active operation if present, otherwise the most recent terminal one, or null before any Start.

Preview blockers apply to the entire target, independently of its effect page. Pages scan at most ten journal lines, so totals are per page. Continue with `continueCursor` until `isDone`, accumulating counts and deltas by Place ID before confirmation. The page's expense/income fields describe effects in the current month, even when originals belonged to locked past months. Entries already reversed contribute only to `alreadyReversed`. Pagination can consume lines without producing an original. Counts and stored counters describe distinct representative originals, not line positions.

Undo refuses active/suspended destination plans through the Close rule, and also refuses any destination plan that ever had contributions through `place_recovery_contributed_destination`. Contributions that were corrected, voided or belong to a cancelled/completed plan still count for this structural question. `place_recovery_covered_expenses` separately identifies funded plans whose source expense belongs to the target. Unfunded source plans may remain; reversal suspends them. Reversing a funding transfer still applies Recovery's existing automatic-cancellation rules if it reopens a completed plan while another unfinished plan exists.

`hasReversedEntries` is explicitly `reversedCount > 0`. `alreadyReversedCount` does not establish that this operation changed any accounting. Show needs-attention detail and entry identity, and keep that state visible. Do not present a partially reversed operation as ended.

### Status filters and single-entry reversal

`listFinancialAccountProfiles({ workspaceId, status? })` accepts `open | undoing | closed | undone | all`, defaults to open, and returns profile objects with required status. `postedActivity` accepts the same filter for accounts. It does not filter journal rows or monthly totals. `balances`, History and journal reads retain ended identities. History must request all profile statuses. `postedHistory({ workspaceId, financialAccountProfileId?, includeReversals?, paginationOpts })` includes reversal rows by default. `postedActivity` deliberately omits reversal rows; use History for their localized titles. Ending does not rename stored user data or reopen the Place. Aborted Undo is not an ending, so it returns to open.

`reversePostedEntry` retains its existing request `{ workspaceId, journalEntryId, accountingDate?, description?, idempotencyKey }` and PostedJournalEntry receipt, and adds `reversalDescriptionPrefix?: string`. Existing callers retain their description override or English default. Prefix and explicit description together raise `description_invalid`, so a supplied prefix cannot be silently ignored. The generated description participates in normal journal replay comparison; a changed generated description under the old key conflicts. This action retains all ordinary date, reversal uniqueness, authorization and posting guards.

### Error codes and conditions

Accounting errors are `{ kind: "accounting", code, message, context? }` in `ConvexError.data`. Close/Start blocker refusals add the exact blocker as `context`, giving names, date or invalid-entry reason without parsing English. Queries return blocker arrays for these conditions. Show localized copy by code, and preserve unexpected detail for support.

| Code | When it occurs |
| --- | --- |
| `financial_account_profile_ended` | Target, transfer endpoint or replacement is closed/undone; new reversal or posting touches an ended Place. |
| `place_undo_in_progress` | The target or a selected activity/replacement endpoint is being undone, including paused/attention. It is no longer a workspace-wide prohibition. |
| `place_last_open` | Ending would leave no open Place. Undoing Places do not count. |
| `place_undo_dependency` | The target still has an unreversed shared original with another unfinished Undo. `places` names those Undo targets. |
| `place_recovery_destination` | An uncancelled, unfinished destination plan exists, including suspended plans. Both acts use this Close rule. |
| `place_recovery_contributed_destination` | Undo destination has any plan with historical contributions, in any status. |
| `place_recovery_covered_expenses` | Undo target paid an expense covered by a plan with historical contributions. |
| `place_undo_ended_counterparty` | An unreversed original touches or links an ended counterparty. `places` identifies it; offer Close instead. |
| `place_future_entries` | An unreversed original is later than today. `latestAccountingDate` identifies the latest date. |
| `place_ending_scan_limit` | A bounded safety review cannot finish within its 1,000-line/row bound. Nothing starts or ends. See limits below. |
| `place_undo_invalid_entry` | Structural reversal preflight fails. `journalEntryId` and `reason` identify the original and underlying error. |
| `place_undo_current_period_locked` | Undo needs today's month open. Preview/Start refuse it; an unexpected later lock pauses with bounded retries. |
| `place_default_replacement_required` | Ending the current default without a replacement. |
| `place_default_replacement_invalid` | Replacement supplied for a nondefault target, or points at the target itself. |
| `financial_account_profile_not_found` | Target, transfer endpoint or replacement is missing, malformed or foreign; also invalid status-read target. |
| `idempotency_key_required` | Empty/whitespace Close or Start key. |
| `idempotency_key_conflict` | Saved request differs, or a first execution collides with derived journal/opening/default-setting keys. |
| `description_invalid` | Invalid supplied Close description/prefix, or both ordinary reversal description and prefix supplied. |
| `name_required`, `category_name_too_long` | Supplied adjustment category name is invisible/empty or longer than 80. |
| `place_close_line_invalid` | Explicit expense line for anything other than a positive asset balance. |
| `place_close_balance_mismatch` | Line sum differs from the absolute balance, or final balance is not zero. |
| `transfer_profiles_must_differ` | A closing transfer points back to its target. |
| `amount_must_be_positive`, `currency_mismatch` | Invalid line magnitude or wrong workspace currency. |
| `category_not_found`, `category_nature_required`, `category_nature_mismatch` | Picked expense category is missing/foreign/deleted, lacks nature, or has the wrong nature. Invalid original categories instead produce `place_undo_invalid_entry` with a reason. |
| `activity_before_opening`, `locked_period` | A closing journal violates an active opening date or today's lock. Undo detects initial opening incompatibility as invalid-entry, and retains batch guards against later changes. |
| `ledger_summary_not_ready`, `ledger_totals_out_of_range` | Required totals are unavailable or a posting overflows supported totals. Undo checks projected overflow initially; later concurrent changes can still fail a batch. |
| `defaults_unavailable`, `default_place_stale` | Existing default boundary is unavailable or rejects its compare-and-set. The former retains its existing non-accounting envelope. |
| `period_lock_undo_in_progress` | The separate period-lock command targets the current workspace month while any Undo is pending/running/paused/attention. Past/future month locking is unchanged. |
| `place_undo_operation_not_found` | Internal continuation/abort cannot resolve its operation/workspace/profile. |
| `place_undo_originals_remain` | Final indexed existence check still finds an unreversed original; no ending commits. |
| `place_undo_balance_not_zero` | Final lifetime totals are nonzero after reversals; no ending commits. |
| `place_undo_abort_forbidden` | Internal abort lacks the authorizing owner, has committed reversals, or is not attention/previously-aborted. |

Invalid-entry `reason` can be `journal_entry_incomplete`, `journal_line_invalid`, `posted_journal_entry_unbalanced`, `ledger_account_not_found`, `financial_account_profile_not_found`, `category_not_found`, `category_nature_required`, `category_selection_invalid`, `category_limit_exceeded`, `category_primary_invalid`, `activity_before_opening`, or `ledger_totals_out_of_range`.

Existing configuration/integrity errors propagate unchanged rather than becoming success/blocker guesses: `workspace_membership_required`, `ledger_account_not_found`, `chart_of_accounts_template_unknown`, `ledger_account_code_unknown`, `cash_expense_account_invalid`, `cash_income_account_invalid`, `journal_entry_incomplete`, `journal_line_invalid`, `posted_journal_entry_unbalanced`, `journal_entry_not_found`, `accounting_period_not_found`, `accounting_period_invalid`, `accounting_date_required`, `clock_required`, and `time_zone_invalid`. Ordinary reversal additionally retains `reversal_cannot_be_reversed`, `journal_entry_already_reversed`, and `reversal_date_before_original`. Unsupported/corrupt configuration can also raise a normal unexpected server error; there is no invented stable domain code for it.

Security errors retain their existing envelope and codes: `authentication_required`, `session_required`, `session_inactive`, `provider_unavailable`, `session_verification_required`, `device_registration_required`, `device_revoked`, `membership_required`, and `permission_denied`. Wrong/missing argument types produce Convex validation errors, not a domain code. Batch `state.code` accepts any accounting/Recovery reason string, plus `place_undo_unexpected_failure` for an unknown exception and `place_undo_stalled` for exhausted watchdog recovery. Those are status reasons, not extra public posting-error variants.

Recovery eligibility itself continues to use `expense_not_recoverable` after source reversal/Undo, `place_undo_in_progress` while the source/destination is undoing, `financial_account_profile_ended` for an ended destination/funding endpoint, and its existing `plan_cancelled`/`plan_already_complete` guards. Cancellation uses all-time progress, regardless of which historical month the read displays.

### Mobile obligations

Accumulate every preview page before confirmation and show current-month report changes, other-Place balance changes and locked-month counts. Refuse locally while notification sources map to the Place and name their apps; those mappings intentionally stay off the server. Pass localized descriptions and category names, not translated stored history. Keep an uncertain Start/Close payload and key frozen for reconciliation, and refresh/re-preview after a blocker or changed choice. Do not offer an ordinary public cancel button for Undo. Show paused retry time and attention details, including whether any reversals committed. Preserve unavailable Draft/Candidate selections until replaced with open Places.

## Undo state machine and exits

Start creates pending at version zero. Successful nonfinal batches move pending/running/paused to running; the final batch moves to done only after no unreversed original remains and balance is zero. Every successful batch atomically saves its cursor, counters, heartbeat, dependency counts and next version. Done appends one permanent Undo ending. Done never reopens.

A failed batch rolls back all journal, summary, Recovery and progress writes. The driver then records either paused or needs_attention. Transient codes are `place_undo_current_period_locked`, `locked_period`, `ledger_summary_not_ready`, `reversal_date_before_original`, and `activity_before_opening`. It schedules five retries at 1, 2, 4, 8 and 16 minutes; failure on the sixth attempt moves to needs_attention with the reason/detail. Successful progress resets the retry counter. All other caught errors go directly to needs_attention, retaining the journal ID when the failure occurred on a particular original.

Start independently schedules `internal.accountingUndo.watchdog({ operationId })` for five minutes later. It compares the heartbeat with the current time, respecting a paused operation's retry time. A stalled operation gets a new version and a driver; the next watchdog check is independent of that driver. Concurrent progress or a duplicate driver conflicts on the operation/version, so only one batch commits. Five watchdog re-drives without progress are allowed; the sixth stale check sets needs_attention with `place_undo_stalled`. Successful batches reset that counter. Done, aborted and attention stop automatic watchdog work.

`internal.accountingUndo.retryAfterRepair({ operationId: Id<"placeUndoOperations"> })` returns null. Only paused/attention transitions to pending; it increments version, resets retry/watchdog counts, preserves committed progress/cursor/dependencies, and schedules driver plus watchdog. Other states/missing operations are no-ops. This is an operator repair path, not an app API or permission to skip financial rules.

`internal.accountingUndo.abortBeforeProgress({ operationId: Id<"placeUndoOperations">, authorizedBy: string })` returns null. It requires the actual authenticated, admitted Owner context with workspace administration permission, whose subject matches both the argument and the operation's stored authorizer. An owner string alone is insufficient. Only attention with `reversedCount === 0` can transition to aborted. An exact abort retry is a no-op; version invalidation prevents queued batches from running. The target becomes open, its posted facts remain unchanged, and the abort records its actor/time. Any default replacement already chosen at Start remains the default; abort does not overwrite later settings. A new Undo uses a new request key.

There is no abort after even one committed reversal and no un-reverse path. A partial attention operation stays undoing, retains its detail and remains excluded from open/default choices. Resolving it requires diagnosing the exact original and failed scheduled mutation, repairing the underlying integrity/provider/resource problem within the existing rules, then invoking retryAfterRepair. If an old operation already needs a reversal into an ended counterparty, there is no generic legal repair under the present permanent-ending rule. A zero-progress operation can abort; a partial one requires a new explicit owner decision and a reviewed migration/repair design. This change does not quietly reopen, skip, or compensate it.

Optional new operation fields allow existing documents. Legacy pending/running operations that predate this deployment have no independently scheduled watchdog; the coordinator must seed `internal.accountingUndo.watchdog` once per such operation after inspecting it. Legacy attention/paused operations can use repair retry or the zero-progress abort. No cron or deployment ran here.

## Bounds, limits and evidence

Structural preflight reads at most 1,001 target-account journal lines and refuses with `place_ending_scan_limit` if more than 1,000 exist. Reversal entries and previously reversed originals still consume that safety bound. This is a conservative product limitation: a large valid history cannot currently Start Undo without a future paged integrity certificate or maintained dependency projection. It does not get approved from an incomplete page. Close normally needs only the future-date range and stored running-operation dependency counts; an old operation without dependency metadata can additionally require the bounded line scan. The future-date range itself has the same 1,000-row refusal bound. Ordinary long-history Close without these cases remains available. No arbitrary reversal is skipped.

This bounded direct-ledger check was chosen instead of relying on closing receipts alone. Closing receipts cannot detect an earlier transfer into an account later closed through an adjustment, and do not cover all legacy category assignments. It also preserves the baseline's ability to reverse past legacy journals lacking History projections. All normal posts maintain the existing date projection. Manual projection corruption requires repair before trusting its future-date read. These are stated limits, not claims of unlimited scale or corruption recovery.

The official [Convex limits documentation](https://docs.convex.dev/production/state/limits), read on 10 November 2026, lists 4,096 index ranges, 32,000 scanned documents, 16 MiB read and written, and 16,000 written documents per transaction. Query/mutation execution allows one second of user code, excluding database operations. Document size is 1 MiB. The scheduler allows 1,000 scheduled functions from one mutation. Those are hard ceilings, not performance targets. This implementation schedules at most a driver and watchdog together.

The committed cost regression creates 50 Places, one opening and 25 two-line transfers. Its first actual batch commits ten reversals and increments version to one. A proxy around the complete batch database counts 290 get/query calls, 329 returned documents including the ten paged lines, and 94,546 bytes of JSON-serialized returned documents. Assertions require fewer than 500 calls, 3,000 documents and 2 MiB of JSON. These are local adapter observations, not cloud billing/byte measurements or a one-second cloud execution guarantee. There are no database filters in that measured batch that hide extra scanned rows. The driver adds its own operation read outside the batch. A final completion batch also scans the bounded target history to prove existence directly.

The reviewer's 3/10/25-Place numbers counted store calls, not the entire batch and not the same batch size. No speedup ratio is claimed. Re-run `pnpm vitest run convex/placeHardening.test.ts -t '50-Place'` for this exact measurement. Rich Recovery histories and arbitrarily large stored descriptions can add reads/bytes; only the stated corpus was measured. The watchdog exposes persistent whole-transaction failure rather than claiming every possible workspace is within limits.

Reversal guard audit covered the complete path through reversePostedEntry, postJournalEntry, category assignments, opening control, period control, summaries and view construction. Initial structural line/reference/category/opening/overflow defects are checked in preflight. Selection excludes reversals and earlier-reversed originals, so their ordinary reversal refusal cannot occur for a selected valid original. Deleted categories remain mirrorable by identity, as normal reversal already permits. Workspace/auth/date/key fields come from the authorized operation and current workspace clock. Internal journal keys include an opaque newly allocated operation ID. Current month locks and future dates are checked up front. Later calendar changes, summary growth on counterparties, operator mutations, service/resource failures or corrupt projection/summary configuration remain guarded at posting and become bounded attention incidents; they are not bypassed.

General acceptance of future-dated posting and locking arbitrary future months remains an owner/product question. This task changes ending/lock interaction only.

## Validation and coordinator acceptance

The baseline reproduction run recorded `Tests 10 failed (10)` in `red.log`. The expanded baseline run recorded `Tests 13 failed (13)` in `red-all.log`, including descriptions, whole-driver death and batch-size/read behavior. Expectations were supplied literally, not derived from the production flags. The nonpositional-line witness ended with zero reversals on the baseline even though two originals remained. Scratch review scenarios were read and adapted into persistent assertions rather than copying console-only probes.

Final implementation has 31 new regressions in `convex/placeHardening.test.ts`. Existing expectations in `undoPlace.test.ts` were changed only for the smaller batch size and the explicitly changed refusal/concurrency rules. The old future-opening Close test now expects the earlier future-entry refusal. Tests cover persistent attention/abort/repair, authenticated abort denial, bounded retry delays, watchdog continuation and obsolete versions, exact description retries, History titles, Recovery flags, activation/correction after source Close, completed/cancelled destinations, concurrent last-open endings and release of a shared counterparty before Undo completion.

`pnpm install --frozen-lockfile --offline` exited zero. Dependency-build-script warnings were unchanged; no dependency version changed. Final full tests pass 178 files and 2,896 tests. Root and mobile `pnpm typecheck` pass. `git diff --check` passes. Exact raw receipts are `full-final.log`, `focused-final.log`, `types.log`, `red.log` and `red-all.log` beside this report. Intermediate implementation runs caught outdated old-rule expectations, a missed unique-operation read after abort/restart, and temporary script/syntax/type errors. Those were corrected. During receipt collection two full runs overlapped, and one timed out after five seconds in `src/money/amount.test.ts`, test "the ambiguous class has one mark, 1..3 whole digits, exactly three fractional digits, and requires precision 3". The amount source and test were unchanged. The separate final full run passed all 2,896 tests in 19.54 seconds; the final focused run passed 98/98. The overlapping log is retained locally as `full.log`, with no unique final-source acceptance claim based on that interleaved output. No final failing test or typecheck remains. No independent delegated review ran because this worker was forbidden to start subagents.

The necessary source edit outside the requested globs is `convex/store.ts`. It batches operation reads, accepts prepared profiles for reversal insertion and correctly excludes aborted operations. No mobile file changed. The new optional schema fields and additive line index need normal Convex deployment/index readiness; no data reset or deployment occurred. Private `.verification/` and `.git` were preserved.

The coordinator must keep SEN-118 open and record the exact integrated app build/source, deployed development URL/source, real authenticated Clerk admission/device and normal public API requests with expected/observed outcomes. Exercise both chart templates, locks/future dates, completed and cancelled Recovery destinations, source Close funding/corrections, description replays and Spanish History titles, concurrent endings, process interruption/watchdog recovery, attention with and without committed reversals, revoked device/membership denials and summary reconciliation against the deployed backend. Inspect/seed any legacy operations as described above. Test UI acceptance against that backend, including preview accumulation, unknown-outcome reconciliation, caller restoration twice, Android Back and sheet dismissal. Device-local notification-source blockers and physical-device/platform gaps must remain explicit. Record the authoritative receipt in `.verification/provider/provider-verification.json` without upgrading local fixtures into provider evidence.

## Attention

No independent reviewers or cross-model reviewers ran because the worker rules prohibit subagents. `decisions.tsv` is a retrospective source-and-receipt record, not a full T3 transcript audit. Review the explicit preflight-size and History-projection assumptions in the limits section before broad acceptance. Real Clerk/Convex and UI/device acceptance remain open.
