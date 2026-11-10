# Place and Recovery lifecycle backend

Branch `t3/place-recovery-lifecycle-api`, based on `8fb9fd1`. Place rename is commit `1693fce`. Recovery implementation is commit `778a70d3cc50039fb1d5d6eef33d2a3e7ed6f2c3`. A later report-only commit does not change the tested source. This is local implementation and regression evidence. Nothing was pushed, deployed or exercised on a device.

## Paste into the mobile worker brief

Use public **actions**, following the existing live-Clerk-action/internal-mutation security contract. There are no public mutation registrations. Every write verifies Clerk, then checks the bound device and current workspace Owner membership inside its atomic mutation, including exact retries.

- `api.accounting.renameAccount({workspaceId, financialAccountProfileId, name, expectedName})` returns `financialAccountProfile`. Pass the exact last-read stored name as `expectedName`. This is a compare-and-set metadata command, with no idempotency key. A repeat whose requested trimmed name already matches succeeds without another write. A stale different change returns `account_name_stale`. Duplicate names compare case- and accent-insensitively and return `account_name_conflict`. Creation still allows duplicates and has no name-length cap. Rename follows creation's trimmed, non-empty rule with no new cap. Profile and linked ledger-account names change atomically.
- `api.savingsRecovery.cancelPlan({workspaceId, planId, reason?, idempotencyKey})` returns `{cancellation, replay}`. It accepts active or suspended, unfinished plans. Same-key exact retries replay. A different key after cancellation returns `plan_already_cancelled`. A fully recovered plan returns `plan_already_complete`. Cancellation preserves the frozen target, terms, contributions and transfers. Effective remaining/due become zero. The candidate returns with only unrecovered principal. Omitted reason is allowed, but a supplied reason must trim to 1 to 1000 characters.
- `api.savingsRecovery.activatePlan` gains `replacesPlanId?: string`. It must reference a cancelled plan in this workspace for the same expense, with no prior linked replacement. The new principal is the expense's unrecovered principal across existing valid attributions, without unpaid old premium. Start from `evaluate.candidates[].amountMinorUnits` for the new suggestion. New installment terms may choose a new premium. Contributions on the old plan are never copied into the new plan.
- `api.savingsRecovery.correctContribution({workspaceId, contributionId, reason, targetPlanId?, idempotencyKey})` returns `{correction, replacementContribution?, replay}`. A required trimmed reason has 1 to 1000 characters. Omit `targetPlanId` to remove only the attribution. Supply another eligible plan to re-attribute the entire original amount using the same real transfer and contribution date. There is no new transfer and no partial correction amount. The target must be active on that transfer's date, not cancelled or suspended now, with the same destination and enough remaining target. Period locks do not block this command. Same-key exact retries preserve the original receipt, even after later corrections/reversals. Changed normalized payload under an existing key conflicts.
- `api.savingsRecovery.evaluate({workspaceId, month?, refreshKey?})` now supplies `plans[].contributionHistory`, `cancellation?`, `replacesPlanId?`, and `replacedByPlanId?`. Plan status is `active | suspended | cancelled | completed`. History includes each contribution's `id`, `amountMinorUnits`, `transferJournalEntryId`, `contributionDate` equal to the transfer's Accounting Date, `recordedAt`, `createdBy`, `status: active | voided | corrected`, `transferReversed`, `correction?` and `correctsContributionId?`. A corrected original links to its correction, which links to the replacement contribution and target. If a corrected original's transfer is later reversed, its status remains `corrected`, with `transferReversed: true`; its current replacement becomes `voided`.
- The existing public `recordContribution` still posts a new real transfer and records its attribution. It now rejects new contributions to cancelled plans with `plan_cancelled` and transfers dated before activation with `transfer_predates_activation`. Exact saved contributions still replay, including after cancellation, planning correction, ledger reversal and period lock. Keep the submitted payload/key frozen while its outcome is uncertain.

