# C03 Budget contract and design

This is the implementation contract for SEN-61, not a settled product decision. The recommended simple starting choice is `singleStanding`, `totalExpense`, `none` rollover, and `prospective` limit changes. All alternative policies below remain reviewable choices for F05/V01. SEN-61/48/75 have no resolution comments in the frozen source.

## Usage and signatures

All six public operations use the existing Owner/device exact-operation wrappers. Actor is server-admitted. Create/update/retire require current Workspace `manageBudgets`, granted only to Owner in `workspace-roles@3`; reads require View. Clients send fresh proof even for an exact command retry.

```ts
createBudget({ workspaceId, name, startMonth, target, cardinality, rollover, limit, idempotencyKey })
updateBudget({ workspaceId, budgetId, revision, change, idempotencyKey })
retireBudget({ workspaceId, budgetId, revision, effective, idempotencyKey })
listBudgets({ workspaceId })
evaluateBudgets({ workspaceId, month, selection? })
budgetImpactWarning({ workspaceId, proposal })
```

`target` selects total Expense, an actual Workspace Expense Ledger Account ID, or one shared Category ID. New Category targets require active resolved Expense classification. Immutable target snapshots describe the choice; archived, merged or converted categories keep historical exact-ID matching. Budgets never follow a merge to another ID. Actual Expense account nature determines qualification, even on corrective lines whose category snapshot describes an earlier nature.

`cardinality` is `singleStanding | multipleNamed`. Single means one effective rule at any calendar month, not one forever-stored record. A new single can begin on/after the old one's retirement month. Overlapping single/multiple lifecycles conflict. Multiple names must be distinct among overlapping lifecycles. Rules compare independently; `independentRulesDoNotSum` explicitly forbids adding their spend/allowance/remaining/overage. Within each rule each real line counts once. No target arrays, category groups, hierarchy or allocations are invented.

`rollover` is `{kind:'none'}` or `{kind:'carryUnspent',reset:'calendarYear',cap:Money}`. Target, cardinality, inception, rollover and its cap are immutable; change these by retiring and creating. No carry-of-debt and no essential-obligation protection are assumed. January and inception begin at zero. Missing limits break carry. Negative actual spending increases current remaining but cannot create carry beyond that month's available limit plus incoming carry. Outgoing carry is capped and nonnegative.

`limit` is a nonnegative safe integer Money in Functional Currency, or `null` for no applicable limit. Zero is a real limit. `change` renames, or appends a limit with `effective`: `{kind:'prospective',month}` strictly after the server's current UTC month, or `{kind:'retrospective',month,reason,confirmed:true}` on/before the current month. Retrospective changes adjust planning comparisons only. Creation applies to the whole explicit `startMonth`, including its already-Posted expenses, and labels its limit `initial` with actor/time provenance. This does not claim a rule was known when old spending posted.

For each month, choose the limit with greatest effective month at/before it, then highest revision on a tie. An earlier retrospective edit does not cancel a later scheduled limit; its carry effects can continue through later limits until January reset or a missing limit. Retirement overrides all limits on/after its effective month; scheduled revisions remain in immutable history and are visibly superseded by retirement. Retirement is terminal; retries return their original result but further edits fail.

`selection` defaults to `{kind:'current'}`. `{kind:'revision',budgetId,revision}` selects an immutable complete planning image, including name and lifecycle. Both selections read current Posted evidence. They are not as-known-at financial snapshots. Month Close/Alerts may preserve returned evidence in their own context. Each evaluation exposes current revision and selected planning revision separately.

Evaluation returns target/month/Functional Currency, signed actual spend, exact Posted line provenance and the effective `selectedLimit` decision. Numeric `planning.limit` applies only to a limited active row; retired rows retain the selected decision as superseded provenance. Limited rows include limit, incoming carry, availability, signed remaining, overage and outgoing carry. Other states are `notStarted`, `retired` or `noLimit`, with actual evidence but no numeric allowance/remaining/overage. Carry evaluation returns all months it used, at most January through the requested month. No-rollover evaluates only the requested month. Safe exact integer arithmetic precedes conversion to returned Money.

## Ownership sketch

