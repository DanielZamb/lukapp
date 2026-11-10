# Workspace settings after setup

Branch `t3/workspace-settings-after-setup`, based on integration `f968044`. Final tested implementation source is `27c85b97fefb01c2af6640b15317fa83565ef768`, following implementation commit `02b5b2d0f38fadff28fab32eeaf7ac1f07fe294b`. The report commit follows the implementation commits. This implements ADR-0093 and supersedes only the obsolete workspace-settings prohibition in worker-conventions.md. No push, deployment, device access, dependency change, or edit to another worktree occurred.

The backend now exposes separate authorized commands for Default Place, workspace time zone, and Functional Currency. Each public action verifies the live session. Its internal mutation checks the current signed identity, bound unrevoked device and client, and Owner membership through `requireSubmission` with `workspace:admin`, including on replay. Every successful request stores an append-only receipt. Its key is scoped to the workspace across all three commands. Exact replay returns the identical receipt, including its original timestamp and previous value. A changed command, requested value or expected value under that key conflicts. Replay does not restore an older setting over a newer one.

The current Default Place is `workspaces.defaultFinancialAccountProfileId`. It falls back to the first Place for legacy rows. I chose a workspace field rather than a separate settings table because the setting is one workspace-owned pointer and has no financial or per-device meaning. `personalDefaults.financialAccountProfileId` retains the first Place identity. New setup stores `personalDefaults.setupResult`, an immutable response snapshot. Legacy setup reconstructs that original response before the first settings change using the recorded setup time, original first-Place identity, known initial name/product, and initial open period. This also preserves replay after a later rename or month boundary. Queries return current defaults; setup retries return the original setup receipt.

Default Place changes validate the target in `src/accounting/commands/chooseDefaultPlace.ts::requireSelectableDefaultPlace`, reject foreign or absent profiles, and compare the expected previous pointer. Choosing the current Place succeeds even with a stale expectation, with `changed: false`. No journal, line, opening marker, accounting period, balance or posted history is changed. All Places are currently open. The reusable selector and explicit workspace pointer are the seam for the later closing command, which must reject closing that pointer or atomically choose another open Place. Closing is not implemented.

A time-zone change takes effect at its server mutation time. Today and the current month immediately follow the new IANA zone, in either direction across a day/month boundary. Existing accounting dates and period keys remain literal stored facts. The change does not open, unlock or relabel a period. Posting still checks the submitted Accounting Date against its own stored period and opening boundary. A caller can legitimately post in another open month even if the new current month differs. Backend cash-entry commands still require an explicit Accounting Date. The mobile caller derives a new default date from the workspace zone, or can use `workspaceSettings.today`.

Setup with a non-zero starting amount posts a `start-tracking@1` journal. It already permanently blocks currency changes. Zero setup stores a zero opening marker and posts no journal, so a currency change remains available. The permanent entry check includes every journal policy and reversals. Other currency records block the change too: journal lines, Budget revisions, Recovery plans/contributions/corrections, ledger totals, notification intake receipts and non-zero account setup/opening records. Only zero opening/setup amounts are allowed. The first real currency change consumes the one-change allowance. A same-currency no-op does not consume it. An exact successful request remains replayable after subsequent activity; every fresh currency-change request then fails with `functional_currency_has_entries` for a supported target currency.

Currency changes update the workspace and all zero `financialAccountOpenings.amount.currency` and `financialAccountSetups.amount.currency` fields. Profiles and ledger accounts have no currency field. Original setup response snapshots deliberately retain the original currency. Zero opening/setup receipts preserve their original submitted currency in `originalCurrency`, so their original public requests still replay and changed request currencies conflict. No journal, Budget revision or Recovery record is rewritten.

The design alternatives were the live pointer on the setup record, a new settings table, and a workspace field. The live setup pointer would mix original intent with current preference. A table adds a join for one workspace value. The workspace field plus separate original receipt keeps both meanings explicit. Model the Domain shaped that separation. Type System Discipline shaped validator-derived receipt types. Prove It Works shaped the public-function tests and saved-fact assertions. Architectural exploration and comment review ran in this worker because the task expressly prohibited subagents.

The throughput checkpoint was to trace authorization and historical calendar use first, then keep command writes serial because they share a workspace transaction. Tests and typecheck ran independently. One worker owned the coupled schema, defaults and accounting changes. No implementation or review agent was started.

The exact mobile contract is additive. Validators live in `convex/accountingValues.ts`, and exported public functions live in `convex/accounting.ts`. All action argument fields below use `v.string()`, are required, and accept no caller-supplied actor/session.

