# Recovery event calendar dates

Branch `t3/recovery-event-calendar-dates`, based on integration commit `eddfa61`. The failing acceptance tests are commit `83335b1`. Tested implementation source is `6bb646dadd304422886fd402c517ebe2052614e4`. The final handoff commit adds this report and validation logs only.

Recovery now retains the activation day and cancellation day when those events happen. A Bogotá plan activated at 23:30 on October 31 still accepts an October 31 transfer and rejects October 30 after changing to Auckland or Los Angeles. A new plan uses the new zone. September stays active and October stays cancelled for an October cancellation. Tests include October 2 and month-boundary instants that previously moved cancellation into September or November. Automatic cancellations caused by reversing a transfer or correcting attribution also retain their event date.

## Design and compatibility

The optional database fields are `savingsRecoveryPlans.activationDate` and `savingsRecoveryCancellations.cancellationDate`. Domain records require both dates after the store adapter resolves legacy rows. New activation writes `activationDate` once and derives `activationMonth` from that same string. Existing activation months, schedules, timestamps, contributions, corrections, journals and command intent are retained.

`src/savingsRecovery/eventCalendarDate.ts::resolveEventCalendarDate` resolves a missing date using the `previousValue` of the earliest time-zone change strictly after the event timestamp, or the workspace's current zone when none exists. Tests cover no changes, unsorted receipts, before/between/after two changes, and exact timestamp equality. `convex/savingsRecoveryStore.ts::recoveryEventDateResolver` supplies only actual changed time-zone receipts for this workspace. It lazily loads the workspace and receipt history once per store or backfill invocation. Stored dates take precedence. Reads work before, during and after backfill.

Command receipts deliberately retain their previous shapes. `activatePlan` omits `activationDate` from both initial and replay receipts, and `cancelPlan` omits `cancellationDate` from both. This avoids adding fields to an old command receipt after enrichment. The activation and cancellation idempotency comparisons remain unchanged. Public API tests insert legacy records without dates and assert literal original receipts, changed-payload rejection, and the same receipts after backfill. Legacy cancellations without an origin still replay with the existing person default.

The additive public read fields are `savingsRecovery.evaluate.plans[].activationDate` and `savingsRecovery.evaluate.plans[].cancellation.cancellationDate`. Both are resolved `YYYY-MM-DD` strings. The latter exists when a cancellation exists. All other public arguments and receipt fields retain their contract.

Model the Domain shaped the choice to require calendar facts in domain records and resolve optional storage fields at the adapter. Type System Discipline shaped the separate `RecoveryPlanReceipt` type and the typed legacy fixtures. No product question remains unresolved. Delegated architecture and comment reviews were skipped because the worker instructions prohibit subagents. The diff adds no code comments or suppressions. The deferred PR workflow was skipped, as requested.

## Conversion audit

The whole `src/savingsRecovery/` directory and all `convex/savingsRecovery*.ts` modules were searched for date constructors, calendar helpers, time-zone reads, event times, recording timestamps and stored date/month use.

| Location | Finding and resulting behavior |
| --- | --- |
| `lifecycle.ts::requireContributionDate` | Previously converted `plan.createdAt` with the current zone. Now compares the transfer date directly with `plan.activationDate`. All callers in `recordContribution.ts`, `recordRecoveryMove.ts` and `correctContribution.ts` use that comparison. |
| `evaluate.ts::cancelledInMonth` | Previously converted `cancellation.eventTime` with the current zone. Now compares the viewed month with the stored cancellation date's month. |
| `activatePlan.ts` | Converts only the new event's `input.now` in the zone at activation, then stores the date and its month. It never recomputes a past activation. |
| `cancelPlan.ts`, `cancelReopenedPlans.ts` | Convert only the new cancellation's `input.now` in the zone at cancellation and store its date. This includes automatic cancellation from both reversal and correction. |
| `policy.ts::currentRecoveryMonth`, `evaluate.ts` | The current month and default viewed month intentionally derive from `input.now` in the current zone. Scheduling uses the stored `activationMonth`. |
| `recordContribution.ts`, `recordRecoveryMove.ts` | Contributions retain the supporting transfer's stored Accounting Date. `recordedAt` remains an audit timestamp. No past timestamp is converted. |
| `correctContribution.ts` | The correction and any replacement attribution copy the original `contributionDate`. Their `recordedAt` values remain the correction instant. The target's stored activation day governs eligibility. Public API tests cover correction after both zone directions. |
| `progress.ts`, `lifecycle.ts::remainingPrincipal`, `evaluate.ts` history and candidates | Progress slices stored contribution date strings to months. History sorts stored dates with audit timestamp tie-breakers and returns stored dates and timestamps. Candidate dates come from ledger Accounting Dates. No historical timestamp conversion occurs. |
| `savingsRecoveryStore.ts`, `savingsRecoveryWrites.ts` | Only legacy fallback and backfill convert historical timestamps, through the shared receipt-based resolver. Ledger/reversal adapters copy Accounting Dates. Validators, errors and the public action wrappers contain no calendar conversion. |

