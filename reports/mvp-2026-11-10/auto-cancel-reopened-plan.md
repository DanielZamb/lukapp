# Automatic cancellation of reopened Recovery plans

1. Branch `t3/auto-cancel-reopened-plan` starts at integration commit `f968044`. Product source is commit `6a4e1dd8e10f00b41c2b985eaab06e970f4ace1f`. The following receipt commit adds only this report and its test/typecheck logs. No push, PR, deployment, device operation or data reset ran.

2. A transfer reversal or contribution correction that turns a completed plan into an unfinished plan now appends an automatic cancellation when the same expense already has an unfinished plan. The existing plan keeps its principal, schedule and contributions. Cancellation moves no money. Released principal becomes a candidate only after no unfinished plan reserves the expense, using the existing proportional principal/premium rule. Old cancellation rows remain valid and read as decisions by the person without being rewritten.

3. Recovery owns the new `src/savingsRecovery/cancelReopenedPlans.ts` handler. `convex/accountingWrites.ts:reversePostedEntry` first calls the unchanged accounting core, then calls that handler before returning from the same internal mutation. A replay skips the handler. `src/savingsRecovery/correctContribution.ts` calls the same handler after appending the correction, within `convex/savingsRecoveryWrites.ts:correctContribution`'s mutation. An exception rolls back the trigger and the cancellation together. Progress still observes reversals from the ledger; no contribution void row or read-time cancellation write was added.

The alternatives considered were:

| Placement | Decision |
| --- | --- |
| Accounting domain writes Recovery tables | Rejected because the accounting core would own a planning decision. |
| Async event handler or a second mutation | Rejected because a successful reversal could be visible before the cancellation. |
| Query-derived cancellation | Rejected because the decision would not be appended and durable. |
| Convex mutation composes the accounting core and a Recovery-owned handler | Chosen because both writes share the transaction while each domain owns its rules and tables. |

The handler computes progress before and after this particular invalidation. Only an uncancelled plan that changes from zero remaining commitment to positive remaining commitment is newly reopened. Another uncancelled plan for that expense with positive remaining commitment before and after the operation keeps its reservation, including when suspended. Its activation timestamp and replacement link do not change that priority. Thus in the requested A cancelled, B replaces A and completes, C starts for the remainder chain, B is cancelled and C stays. A is unchanged. If the reopened plan is the latest one and no other unfinished plan exists, it simply reopens.

One shared transfer can also reopen several completed plans in a single reversal. With no previously unfinished plan, the handler keeps the plan with the greatest `createdAt`, breaking a timestamp tie by ascending plan ID, and cancels the others. This prevents a second overlap through shared transfer capacity. A separate regression also confirms that a previously unfinished plan keeps priority even when the next reopened plan has a later activation timestamp.

The cancellation's `eventTime` is the instant of the automatic planning decision, and `recordedAt` separately records its persistence time. Both use the mutation's current time, not a potentially backdated reversal accounting date or the corrected contribution's original date. Existing month filtering applies cancellation status beginning in that event's workspace month. The earlier-month regression checks September's active status, zero recovered, 1,000,000 remaining and 250,000 due before an October completion and November cancellation. Existing monthly reads still restate reversed/corrected contribution progress and expose later history and current action permissions; they are not an as-known-at snapshot query.

The public field for mobile is `evaluate.plans[].cancellation.origin`. It is present whenever `cancellation` is present. The `cancelPlan` receipt also returns it. All existing fields remain.

```ts
type RecoveryCancellationOrigin =
  | { kind: "person" }
  | {
      kind: "automatic";
      unfinishedPlanId: string;
      cause:
        | {
            kind: "transfer_reversed";
            transferJournalEntryId: string;
            reversalJournalEntryId: string;
          }
        | {
            kind: "contribution_corrected";
            contributionId: string;
            correctionId: string;
          };
    };
```