The only-place page title in `apps/mobile/app/places.tsx` is hard-coded to "My money". Change that title to honor the stored renamed Place. Account rows, pickers, `personalDefaults` and backend history already resolve the updated name. The backend does not change source-mapping or default-place identities. Existing read results carry the renamed profile and ledger-account names.

Validators are specified below. Dispatch errors by `error.data.code`, with `kind: accounting` for Place/domain posting errors, `kind: recovery` for Recovery domain errors, and no kind for auth/device errors.

## Exact validator contract

`S` below means `v.string()`, `N` means `v.number()`, `B` means `v.boolean()`, `?` means `v.optional`, braces mean `v.object`, brackets mean `v.array`, and quoted alternatives mean a union of `v.literal` values. IDs in the public API are strings, not `v.id`. Currency amounts are integer minor units validated by the domain.

| Public function | Argument validator | Return validator |
| --- | --- | --- |
| `accounting.renameAccount` | `accountRename` in `convex/accountingValues.ts`: `{workspaceId:S, financialAccountProfileId:S, name:S, expectedName:S}` | `financialAccountProfile` in `convex/validators.ts`: `{id:S, workspaceId:S, name:S, emoji?:S, productKind:cash/bankAccount/savingsAccount/creditCard/loan, ledgerAccountId:S}` |
| `savingsRecovery.cancelPlan` | `cancelArgs`: `{workspaceId:S, planId:S, reason?:S, idempotencyKey:S}` | `cancelResult`: `{cancellation:Cancellation, replay:B}` |
| `savingsRecovery.correctContribution` | `correctArgs`: `{workspaceId:S, contributionId:S, reason:S, targetPlanId?:S, idempotencyKey:S}` | `correctResult`: `{correction:Correction, replacementContribution?:Contribution, replay:B}` |
| `savingsRecovery.activatePlan` | `activateArgs`: `{workspaceId:S, sourceJournalEntryId:S, destinationFinancialAccountProfileId:S, installmentCount:N, installmentMinorUnits:N, idempotencyKey:S, replacesPlanId?:S}` | `activateResult`: `{plan:StoredPlan, replay:B}` |
| `savingsRecovery.recordContribution` | `contributeArgs`: `{workspaceId:S, planId:S, sourceFinancialAccountProfileId:S, amount:{currency:S, minorUnits:N}, accountingDate:S, description:S, idempotencyKey:S}` | `contributeResult`: `{transfer:{id:S, amount:{currency:S, minorUnits:N}}, contribution:Contribution, replay:B}` |
| `savingsRecovery.evaluate` | `{workspaceId:S, month?:S, refreshKey?:S}` | `evaluation`: `{month:S, currentMonth:S, currency:S, plans:[PlanView], candidates:[Candidate], destinations:[Profile], sources:[Profile]}` |

All Recovery validator symbols below live in `convex/savingsRecoveryValues.ts`.

```text
Cancellation = {
  id:S, workspaceId:S, planId:S, reason?:S, idempotencyKey:S,
  createdBy:S, eventTime:N, recordedAt:N
}
Correction = {
  id:S, workspaceId:S, contributionId:S, reason:S, targetPlanId?:S,
  replacementContributionId?:S, contributionDate:S, idempotencyKey:S,
  createdBy:S, recordedAt:N
}
Contribution = {
  id:S, workspaceId:S, planId:S, transferJournalEntryId:S, amountMinorUnits:N,
  contributionDate:S, idempotencyKey:S, createdBy:S, recordedAt:N,
  correctsContributionId?:S
}
StoredPlan = {
  id:S, workspaceId:S, sourceJournalEntryId:S,
  destinationFinancialAccountProfileId:S, title:S, principalMinorUnits:N,
  installmentCount:N, installmentMinorUnits:N, impliedAnnualRateBps:N,
  currency:S, activationMonth:S, idempotencyKey:S, createdBy:S, createdAt:N,
  replacesPlanId?:S
}
PlanView = {
  status:active|suspended|cancelled|completed,
  id:S, title:S, sourceJournalEntryId:S, sourceTitle:S,
  destinationFinancialAccountProfileId:S, destinationName:S,
  principalMinorUnits:N, installmentCount:N, installmentMinorUnits:N,
  impliedAnnualRateBps:N, activationMonth:S, currency:S,
  recoveredMinorUnits:N, remainingMinorUnits:N, targetMinorUnits:N, dueMinorUnits:N,
  cancellation?:Cancellation, replacesPlanId?:S, replacedByPlanId?:S,
  contributionHistory:[{
    ...Contribution, status:active|voided|corrected, transferReversed:B,
    correction?:Correction
  }]
}
Candidate = {
  journalEntryId:S, title:S, accountingDate:S, amountMinorUnits:N,
  financialAccountProfileId?:S, placeName?:S
}
Profile = {id:S, name:S, productKind:S}
```