## Run the backfill to completion

The internal mutation is `savingsRecoveryWrites:backfillEventCalendarDates`.

Arguments are `workspaceId`, a Convex workspace ID; `table`, either `"plans"` or `"cancellations"`; `cursor`, initially `null`; and optional `batchSize`, an integer from 1 through 250, default 100. Results are `{ cursor, done, scanned, updated }`.

After integrating and deploying this source to the named development deployment, start the plans pass:

```sh
pnpm exec convex run --deployment '<NAMED_DEV_DEPLOYMENT>' --codegen disable savingsRecoveryWrites:backfillEventCalendarDates '{"workspaceId":"<WORKSPACE_ID>","table":"plans","cursor":null,"batchSize":100}'
```

If `done` is false, call the same mutation with the returned cursor and unchanged workspace/table. Continue until `done` is true. Then start a separate cancellations pass with `table` set to `"cancellations"` and `cursor` reset to `null`, and continue until its `done` is true. Repeat for each workspace needing migration. A restart from `null` is safe. A second complete pass reports zero updates. Never reuse a cursor across tables or workspaces. The installed CLI's `convex run --help` confirms `--deployment` and `--codegen disable`.

Each call scans at most `batchSize` Recovery rows in one workspace/table and patches only missing dates. The receipt history is read once per invocation when a missing date needs resolution. The mutation does not self-schedule, delete rows, rewrite months or receipts, or modify ledger tables. It rejects invalid batch sizes and missing workspaces. The caller owns both pagination passes and the development environment selection. No backfill or deployment ran in this worker.

## Local evidence and remaining acceptance

`pnpm install --frozen-lockfile --offline` succeeded. No dependency or lockfile changed. It emitted the repository's ignored dependency build-script warning. The first public API repro failed exactly 3 tests with 28 passing. `repro.txt` retains the observed errors, including `transfer_predates_activation`, October unexpectedly active in Auckland, and September unexpectedly cancelled in Los Angeles. Those expectations now pass.

The initial implementation checks exposed an erroneous `.then` on an awaited array, the in-memory adapter returning a date in a receipt, and expected fixture/type differences. These were corrected. The last focused run passed 114 tests in six files before the final missing-workspace negative was added. The final `pnpm vitest run` passed all 2,001 tests in 162 files, exit 0. `pnpm typecheck` passed root and mobile, exit 0. `git diff --check` passed. Complete final outputs are `tests.txt` and `typecheck.txt`. `validation.txt` records commands and exit results. All evidence is local regression evidence using the repository's controlled provider transport and synthetic identities.

The coordinator must keep runtime acceptance open on SEN-118. Record the exact integrated source/build, deployed Convex development source and URL, genuine Clerk admission, normal public API requests and expected/observed outcomes in `.verification/provider/provider-verification.json`. Exercise the October activation and cancellation cases in both zone directions, a new activation after the change, manual and automatic cancellation, correction history, legacy reads before and after both backfill passes, exact retries and changed-payload rejection. Recheck revoked-device and removed-membership denial. Drive Recovery UI against that deployment and confirm contributions, cancellation status and correction history after reload. No development deployment, real Clerk session, native UI, physical device or production evidence was produced here. No implementation ticket was closed.

The only edits outside the Recovery backend/domain are date additions to five mobile test fixture files required by the additive read types: `apps/mobile/src/features/budget/PlansRoute.test.ts` and `apps/mobile/src/features/recovery/{Recovery,RecoveryScreens,model,useRecoveryMove}.test.ts`. No mobile runtime, catalog, Budget implementation or time-zone command changed. No Python workaround was used. The primary checkout and private verification assets were untouched.
