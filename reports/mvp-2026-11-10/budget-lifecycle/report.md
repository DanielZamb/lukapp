# Budget removal and spend-nothing backend

Branch `t3/budget-limit-removal-zero`. Implementation commit `dd2f9601c1c828827ebfe3779b409f82d898f0a3`, based on integration `f968044ff17eb62428cf699722b8da836c74181c`. The following commit adds only this report and the validation summary. No push, PR, deployment, device work or real Clerk admission ran.

Tracking remains open on [SEN-118](https://linear.app/sennkai-labs/issue/SEN-118/complete-missing-user-object-lifecycle-controls-across-places-budgets). ADR-0094 supersedes the old worker-conventions prohibition on ending or zeroing a limit.

## Behaviour and design

People can remove a standing limit or explicitly choose spend nothing. Both append to the existing category revision chain. Removal hides the current and future jar while preserving earlier monthly evaluations. Spend nothing retains a jar with zero allowance. Setting a positive or spend-nothing limit after removal starts a new stretch without filling the intervening months. All three commands share the workspace-wide idempotency namespace, expected-revision guard and current-month check. No command writes accounting.

The public API uses separate action names so existing positive-amount callers keep their arguments. Internally, a discriminated `change` selects amount, spend-nothing or removal in one domain writer. An optional revision `kind` distinguishes the stored decisions. Legacy rows without it mean amount. New removal and spend-nothing revisions both carry `limitMinorUnits: 0`; their `kind` determines their meaning. Schema compatibility comes from the existing `convex/schema.ts` use of `revisionFields`, so no schema-file edit or migration is needed.

Removal may append after a category retires. Retirement still hides every jar for that category, including historical reads, as it did before this change. Setting a new limit on a retired category remains rejected. Replaying an acknowledged command after retirement returns its original receipt and never restores a jar.

Model the Domain shaped the internal discriminated command and explicit stored marker. Test Behavior, Not Implementation shaped the literal jar, spending, receipt and alert expectations. Prove It Works limits this receipt to executed local tests and inspected source; it establishes no deployed or authenticated acceptance.

Two API shapes were considered: adding a discriminated replacement command, or retaining the amount command and adding two named commands. The named commands avoid a public compatibility union and make the new intents explicit at the call site. No domain decision remains open.

The throughput checkpoint kept the revision writer and adapter changes with one owner because they share one chain and transaction. Source, conventions and regression reads were the blocking steps. No nested agents ran, per worker instructions. Parallel design and comment-review delegation were omitted under that same instruction. The diff adds no code comments or suppressions.

## Public contract for the mobile worker

The authoritative validators are in `convex/budgetValues.ts`. All writes are public actions. Their matching functions in `convex/budgetWrites.ts` are internal mutations and additionally accept the server-produced `session`; clients never submit that field.

| Public function | Argument validator | Return validator |
| --- | --- | --- |
| `api.budget.setCategoryLimit` | `setLimitArgs` | `setLimitResult` |
| `api.budget.setCategorySpendNothing` | `limitTargetArgs` | `setLimitResult` |
| `api.budget.removeCategoryLimit` | `limitTargetArgs` | `setLimitResult` |
| `api.budget.evaluate` | Inline read arguments below | `evaluation` |

Write arguments are exactly these fields:

```ts
const limitTargetArgs = {
  workspaceId: v.string(),
  categoryId: v.string(),
  effectiveMonth: v.string(),
  expectedRevisionId: v.union(v.string(), v.null()),
  idempotencyKey: v.string(),
};
const setLimitArgs = {
  ...limitTargetArgs,
  limit: v.object({ currency: v.string(), minorUnits: v.number() }),
};
```

`effectiveMonth` must be the current workspace calendar month, in `YYYY-MM` form. An amount must use the workspace functional currency and a positive safe integer. A bare zero still returns `limit_must_be_positive`; neither new action takes an amount. The UI must refuse typed zero and ask which explicit act the person wants.

All writes return this validator:

```ts
const revision = v.object({
  id: v.string(),
  workspaceId: v.string(),
  categoryId: v.string(),
  effectiveMonth: v.string(),
  limitMinorUnits: v.number(),
  kind: v.optional(v.union(
    v.literal("amount"), v.literal("spendNothing"), v.literal("remove"),
  )),
  expectedRevisionId: v.union(v.string(), v.null()),
  sequence: v.number(),
  idempotencyKey: v.string(),
  createdBy: v.string(),
  createdAt: v.number(),
});
const setLimitResult = v.object({ revision, replay: v.boolean() });
```

Fresh writes always return `kind`. A replay of a legacy row may omit it. Exact retries return the original stored revision with `replay: true`, including after the month ends or a newer revision exists. They do not reapply that revision. Replays still check current authorization first. A fresh key with an ended-month intent returns `month_changed`. Reusing a key with another category, month, amount, expected revision or command kind returns `idempotency_key_conflict` once the initial field validation succeeds. Changed currency or an invalid amount can fail their existing field guards first.

For the first limit, use `expectedRevisionId: null`. For a change or removal, use the current jar's `revisionId`. To set a limit again after removal, use `removedLimits[].revisionId`. A fresh null expectation after a removal is stale and returns `limit_changed`. Sequences continue through removal, never restart at one.

Read arguments and results are exactly:

```ts
const readArgs = {
  workspaceId: v.string(),
  month: v.optional(v.string()),
  refreshKey: v.optional(v.string()),
};
const category = v.object({ id: v.string(), name: v.string(), emoji: v.string() });
const evaluation = v.object({
  month: v.string(),
  currentMonth: v.string(),
  currency: v.string(),
  totalsOverlap: v.literal(true),
  jars: v.array(v.object({
    category,
    revisionId: v.string(),
    limitMinorUnits: v.number(),
    consumptionMinorUnits: v.number(),
  })),
  availableCategories: v.array(category),
  removedLimits: v.array(v.object({
    categoryId: v.string(),
    revisionId: v.string(),
    effectiveMonth: v.string(),
  })),
});
```

All existing read fields remain. The new `removedLimits` is required and always an array. It contains the effective removal for each category at the requested month, including removals in earlier months and retired categories, sorted by category ID. A later set supersedes the removal only from its effective month onward. `availableCategories` still contains active expense categories without a jar, including categories whose limits were removed.

| Active expense category state in the requested month | `jars` | `removedLimits` |
| --- | --- | --- |
| No limit has taken effect | No entry | No entry |
| Positive limit | Entry with positive `limitMinorUnits` | No entry |
| Spend nothing | Entry with `limitMinorUnits: 0` | No entry |
| Removed this month | No entry | Entry whose `effectiveMonth === month` |
| Removed in an earlier month | No entry | Entry whose `effectiveMonth < month` |

A retired category appears in neither jars nor available categories. Its effective removal can remain in `removedLimits`. Use the category read to distinguish retirement from an unused category.

Zero consumption on a zero jar is not over. Positive consumption is over by the full consumption. Negative consumption is not over; `left = 0 - consumption` is positive. A later-month reversal can produce that negative consumption. It does not create rollover in future months. Removed categories contribute no jar, alert or Budget posting warning. Their expenses still count in total spending. Overlapping expense categories each consume the full expense while total spending counts it once.

Budget write errors are `ConvexError` data `{ kind: "budget", code }`:

| Code | When it occurs |
| --- | --- |
| `month_invalid` | Month is not a four-digit nonzero year plus a valid two-digit month. Applies to reads and writes. |
| `currency_mismatch` | An amount command uses a different functional currency. |
| `limit_must_be_positive` | An amount is zero, negative, fractional or outside the safe-integer range. |
| `idempotency_key_invalid` | Key is blank after trim or exceeds 200 characters. |
| `idempotency_key_conflict` | The workspace already holds the key with a different validated intent. This includes switching between removal and spend nothing. |
| `month_changed` | A non-replay write targets any month other than the current workspace month. |
| `category_not_found` | Category is missing or foreign, or is retired for an amount or spend-nothing write. |
| `expense_category_required` | Category is not an expense category. |
| `limit_changed` | Expected revision differs from the latest effective category revision. Checked before the absence guard. |
| `limit_not_set` | Removal has a matching expectation but no effective limit exists, or its latest revision already removes it. Exact replay is exempt. |
| `workspace_not_found` | Budget store cannot resolve the workspace. Normal authorization usually rejects invalid workspace IDs earlier. |
| `amount_out_of_range` | Evaluation finds unsafe consumption or unsafe limit-minus-consumption arithmetic for an active jar. |

Current authorization errors have data `{ code, ... }` without `kind: "budget"`:

| Code | When it occurs |
| --- | --- |
| `authentication_required` | Caller has no identity. |
| `session_required` | JWT issuer or active-session claims are missing or invalid. |
| `provider_unavailable` | Clerk credentials, transport, response status or response shape cannot support a live check. Write actions only. |
| `session_inactive` | Clerk session is absent, mismatched, inactive, expired or abandoned. Includes `wipeLocalInput: true`. Write actions only. |
| `session_verification_required` | Internal handoff observation is mismatched, from the future, older than five seconds, expired or abandoned. Public clients cannot supply observations. |
| `device_revoked` | Session revocation or device revocation exists. Includes `wipeLocalInput: true` and optional `movedTo`. |
| `device_registration_required` | Device is absent, belongs to another user, or differs from the checked Clerk client on submission. |
| `membership_required` | Caller lacks membership in the requested workspace. Includes `wipeLocalInput: true`. |
| `permission_denied` | Role lacks `workspace:admin` for writes or `workspace:read` for evaluation. Current schema permits Owner membership only. |

Convex argument-validator failures reject malformed or extra fields before execution and have no new application error code. Unexpected transport or server failures remain uncertain outcomes. Preserve the command name, full payload and idempotency key for retry.

## Validation

`pnpm install --frozen-lockfile --offline` succeeded. It reported existing ignored dependency build scripts. No dependency or lockfile changed.

The final focused run `pnpm vitest run src/budget convex/budget.test.ts convex/attention.test.ts` passed 38 tests in three files. The final full `pnpm vitest run` passed 1,940 tests in 159 files with no failures, including the formerly failing Drafts route. This change adds 26 tests above the supplied 1,914-test integration baseline. `pnpm typecheck` passed both root and mobile checks with exit zero. `git diff --check` passed. The compact observed output is in `validation.txt`; full raw output remains locally in `full-suite.txt` and `typecheck.txt` in this directory.

An initial typecheck failed because five mobile fixture files lacked `removedLimits`, and two test index lookups used unbranded workspace strings. The fixtures now provide the field, and those lookups normalize the IDs. No test failure occurred during implementation. Vitest reported the existing `environmentMatchGlobs` deprecation and React test-renderer warnings.

The regressions exercise each new action through the public API with the controlled Clerk fixture. They cover append-only saves, preserved past months, exact and concurrent replay, changed payload and cross-command key conflicts, stale revisions, ended months, absent and repeated removal, later positive and zero re-creation, unauthorized callers, revoked sessions/devices, lost membership, expired internal admission, retirement, overlapping consumption, total spending, zero/positive/negative consumption, alerts, posting impact and legacy rows. These are local regression checks, not real-provider evidence.

## Coordinator acceptance and mobile work

No new source is deployed by this worker. No development deployment URL, deployed source, actual Clerk admission, normal authenticated development request or native UI result was observed. This checkout has no `.verification/provider/provider-verification.json`; the coordinator must use the authoritative retained gate after integration and leave acceptance open until those checks run.

Record the exact integrated source and app build, named Convex development URL and deployed source, actual end-user Clerk admission, public action/query payloads, expected and observed receipts/jars/spending, and negative/retry results. Exercise both new acts, lost-reply exact retry, changed-intent retry, competing edits, month-boundary rejection, revoked-device replay, remove/set gaps, retirement, zero spending and locked-period reversal against that deployment. Confirm no accounting writes from either planning act. Use isolated development records. No reset is needed for these local tests, and no environment or table was reset.

The mobile worker owns explicit controls, ambiguous typed-zero refusal, saved-removal confirmation, use of removal revision IDs when setting again, frozen uncertain commands and retry reconciliation. It must exercise UI acceptance against the deployed backend and complete two return cycles including Android Back and sheet dismissal.

There is a known mobile scope boundary. `apps/mobile/src/features/budget/model.ts:41` divides consumption by a limit in `nextAction` without excluding zero. Its guarded `jarPresentation` fill is already finite. `BudgetLimitSheet.tsx:63` derives a +20% shortcut that needs an explicit spend-nothing policy. The mobile worker must guard the ratio and avoid presenting zero as an amount shortcut before exposing the new commands. This backend adds no ratios or percentage suggestions; the existing alerts and posting-impact readers were exercised with removed and zero jars and need no change.

## Scope receipt

Product changes stay in `src/budget` and `convex/budget*`. `convex/schema.ts` already imports the updated optional Budget revision fields. Mobile changes are fixture additions only in `attention/routes.test.ts`, `budget/Budget.test.ts`, `budget/PostBudget.test.ts`, `categoryLook/CategoryLook.test.ts` and `overview/model.test.ts`, required by the additive read contract. Reports are the only other files. No Savings Recovery, personal defaults, workspace settings, private verification inputs or other checkout was changed.