`Cancellation.eventTime` and `recordedAt` are server milliseconds and equal for this immediate command. The correction's event date is the unchanged transfer's Accounting Date, separately from server `recordedAt`. The APIs do not accept caller-supplied audit timestamps. Recovery keys are nonblank, at most 200 characters, scoped to workspace and command. Correction-created replacement contributions do not occupy the normal contribution-command retry namespace. Reasons compare after trimming. Place names compare after trimming for exact no-op, and after NFD mark removal plus lowercasing for duplicate detection. Every current Place is active because retirement remains out of scope.

## Error codes

These are structured domain errors. Convex's own argument-validator failures remain framework errors rather than new custom codes.

| Code | When it occurs |
| --- | --- |
| `account_name_stale` | Rename's `expectedName` differs from the current name and the requested name is not already current. |
| `account_name_conflict` | Another Place in the workspace has the requested case/accent-insensitive name. |
| `name_required` | Rename trims to empty. |
| `financial_account_profile_not_found` | Rename's Place does not exist in this workspace. Also inherited by ledger posting for absent/foreign profiles. |
| `workspace_membership_required` | Accounting domain cannot load the actor's workspace. Public access normally fails earlier with `membership_required`. |
| `workspace_not_found` | Recovery store cannot normalize/load the workspace. Public access normally fails earlier. |
| `idempotency_key_invalid` | Recovery key is blank or over 200 characters. |
| `idempotency_key_conflict` | An existing Recovery key has a changed plan, source, destination, schedule, replacement link, contribution, reason or target payload. Posting also returns this code with `kind: accounting` for changed transfer payloads. |
| `reason_invalid` | Cancellation's supplied reason or correction's required reason is empty after trim or over 1000 characters. |
| `plan_not_found` | Cancellation, contribution or correction target plan is absent or outside the workspace. |
| `plan_already_cancelled` | Cancellation uses a different key for an already cancelled plan. |
| `plan_cancelled` | A new contribution or correction re-attribution targets a cancelled plan. |
| `plan_already_complete` | Cancellation or a new contribution has no remaining target, counting all valid contribution dates. |
| `replacement_plan_not_found` | Replacement reference is absent or outside the workspace. |
| `replacement_plan_not_cancelled` | Referenced plan has no cancellation decision. |
| `replacement_expense_mismatch` | Referenced cancelled plan covers a different expense. |
| `replacement_already_exists` | Another plan already links to the referenced cancelled plan. |
| `expense_not_found` | Activation source is absent, foreign or not a cash-expense entry. |
| `expense_not_recoverable` | Activation source is reversed/a reversal, or a contribution/correction target's expense has been reversed and the plan is suspended. |
| `expense_already_recovered` | Another non-cancelled plan reserves this expense. |
| `destination_not_found` | Activation destination is absent or outside the workspace. |
| `destination_must_be_asset` | Activation or contribution destination is not cash, bankAccount or savingsAccount. |
| `source_must_be_asset` | Contribution's transfer source is absent/foreign or is not an asset Place. |
| `installment_count_invalid` | Count is not one of 4, 6, 8 or 12. |
| `installment_below_minimum` | Installment is less than floor of remaining principal divided by count. |
| `installment_above_principal` | Installment exceeds the new plan's remaining principal. |
| `amount_must_be_positive` | Principal/installment or posted transfer amount is not a positive safe integer. Recovery and accounting use their respective kinds. |
| `contribution_not_found` | Correction's original contribution is absent or outside the workspace. |
| `contribution_already_corrected` | A different correction key targets an already corrected contribution. |
| `contribution_voided` | Original contribution's transfer has a ledger reversal. |
| `correction_target_same_plan` | Re-attribution target equals the original plan. |
| `correction_exceeds_plan_remaining` | Entire original attribution cannot fit in target's remaining commitment. Includes completed targets. |
| `transfer_capacity_exceeded` | Correction's replacement plus other active claims would exceed the real transfer. |
| `transfer_predates_activation` | Transfer's Accounting Date precedes target's activation calendar date in workspace timezone. Same-day transfers are allowed. |
| `transfer_destination_mismatch` | Real transfer does not land in the target plan's designated Place. |
| `transfer_not_usable` | Supporting entry is a reversal/non-transfer/unavailable, or has no usable value. |
| `transfer_not_found` | Contribution's transfer is absent, foreign or not an account transfer. |
| `transfer_reversed` | A new attribution attempts to use a reversed transfer. Correction uses `contribution_voided`. |
| `transfer_already_attributed` | No capacity remains on the transfer for a new attribution. |
| `month_invalid` | Evaluation month is not a real `YYYY-MM` from year 0001. |
| `amount_out_of_range` | Derived progress or target arithmetic exceeds safe integer range. |