```ts
api.accounting.changeDefaultPlace({
  workspaceId, financialAccountProfileId,
  expectedFinancialAccountProfileId, idempotencyKey,
})
api.accounting.changeWorkspaceTimeZone({
  workspaceId, timeZone, expectedTimeZone, idempotencyKey,
})
api.accounting.changeFunctionalCurrency({
  workspaceId, functionalCurrency, expectedFunctionalCurrency, idempotencyKey,
})
```

Time zones use setup's `requireTimeZone`, including IANA validation/canonicalization and rejection of numeric offset identifiers. Currency uses setup's `requireFunctionalCurrencyCode`, including the supported functional-currency set. Keys must contain non-whitespace text. Exact request matching preserves the raw requested zone, even when normalization yields the same canonical zone. Send the current values from the read as the expected values, and retain the complete submitted payload and key through an uncertain result.

Every command returns this same validator shape. There is no replay boolean, because replay returns the original receipt exactly. `changed: false` identifies a no-op. Millisecond timestamps are numbers; all IDs and values are strings. The `setting` field is a literal union.

```ts
type Receipt = {
  id: string;
  workspaceId: string;
  setting: "defaultPlace" | "timeZone" | "functionalCurrency";
  previousValue: string;
  value: string;             // The accepted canonical value.
  requestedValue: string;    // The exact originally requested value.
  expectedValue: string;
  changed: boolean;
  idempotencyKey: string;
  changedBy: string;
  changedAt: number;
};
```

`api.accounting.personalDefaults({})` retains its existing validator. `financialAccountProfile` now resolves the current Default Place, while `workspace.timeZone` and `workspace.functionalCurrency` are current. Mobile already reads this query through `usePersonalDefaults` in `apps/mobile/src/features/activity.ts`, including `apps/mobile/app/post.tsx`. It must not treat the original response from `ensurePersonalDefaults` as a current settings read.

`api.accounting.workspaceSettings({ workspaceId })` requires `workspace:read` through the normal device gate and returns this required shape. `today` is `YYYY-MM-DD`. `currencyChangeBlockedReason` is null or one of the three exact strings below. Eligibility is advisory; the mutation checks it again atomically.

```ts
{
  workspaceId: string;
  defaultFinancialAccountProfileId: string;
  timeZone: string;
  functionalCurrency: string;
  today: string;
  canChangeFunctionalCurrency: boolean;
  currencyChangeBlockedReason: null
    | "functional_currency_has_entries"
    | "functional_currency_has_records"
    | "functional_currency_already_changed";
}
```

`api.accounting.workspaceSettingHistory({ workspaceId })` has the same read gate and returns `Receipt[]`. These records are append-only. It includes no-op requests with `changed: false`; consumers presenting only actual changes can filter them. There is no update or delete function. History uses `previousValue` and `value` for the previous/new zone or currency and `changedBy`/`changedAt` for actor/time.

Domain failures are structured Convex errors with `{ kind: "accounting", code, message }`. The mobile worker must map codes through the shared language catalog. New codes are `default_place_stale`, `time_zone_stale`, `functional_currency_stale`, `functional_currency_has_entries`, `functional_currency_has_records`, and `functional_currency_already_changed`. Other command errors are `financial_account_profile_not_found`, `time_zone_invalid`, `functional_currency_invalid`, `idempotency_key_required`, `idempotency_key_conflict`, and setup-state `defaults_unavailable`. Setup retains `setup_conflict` for changed original answers. Authorization uses the existing structured codes, including `authentication_required`, `session_required`, `session_inactive`, `session_verification_required`, `device_registration_required`, `device_revoked`, `membership_required`, and `permission_denied`, plus provider failures. Preserve any `wipeLocalInput` instruction. Entry existence takes precedence over the prior-change and denominated-record blockers; exact old receipt replay precedes all financial eligibility checks but never authorization.

The time-zone audit covered every financial zone/calendar reader in `convex/` and `src/`.

