# Close a Place backend handoff

Branch `t3/close-place-backend`. Tested implementation commit `203a1398369f98c51228a91b221c10b991c144be`, based on `654546a971220c0b113bb235e01ac1b8fa2ed275`. The report commit follows the implementation commit. No push, PR, deployment, device access or dependency change occurred.

Source references, local validation and the outstanding acceptance checks were added to [SEN-118](https://linear.app/sennkai-labs/issue/SEN-118/complete-missing-user-object-lifecycle-controls-across-places-budgets), which remains In Progress. This implements its now-approved Place ending decision. Runtime acceptance remains open.

## Behavior and state

Close retains the Place and its posting account. It posts ordinary transfers, expenses and income to settle the entire balance, then appends one ending fact. Convex commits the journal entries, summaries, any newly required adjustment categories/accounts, default replacement and ending fact in one mutation. Any exception rolls everything back.

`placeEndings` is an appended fact table, indexed by profile and workspace/request. It records `act: "close" | "undo"`, `occurredAt`, `recordedAt`, `endedBy`, the Place/workspace identity, idempotency key, canonical request, immutable posted-entry receipt snapshots and optional replacement default. The timestamp fields are epoch milliseconds. Close occurs when requested, so event time and recording time both use the mutation's current instant. Entries use the current workspace calendar day.

No flag is added to existing profile rows. No ending means open. A close fact means closed; an undo fact means undone. There is no reopening operation. Profile identity, name, ledger account and old entries remain available. Open Places alone reserve a name, using the existing normalized comparison.

Undo should reuse `PlaceEnding`, `placeStatus` and `requireOpenPlace`, append `act: "undo"` only after its own reversals complete, and save its whole-operation request and receipt. No Undo command is implemented. A future resumable Undo needs its own pending-operation orchestration and the additional source-expense/contribution blocker from ADR-0091. It must not append the ending before posting its reversals, because ended Places reject all new postings. The shared model only represents completed endings.

## Public API

Validators are in `convex/accountingPlaceValues.ts`; they use Convex `v` validators. All IDs below are public strings. The adapter stores ending workspace/profile references as table-specific Convex IDs.

`accounting.closePlace` is a public action. Its arguments are:

```ts
{
  workspaceId: string;
  financialAccountProfileId: string;
  idempotencyKey: string;
  replacementDefaultFinancialAccountProfileId?: string;
  lines: Array<
    | { kind: "transfer"; otherFinancialAccountProfileId: string; amount: Money }
    | { kind: "expense"; userCategoryId: string; amount: Money }
    | { kind: "adjustment"; amount: Money }
  >;
}
type Money = { currency: string; minorUnits: number };
```

Each amount must have a positive safe integer number of minor units in the workspace currency. Zero-balance closure uses `lines: []`. The caller cannot supply an accounting date, actor, session observation, adjustment category or journal key. The action obtains a live Clerk observation and calls `internal.accountingWrites.closePlace`. Inside that mutation, current session observation, bound unrevoked device and Owner permissions for workspace administration and accounting posting are checked on every attempt, including replay.

The result is `{ ending, replay: boolean }`. `ending` contains:

```ts
{
  id: string;
  workspaceId: string;
  financialAccountProfileId: string;
  act: "close" | "undo";
  occurredAt: number;
  recordedAt: number;
  endedBy: string;
  idempotencyKey: string;
  request: string;
  entries: PostedJournalEntry[];
  replacementDefaultFinancialAccountProfileId?: string;
}
```

For this command `act` is always `close`. `entries` contains the existing full `postedJournalEntry` public shape, including journal identity, policy, date/period, actor/time, money and all debit/credit/category lines. These are the original receipt snapshots with entry `replay: false`. An exact close retry returns the same ending and entries with outer `replay: true`, even after metadata changes or period locks, without writes. Ordered lines and replacement default are part of the request. Changing any line field, ordering, target Place or replacement under the same workspace/key is a conflict. Object property order does not change intent.

Derived journal keys are `place-close:${JSON.stringify([key, zeroBasedLineIndex])}`. A default replacement uses `place-close-default:${key}`. A first Close refuses to adopt pre-existing journals, opening markers or default-setting receipts under its derived keys. Replaying a committed Close returns before these checks. There is no partially committed close to resume.

`accounting.placeClosure` is a public query with `{ workspaceId: string, financialAccountProfileId: string }`. It requires the normal admitted device and workspace read permission. It returns:

```ts
{
  financialAccountProfileId: string;
  status: "open" | "closed" | "undone";
  canClose: boolean;
  blockers: Array<
    | { code: "financial_account_profile_ended" }
    | { code: "place_last_open" }
    | { code: "place_recovery_destination"; plans: Array<{ id: string; title: string }> }
  >;
  isDefault: boolean;
  requiresReplacementDefault: boolean;
  openPlaceCount: number;
  balance: Money;
  nature: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
  accountingDate: string;
}
```

`canClose` means no structural blocker. Being default requires a replacement as part of the command, rather than preventing the flow from starting. This advisory query does not validate hypothetical closing lines or their posting-date/period constraints. The mutation repeats all checks and uses its own current day. The Recovery-owned question `unfinishedDestinationPlans` computes all-time unreversed/uncorrected contribution progress. Uncancelled plans with remaining target block, including plans suspended by source reversal. Completed and cancelled plans do not block. Plan IDs and titles are returned for the app.

`accounting.listFinancialAccountProfiles` retains `{ workspaceId }` and adds optional `status: "open" | "closed" | "undone" | "all"`. Omission means `open`, keeping ended Places out of existing pickers. Each returned profile retains `id`, `workspaceId`, `name`, optional `emoji`, `productKind` and `ledgerAccountId`, and adds required `status`. The other public commands returning profiles also include status. Setup receipts preserve their original snapshot; an exact setup replay can therefore contain the original open status. Read current status through a query.

`accounting.postedActivity` retains its existing arguments/fields and adds the same optional status filter, defaulting to open. The filter affects `accounts`, not journal rows or month expense totals. `status: "all"` or `"closed"` retrieves an ended account page's balance and tracking date. Existing Home, Places, Budget, Month Close and experience-level code counts `postedActivity.accounts.length`; these counts now describe open Places. The other list-based pickers/settings counts likewise receive open Places by default.

`balances`, `trialBalance`, journal/history reads and history's internal profile maps continue to include ended identities. `postedHistory` still filters by an ended profile ID; `postedEntry` still resolves that perspective. Names remain stored user names. The backend does not append a localized "closed" suffix to them. History's mobile query must request `listFinancialAccountProfiles` with `status: "all"` and render the status. Recovery lists only open source/destination choices but resolves saved destination names from all profiles.

## Sign and line rules

Balance is measured on the posting account's normal side, as in the existing balances read. Every closing line settles a positive magnitude in the same direction. The sum must equal the absolute current balance exactly. No crossing through zero, signed amounts or cancelling opposing lines are accepted.

| Place and normal-side balance | Required entry on closing account | Transfer direction | Picked expense category | Closing Adjustment |
| --- | --- | --- | --- | --- |
| Asset, positive | Credit | Closing Place to other open Place | Allowed | Expense, debit loss account |
| Asset, negative, overdrawn | Debit | Other open Place to closing Place | Refused | Income, credit forgiveness account |
| Liability, positive, still owed | Debit | Other open Place to closing Place | Refused | Income, credit forgiveness account |
| Liability, negative, overpaid | Credit | Closing Place to other open Place | Refused | Expense, debit loss account |
| Either, zero | No journal entry | No lines | No lines | No lines |

The other transfer endpoint may be any other open Place in the same workspace. Transfers retain the existing accounting command's treatment of assets/liabilities and available funds. Close adds no separate sufficient-funds rule. All nonzero entries pass through `recordAccountTransfer`, `recordCashExpense` or `recordCashIncome`, and then the normal posting path. Currency, opening dates, locked periods, categories, summary limits and journal balancing still apply. A locked current period refuses a nonzero close; the command never silently shifts the entries to another date. An already-zero Place can close without posting into a locked period.

The overdrawn/overpaid rules are a symmetric extension where the interview's examples were incomplete. An overdraft is money owed, so forgiveness produces income. An overpayment is a claim to recover money, so abandoning it produces an expense. Explicit picked-category spending stays restricted to a positive asset balance, as instructed. There was no contradictory decision requiring a different implementation.

## Closing Adjustment categories

Adjustment categories are created on first successful use, separately for Expense and Income, and reused by classification identity rather than display name. They are ordinary user categories and appear in category totals, History and reports. They do not silently balance an entry. The caller must explicitly submit each adjustment amount.

The classification marker is `{ kind: "fallback", version: "closing-adjustment@1" }`, paired with the category's nature and fixed posting code. `natureSource` is `preset`. Names initially are `Closing Adjustment (expense)` and `Closing Adjustment (income)`, with the receipt emoji and warning/positive tone. If an unrelated active category already owns the name, a numeric suffix keeps its identity separate. Rename/restyle preserves the marker and account. Deleting the category retires its choice; a later adjustment creates a new identity while old labels and receipts still resolve. No pre-existing category is reclassified or repurposed. These are stored category names, like existing presets, rather than component copy.

| Template | Expense account | Income account |
| --- | --- | --- |
| `co-puc-personal@1` | `53959501`, Pérdida de dinero al cerrar un lugar | `42959503`, Condonación de deudas |
| `us-gaap-personal@1` | `6170`, Loss of money on Place closure | `4970`, Debt forgiveness income |

These are new selectable catalog posting accounts in the existing template structures. The Colombian expense is a specific auxiliary under other miscellaneous nonoperating expenses, rather than groceries, banking fees or equity. The income is a specific auxiliary under other nonoperating income. The US accounts sit under losses and other income respectively. This keeps losses and forgiven obligations visible without labelling them as ordinary spending, salary or an opening-equity correction. The existing defaults are unchanged. Account selection is an application chart design for owner review, not a claim of statutory tax classification.

## Errors

Accounting errors use the existing envelope `{ kind: "accounting", code, message }`. The following new codes are stable:

| Code | Condition |
| --- | --- |
| `financial_account_profile_ended` | New activity touches a closed or undone Place, including either side of a transfer/reversal; metadata changes and default selection also refuse it. A fresh Close on an ended Place refuses it. |
| `place_last_open` | Closing would leave no open Place. |
| `place_recovery_destination` | An unfinished noncancelled Recovery plan uses the destination. Query includes plan IDs/titles. |
| `place_default_replacement_required` | The closing Place is default and no replacement was supplied. |
| `place_default_replacement_invalid` | Replacement is the closing Place, or a replacement was supplied while closing a nondefault Place. |
| `place_close_line_invalid` | A picked-category expense is supplied for any balance except a positive asset. |
| `place_close_balance_mismatch` | Positive closing magnitudes do not total the entire absolute balance, or the final ledger balance fails to reach zero. |

Existing Close validation/posting errors retain their codes:

| Code | Condition |
| --- | --- |
| `idempotency_key_required` | Whole-command key is empty or whitespace. |
| `idempotency_key_conflict` | Saved request differs, or an existing record already owns a derived key. |
| `financial_account_profile_not_found` | Closing Place, transfer endpoint or replacement is missing, malformed or foreign. |
| `transfer_profiles_must_differ` | A transfer line points back to the closing Place. |
| `amount_must_be_positive` | A line magnitude is zero, negative, fractional or outside the safe integer range. |
| `currency_mismatch` | A line uses another currency. |
| `category_not_found` | A picked expense category is missing, foreign or deleted. |
| `category_nature_required` | A picked legacy category lacks a nature. |
| `category_nature_mismatch` | A picked category is Income for an expense. |
| `activity_before_opening` | Today precedes an active opening date on either touched account. |
| `locked_period` | A closing entry would post into today's locked period. |
| `ledger_summary_not_ready` | Existing summary migration is incomplete. |
| `ledger_totals_out_of_range` | An ordinary journal would overflow supported summary totals. |
| `defaults_unavailable` | Existing personal-default configuration needed for a replacement is unavailable. This keeps the existing non-accounting envelope. |
| `default_place_stale` | The existing default-setting compare-and-set guard rejects a changed expected value. It is read and applied in the same Close transaction. |

Existing structural/accounting integrity errors also propagate unchanged: `workspace_membership_required`, `ledger_account_not_found`, `chart_of_accounts_template_unknown`, `ledger_account_code_unknown`, `cash_expense_account_invalid`, `cash_income_account_invalid`, `journal_entry_incomplete`, `journal_line_invalid`, `posted_journal_entry_unbalanced`, `journal_entry_not_found`, `accounting_period_not_found`, `accounting_period_invalid`, `accounting_date_required`, `clock_required` and `time_zone_invalid`. Valid configuration and generated closing drafts should not produce these, but Close does not suppress them. The other activity commands keep all their previous error codes, including reversal uniqueness and setup conflicts.

Authorization errors retain the existing security envelope/codes: `authentication_required` without sign-in; `session_required` for invalid issuer/session claims; `session_inactive` for inactive/missing/mismatched/expired/abandoned Clerk sessions; `provider_unavailable` for absent credentials or failed/invalid provider responses; `session_verification_required` for invalid or stale mutation observations; `device_registration_required` for absent or mismatched device/client binding; `device_revoked` for revoked sessions/devices; `membership_required` without workspace membership; and `permission_denied` without Owner permission. These checks run before receipt replay. Convex validator errors reject unknown fields, wrong kinds, missing required fields and malformed types before domain execution.

## Commands protected by the shared ended-state guard

The domain posting boundary rejects any new journal touching the ended account, independently of the requested date or whether its profile ID is the entry's primary profile. It therefore covers:

- `accounting.recordCashExpense` and `accounting.recordCashIncome`.
- `accounting.recordAccountTransfer`, on both endpoints.
- `accounting.recordOpeningPosition`, including the separate zero-value marker path.
- `accounting.setupFinancialAccountProfile` through its opening path. Setup takes no existing profile ID; an exact existing setup replay returns its receipt and does not reopen/create anything.
- `accounting.reversePostedEntry`, including opening/expense/income/closing entries and transfers with either endpoint ended.
- `notificationIntake.confirmOne` and each posting attempted through `confirmCandidates`.
- `savingsRecovery.recordContribution`, through both the source/destination domain checks and its normal transfer path. The internal `recordContribution` attribution function also checks both profiles before creating an attribution.

Additional domain guards reject `accounting.renameAccount`, `accounting.changeAccountLook`, `accounting.changeDefaultPlace`, a Close replacement pointing at an ended Place, and `savingsRecovery.activatePlan` selecting an ended destination. Recovery's public activation adapter converts the shared accounting error consistently.

Reversing a transfer from an open Place to a closed one is refused because it would change the closed Place's balance. Exact replays of pre-close postings, openings, setups, contributions, default-setting receipts and reversals remain receipts, not new activity. The regression suite specifically exercises a pre-close reversal replay after closure. No guard removes historical identities.

## Validation and limits

`pnpm install --frozen-lockfile --offline` completed successfully. It reported the existing ignored dependency build-script warning. No package versions changed.

Final `pnpm vitest run`: 170 test files passed, 2,625 tests passed, zero failures. Final `pnpm typecheck`: root `tsc --noEmit` and mobile `tsc --noEmit` both exited 0. `git diff --check` passed. Logs are summarized in `validation.txt`. The stale conventions' baseline Drafts failure did not occur on this integration base.

`convex/closePlace.test.ts` adds 33 tests through the normal public Convex functions and real store adapters in the existing fixture harness. They cover zero/one/several lines, exact journal amounts/directions, both charts, mismatches, debt payment/forgiveness, overdrawn/overpaid balances, last open Place, active/suspended/completed/cancelled Recovery plans, default replacement, stale keys, rollback after a later line failure, locked periods, opening dates, profile/category/currency/amount validation, ended activity/metadata/reversal refusals, original reversal/contribution/setup replay, history names, free names, legacy setup receipts and category identity after rename/deletion. `accountingBoundary.test.ts` now includes Close and its query in the common authorization matrices, including mutation-time membership/device changes.

Initial test construction exposed four incorrect fixture expectations: unsupported installment counts of 1 and 2, and the existing unauthenticated error name. Those were corrected to supported counts and `authentication_required`. An intermediate typecheck found the two mobile fixtures missing required status and later the synthetic Undo fixture missing typed IDs; those fixture fixes are included. No product failure remains from these runs.

Only the two named mobile test fixtures changed, each to supply `status: "open"`. No mobile production file or navigation changed. The existing `.verification/` and Git directory were retained and no private/provider configuration was read or modified. No Python workaround was used, so the Todo CLI missing-capability preference did not apply.

## Coordinator acceptance still required

This is local regression evidence with controlled Clerk transport and synthetic fixture identities. No real end-user Clerk admission, deployed public API request or full native UI acceptance is claimed. No deployed URL/source or app build exists for this implementation yet. The exact integration source/build and deployed source must be recorded after integration; do not substitute this worker commit for the later integrated build.

The coordinator must deploy only through the separately authorized development workflow, record its exact URL/source, admit an actual Clerk user with an unrevoked bound device and Owner membership, and exercise the public contracts through that session. Repeat the financial, authorization, locked-period, retry, cross-Place reversal and history outcomes against that deployment. Then run the new Close screens against that same backend, including persistent history, Default Place changes, native return/Back/sheet dismissal twice, and reopen/restart behavior. Keep physical device and platform gaps labelled. No development records were reset or deleted by this worker; only isolated in-memory fixture records were used. Production/cutover restrictions are unchanged.

The mobile worker must inspect the phone's current notification-source mappings and refuse closure while any source still maps to the Place, naming those apps. The server has no mappings and cannot establish this condition. Do not add server mapping storage. Also keep a closed selection visible in existing Drafts/Candidates until the person chooses another open Place, localize the new error codes/flow copy, request all statuses for History filters and read-only ended account pages, and render status without changing stored names. Unknown close outcomes freeze the exact lines/default/key for reconciliation and retry.

Record these real-provider and UI outcomes in `.verification/provider/provider-verification.json` and keep SEN-118 open until the required receipt exists. The worker did not edit the authoritative provider gate.

The throughput checkpoint used one owner. Blocking first steps were reading ADRs/conventions, installing the locked dependencies and tracing posting/default/Recovery ownership. Independent workstreams were not delegated because the worker instructions prohibit subagents. Shared mutable ledger/default/ending state stays inside one Convex transaction. The smallest safe decomposition was a shared ending fact and guard, followed by the Close command/reads, then public-function regression checks and this handoff.

Model the Domain determined the single ending fact with two acts, instead of independent status booleans. Type System Discipline determined the discriminated line validator and schema-derived input type. Prove It Works determined the persisted journal/zero-balance assertions and explicit separation of local evidence from real-provider acceptance. These principles' leaf skills were read in this session. The worker's no-subagent instruction took precedence over the routed skills' delegation steps.