The existing `recordContribution` posting command also retains these accounting errors. Activation/cancellation/correction make no accounting posts and do not inspect period locks.

| Accounting code | When it occurs |
| --- | --- |
| `currency_mismatch` | Transfer currency differs from the workspace's functional currency. |
| `transfer_profiles_must_differ` | Source Place equals the plan's destination Place. |
| `idempotency_key_required` | Posting receives an empty key, normally rejected earlier by Recovery. |
| `accounting_date_required` | Transfer date is absent, malformed or not a real calendar date. |
| `activity_before_opening` | Transfer predates an affected Place's active opening. |
| `locked_period` | A new real transfer is dated into a locked period. Exact acknowledged posting retries still replay. |
| `ledger_account_not_found` | A profile's linked posting account is missing or belongs to another workspace. |
| `journal_entry_incomplete` | Generated journal has fewer than two lines, an internal posting-integrity failure. |
| `journal_line_invalid` | A generated line has invalid amounts/sides, an internal posting-integrity failure. |
| `posted_journal_entry_unbalanced` | Generated debits/credits disagree or overflow, an internal posting-integrity failure. |
| `ledger_summary_not_ready` | Workspace's ledger-total backfill is incomplete. |
| `ledger_totals_out_of_range` | Posting would overflow supported ledger totals. |

All public functions retain the security codes `authentication_required` for no signed identity, `session_required` for missing/invalid signed session/issuer, `session_inactive` for inactive, expired, mismatched or absent live Clerk session, `provider_unavailable` for provider request/configuration/response failure on writes, `session_verification_required` for a stale or mismatched internal live observation, `device_registration_required` for an absent/mismatched device or client binding, `device_revoked` for a revoked device/session, `membership_required` for missing workspace membership and `permission_denied` for an unsupported role/permission. Protected reads use signed session/local device authorization and do not make live Clerk REST calls. Writes check live Clerk again even for retries.

## Decisions and evidence limits

The existing aggregate model stores no principal/premium split per installment. The cited ADRs require retaining contributed premium and releasing only unrecovered principal, but do not define that split for this aggregate subset. The bounded rule here is `floor(valid recovered amount * frozen principal / frozen target)` recovered principal per plan, calculated with integer arithmetic. All remaining valid source principal can fund the replacement. Example: principal 1,200,000, frozen target 1,380,000, contribution 230,000 retains 200,000 recovered principal and 30,000 historical premium. Replacement principal is 1,000,000. Unpaid 150,000 old premium is discarded. No installment allocation, bundle, waterfall or automatic imported-transfer proposal was added. Coordinator should confirm this aggregate policy before runtime acceptance.