| Reader | Finding and disposition |
| --- | --- |
| `src/accounting/timeZone.ts` | Validates/canonicalizes zones, formats a date/month, and supplies the legacy Bogotá fallback. No recorded date is changed here. |
| `src/accounting/period.ts::clockMonth`, `commands/createPersonalWorkspace.ts` | The initial accounting month is stored at setup; no re-derivation of old periods. |
| `src/accounting/queries/openWorkspace.ts` | Deliberately derives the current month at read time and looks up that exact period without changing its status. Both zone directions are tested. |
| `src/accounting/views.ts`, `convex/store.ts::getWorkspace` | Expose the current zone/fallback. Existing journal views use stored Accounting Dates and period keys. |
| `convex/personalDefaults.ts` | Setup opening date uses the zone at write time. Fixed replay comparisons so current mutable settings cannot replace original setup intent. |
| `src/accounting/queries/postedActivity.ts` | Found moving `trackingFrom` fallback for Places without opening markers. New profiles store `createdAccountingDate`; before the first zone change, legacy profiles freeze that date using the old zone. The read prefers it. Existing opening markers retain their stored date. |
| `convex/store.ts::insertProfile` | Now persists the creation date in the workspace zone. This applies to all public Place-creation paths. |
| `convex/workspaceBackfill.ts` | Fills missing zones with the existing Bogotá fallback. No current-zone historical projection. |
| `convex/budget.ts`, `convex/budgetStore.ts`, `src/budget/policy.ts`, `src/budget/evaluateMonth.ts`, `src/budget/setCategoryLimit.ts` | Current month intentionally follows the current zone. Revisions retain `effectiveMonth`; consumption uses journal Accounting Dates. October revision, October consumption and exact revision replay survive the switch. No edit needed. |
| `convex/savingsRecoveryStore.ts`, `src/savingsRecovery/policy.ts`, `activatePlan.ts`, `evaluate.ts` | Current Recovery month intentionally follows the current zone. Stored `activationMonth` and stored contribution dates do not move. Those facts are covered by public API tests. |
| `src/savingsRecovery/lifecycle.ts::requireContributionDate` | Unfixed scope handoff. Re-derives activation day from `plan.createdAt` using the current zone. A new October 31 contribution after the switch incorrectly raises `transfer_predates_activation`. |
| `src/savingsRecovery/evaluate.ts::cancelledInMonth` | Unfixed scope handoff. Re-derives cancellation month from `cancellation.eventTime` using the current zone. An October cancellation incorrectly appears active when viewing October after the switch. |
| `src/i18n/format.ts` and zone fields in validators/types | Generic presentation helpers and data declarations. They do not decide financial dates. No edit needed. |

The coordinator must fix Recovery before enabling these settings in a deployment. Add stored `activationDate` to each plan when it is activated, using `calendarDate(input.now, zoneAtWrite)`. Keep `activationMonth` consistent with that date. Make `requireContributionDate` compare with `plan.activationDate`, never with a current-zone conversion of `createdAt`. Add a stored `cancellationDate` or `cancellationMonth` at cancellation and make `cancelledInMonth` compare that stored calendar fact. Propagate the fields through Recovery domain types, validators, store adapters and plan/cancellation command receipts. Those files belong to the concurrent worker and were not edited here.

Backfill legacy Recovery calendar facts using the zone in force at their event time before admitting mutable-zone commands. Before any zone change that is the legacy workspace zone. If changes already exist, use ordered changed time-zone receipts and their `previousValue`/`value` at each event time. Do not backfill with the latest zone after a change. The two tests named `coordinator gap witness` in `convex/workspaceSettings.test.ts` assert the current incorrect rejection/projection so the defects are reproducible through the public API. They are defect witnesses, not acceptance tests. Replace their assertions with the desired successful October contribution and October `cancelled` status after the fixes, and add the reverse-zone direction. There are no skipped or expected-failure tests.

No file outside the assigned backend/accounting scope changed. `convex/workspaceSettings.test.ts` is the added backend test file. `convex/accountingBoundary.test.ts` now enumerates the three actions and two reads, extending the existing provider/handoff matrix to them. No `apps/mobile` changes were needed. The only generated handoff files are this report, `validation.txt`, `tests.txt` and `typecheck.txt` under this report directory.

Final validation is local regression evidence only. The full suite passed 1,939 tests across 159 files, and root/mobile typecheck passed. Exact commands and exit results are in `validation.txt`, with complete logs alongside it. Development runs initially exposed the boundary registry's new-action enumeration, incorrect fixture category/line shapes and invalid Recovery installment counts; those were corrected. An intermediate typecheck rejected a heterogeneous action/argument tuple in a test; typed call closures fixed it. The final run has no failing tests or type errors. No benchmark claim is made.

Runtime acceptance is open. No deployment URL, deployed-source receipt, actual Clerk admission, authenticated development API requests or native UI evidence was produced because deployment and device work were excluded. This fresh checkout does not contain `.verification/provider/provider-verification.json`; the coordinator must retain and update the authoritative gate in its configured checkout. Do not infer live acceptance from the test transport's synthetic identity.

After merging the Recovery fixes, the coordinator must record the exact integrated source/build, named Convex development URL and deployed source. Admit a real Clerk session on its bound device and call all three normal public APIs, with original/changed payload retries, stale expectations, foreign Place, revoked device and removed membership checks. Check zero/non-zero setup, expense and second currency change refusal, reload the current Default Place in Post, and confirm old journals, locked periods, Budget history, Recovery activation and cancellation dates and existing contributions. Repeat both zone directions at the month boundary. Exercise the mobile settings flows against that same deployment and keep physical-device or hardware gaps explicit. No production cutover is authorized here. SEN-118 remains open.