- `src/budget/types.ts`: domain types and Budget-only read/write ports.
- `src/budget/input.ts`: public semantic parsing, shared month validation and limits.
- `src/budget/commands.ts`: current authority, lifecycle, revision and exact request receipts.
- `src/budget/evaluation.ts`: pure matching and carry/projection arithmetic plus read orchestration.
- `src/accounting/planningReads.ts`: read-only Accounting port and current cash Expense proposal resolution, reusing shared Category/template rules.
- `convex/accountingPlanningStore.ts`: indexed actual Posted Expense month reader; no writes.
- `convex/budgetStore.ts`, `budgetValidators.ts`: separate planning persistence/schema.
- `convex/budget.ts`: thin unchanged proof wrappers and mapping.

Budget stores complete immutable planning images and exact command receipts. Every revision appends an image atomically with the current head and receipt. Planning limit history is bounded to 256 decisions per rule; there is no ledger balance or spending cache. A Workspace supports at most 100 stored Budgets including retired history. Actual Posted reads are indexed by Workspace/year/month then by entry/line number, bounded to 1000 entries and 10000 lines per month. Across the entire requested interval and all selected rules, one request admits at most 2000 source index reads: one entries query per distinct month, one lines query per entry, and one account get per distinct account. Months are reused across overlapping rules; accounts are reused across months. The reader uses the existing immutable entry/line indexes rather than scanning unbounded Workspace history or modifying Posted rows.

Every streamed document and account get checks installed Convex transaction metrics before and after reading. Budget metadata reads use the same guard. The guard admits at most 3000 total index ranges, 20000 total scanned documents and 8 MiB total read bytes, including already-consumed authentication/device/proof/membership and planning metadata reads. It also requires remaining headroom of 1096 index ranges, 12000 documents and 8 MiB, respecting tighter nested limits. A single next document can cross the planning threshold; the platform's 1 MiB maximum document size fits within the reserved byte headroom and triggers `planning_read_limit` before the platform's 16 MiB ceiling. Indexed reads have no filters, so iteration exposes each scanned document. No platform error is broadly caught or relabeled, and auth/session denial directives remain unchanged.

These are conservative operational bounds, not proof of deployed latency, OCC or every platform limit. Convex also limits user-code execution time, memory, value array length and return size. Many overlapping rules duplicate provenance in the response and may need narrower selections; no rule/month/line is silently omitted. Within the read contract, oversize produces the existing `planning_read_limit` unavailable outcome and never partial plausible money. Warning availability is never a Posting prerequisite. Primary references are [transaction limits](https://docs.convex.dev/production/state/limits#transactions) and [transaction metrics](https://docs.convex.dev/database/writing-data#checking-transaction-headroom); installed Convex 1.46.0 and convex-test 0.0.59 provide matching get/query, scanned-document and document-byte metrics.

A proposed cash Expense uses the actual accounting input facts excluding idempotency/description. The shared resolver preserves current category revision/default/advanced override/template-use rules and supports an unactivated template account with code and no invented Ledger Account ID. Impact returns separate `proposedExpense` evidence and current Posted evaluations. It has literal `hasPostingAuthority:false` and `blocksPosting:false`. Ordinary Accounting calls do not read or require Budget state or warnings.

## Synthesis

Two independent read-only architect sketches compared append-only standing effective limits and explicit twelve-month plan sheets. Parent scores and both independent design judges favor standing rules for indefinite recurrence and fewer consumer obligations. A scored 22/25 versus 19/25; B favored 22 versus 18. The selected design grafts complete immutable planning/lifecycle images, bounded exact arithmetic and explicit unactivated account proposal provenance. Month sheets and materialized spending/carry balances were rejected. Full artifacts, scores, routes and terminal receipts stay under the ticket's receipts/C03.

The bounded annual carry choice accepts January reset in exchange for at most twelve actual-month reads. The 256-limit-history bound keeps rollover policy selection finite; it is an operational bound, not a claim about a settled preference. User experience and category hierarchy remain unresolved for F05/V01. Local tests establish authenticated handler behavior, not deployed OCC or native/physical proof.

## Combined planning authority

The reviewed Budget and Recovery parents independently used `workspace-roles@2` for their own Owner-only capability. Their normal merge uses `workspace-roles@3` with both `manageBudgets` and `manageRecoveryPlans`, preserving every other role grant. Both scopes retain the unchanged exact-operation proof wrappers and the canonical registry union. Their tables, images/events, ledger-read policies and typed unresolved variants remain separate. [The combined handoff](./C03-C04-reconciliation.md) records the local public proof and preservation limits.