ADR-0073 disagreed with the prior code, which allowed contributions dated before plan activation. New attributions now enforce activation calendar date in workspace timezone. Historical rows remain retained; exact old receipts replay without applying the new guard retroactively. The existing test fixture activated on September 24 but transferred on September 18. Its activation now occurs September 17 so the regression examples comply with ADR-0073.

"Model the Domain" shaped the append-only cancellation/correction records and derived statuses. "Sequence work into verifiable units" shaped the separate Place commit and Recovery checks. The required no-subagent rule superseded the Poteto how/architect/comment-review delegation steps. I traced and reviewed those paths directly. No PR workflow ran because the conventions forbid it. No new code comments or suppressions were added; existing progress comments moved with their function.

Throughput checkpoint: blocking work was offline install plus ADR/security reading. Place and Recovery were the two behavior units. Shared types, schema and read/write adapters required sequential edits in one checkout. No worker fan-out was permitted. The local tests are the rerunnable checks.

## Migration and scope

No development-row migration is required. `savingsRecoveryPlans.replacesPlanId` and `savingsRecoveryContributions.correctsContributionId` are optional. Existing rows keep their interpretation. New `savingsRecoveryCancellations` and `savingsRecoveryCorrections` tables start empty. Ledger/account/profile schema is unchanged. No deployment or reset ran.

The four mobile test files touched only add empty history and absent cancellation/replacement fields to fixtures to keep typecheck compiling: `features/budget/PlansRoute.test.ts`, `features/recovery/RecoveryScreens.test.ts`, `features/recovery/model.test.ts`, and `features/recovery/useRecoveryMove.test.ts`. No mobile product screen, navigation, new dependency, private verification input, mapping or source capture changed.

## Coordinator's real-provider acceptance

Keep SEN-118 and SEN-23 open. SEN-55 remains a completed specification, not implementation acceptance. The worker did not deploy and has no deployed/authenticated/UI evidence. This worktree has no `.verification/provider/provider-verification.json`; the coordinator must record acceptance in the program's authoritative gate after integration.

Record the final integrated app build/source, Convex development URL and deployed source. Admit an actual Clerk user/device through the normal flow. Run the public actions and read the result through UI against that backend. Check first/additional Place rename across restart, history, pickers, mappings and Recovery destinations, including sole-Place title. Check duplicate/stale/blank names and exact repeat. Cancel active and suspended plans with/without contributions, completion rejection, exact and changed retries, preserved journals/balances and correct released principal. Activate a linked replacement and check both directions and no double-counted contributions. Correct attribution with and without a target across a locked period, inspect event/recording times and links, reverse the supporting transfer, and reject voided/already-corrected/cancelled/foreign/pre-activation/over-capacity targets. Exercise revoked-device, removed-membership and transient-provider denial before successful same-intent retries. Repeat mobile entry, child, cancel and return twice with Android Back and sheet dismissal when screens are implemented. Production and cutover restrictions remain in force.

## Observed local validation

At source `778a70d3cc50039fb1d5d6eef33d2a3e7ed6f2c3`:

- `pnpm install --frozen-lockfile --offline` succeeded, with the existing ignored-build-script notice. No dependency changed.
- `pnpm vitest run convex/accountPlaces.test.ts convex/accountingBoundary.test.ts convex/savingsRecovery.test.ts src/savingsRecovery` passed all 70 tests in five files.
- `pnpm vitest run` exited 1, with 1,363 passed and one failed test in 128 files. The sole failure is the documented baseline `apps/mobile/src/features/attention/draftsRoute.test.ts` test `a failed server request refreshes the inbox without showing confirmation`, line 265, expected false but received true for the Confirm all Ready disabled property. That file was left unchanged.
- `pnpm typecheck` exited 0, including the mobile TypeScript check.
- `git diff --check` passed.

The final committed-source test summary and typecheck output are in `reports/mvp-2026-11-10/lifecycle-validation.txt`. Development deployment, deployed source, actual Clerk admission and UI/device acceptance remain untested by instruction.