`unfinishedPlanId` identifies the plan whose commitment stays. `createdBy` remains the actor who submitted the triggering command; `origin.kind` identifies whether the person or Lukapp made the cancellation decision. Automatic causes are structured IDs rather than stored translated copy. The existing optional `reason` remains available for the person's explanation. Mobile can localize the automatic explanation using `cause.kind` and the linked records. Missing persisted origins normalize to `{ kind: "person" }` on reads and manual cancellation replays. An automatic cancellation cannot be replayed as a person's cancellation by copying its internal request key. A new manual cancellation request on that plan returns `plan_already_cancelled`.

4. `pnpm install --frozen-lockfile --offline` passed without fetching packages or changing dependencies. The new public regression first failed for both reversal and correction on the baseline because the old plan remained active. Final `pnpm vitest run` passed all 1,927 tests in 158 files, exit 0. The baseline supplied by the coordinator had 1,914 tests; this change adds 13 cases and replaces the earlier expectation that permitted two unfinished plans. Final `pnpm typecheck` passed root and mobile, exit 0. `git diff --check` passed. Raw output is in `auto-cancel-reopened-plan-tests.txt` and `auto-cancel-reopened-plan-typecheck.txt` beside this report. An intermediate typecheck caught the new required field missing from the mobile fixture; the one-line fixture update resolved it.

The public regression uses an expense of 1,200,000, a cancelled predecessor with 230,000 contributed toward a 1,380,000 target, a completed replacement with 1,000,000 principal, and a newer plan with 200,000 principal. After voiding the replacement's contribution, the replacement is cancelled, the newer plan still has four installments of 50,000, and exactly one plan remains unfinished. Finishing that newer plan exposes a candidate of 1,000,000. The reversal alone adds a journal, leaving the source balance at -1,430,000 and the destination at 230,000. A planning correction leaves the complete journal and balance views identical. Exact trigger replay returns the same receipt and appends no extra cancellation; changed intent under the same key rejects. Fault-injected cancellation storage failures prove that both public trigger mutations roll back their ledger or correction writes. These are local regression checks, including synthetic authentication and an injected storage fault, not provider acceptance.

The throughput checkpoint used one owner throughout. Blocking work was reading the ADRs and tracing and reproducing the public failure. There were no independent delegated workstreams because worker conventions forbid subagents and the transaction is coupled. Shared state was confined to one Convex mutation. The smallest safe decomposition was the cancellation origin contract, Recovery-owned transition handler, mutation composition, then domain/public checks. Direct source and comment review replaced delegated review. No comments or suppression directives were added. Model the Domain and Type System Discipline led to the tagged origin/cause union. Test Behavior, Not Implementation led to literal progress, ledger and principal assertions. Prove It Works kept local execution separate from live acceptance. No unresolved implementation choice remains within this backend scope.

5. Real-provider and full UI acceptance remain open on SEN-23. This worker has no deployed-source or actual Clerk-admission evidence. The coordinator must deploy the integrated source to the named Convex development deployment, record its URL and source SHA, sign in through real Clerk with the registered device, and repeat the public reversal/correction chain and no-conflict cases. Record exact requests, expected and observed outcomes, exact replay and changed-intent rejection, current authorization failures, cancellation origin/cause persistence after restart, unchanged newer terms, and ledger deltas. Native mobile work must explain that Lukapp cancelled the plan and why, using the new field, and exercise that deployed backend. Record this evidence in `.verification/provider/provider-verification.json`; no production or cutover acceptance is claimed here.

6. The necessary scope extensions are `convex/schema.ts`, which adds only the optional origin on the Recovery cancellation table, and `apps/mobile/src/features/recovery/Recovery.test.ts`, which adds `{ kind: "person" }` to the shared cancellation fixture so the new required read contract compiles. The accounting adapter change is limited to reversal orchestration. No Budget, personal defaults, workspace settings or mobile runtime code changed. No migration or new dependency is required.
