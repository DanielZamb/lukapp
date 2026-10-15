# Backend quality gates

`policy.json` defines the backend source scope and thresholds. The five mutation areas are accounting, auth, budget, recovery and Convex. Each area must score at least 80%. Every executable function must have CRAP at most 30.

## Run the checks

Install the pinned dependencies with `pnpm install --frozen-lockfile`, then use:

```sh
pnpm quality:backend
pnpm quality:backend coverage
pnpm quality:backend mutation
pnpm quality:backend mutation auth
pnpm quality:backend verify quality/backend/runs/<run-directory>
node --test --test-concurrency=1 scripts/backend-*.test.mjs
```

The default `all` mode requires coverage and all five mutation areas. It accepts no area argument. Coverage and mutation modes require their own complete stage sets. A passing partial receipt cannot set `fullGatePassed`. Missing, duplicate, unknown or incompatible stages fail verification.

`node scripts/backend-complexity.mjs` reports complexity without coverage. An optional Git commit argument scans that exact source. Complexity alone cannot establish a CRAP or mutation pass.

## Scoring and scope

Mutation runs are fresh and nonincremental, with static mutants enabled and at most two workers. The score is `100 * (Killed + Timeout) / all generated mutants`. Survivors, uncovered mutants, compile errors, ignored mutants and incomplete work receive no detected credit. Timeouts count as detection and remain separately visible. Unknown statuses, runtime errors, changed inputs or failing tool exits fail the gate.

CRAP is `complexity² * (1 - coverage/100)³ + complexity`. Complexity comes from the TypeScript AST. Nested functions have separate metrics. Coverage is the minimum statement and branch coverage. Missing or ambiguous observations fail, including executable branch ranges whose ownership overlaps nested functions. Positive parent counters cannot establish child coverage. Comparisons use unrounded values.

Coverage uses pinned `@vitest/coverage-v8` 3.2.7 with AST remapping and the committed `ast-v8-to-istanbul` patch. Receipts bind the format, patch, installed mapper and input hashes. Zero counters are preserved. Invalid locations, duplicate mappings and unassigned observations fail.

Generated files, declaration-only files, the accounting export barrel, test harnesses and native-only client modules are excluded from backend mutation scoring. Deployment-only `convex/auth.config.ts` is excluded. HTTP webhook routing and signature validation are included. See `policy.json` and `scripts/backend-scope.mjs` for the exact selection.

The input manifest follows backend test imports, including imported mobile modules and TypeScript configuration dependencies. The guarded Stryker runner checks copied input bytes, expected preprocessing, selected suites and actual test identities before accepting a run. A regression or suite-load failure stops `all` before mutations start.

The capacity load test is mandatory in regression and coverage. Its timeout is 240 seconds for ordinary regression and 600 seconds with coverage. Only that load file is excluded from mutation test selection. All production mutants remain in scope. Missing, skipped or failed load assertions fail the overall gate.

## Keep run output local

Only this guide and `policy.json` are tracked under `quality/backend`. Run directories, coverage reports, mutation reports, logs, copied source, review packets and intermediate calculations are ignored. Do not force-add them. Put a concise result and unresolved gaps in the PR body.

Each run writes commands, exits, source and input hashes, coverage, mutant counts and failures under `quality/backend/runs`. An interrupted receipt remains incomplete. Reuse a result only when its relevant input and artifact hashes match. Historical failed results must not be relabelled as passing.

Regression tests use the retained inputs in `scripts/fixtures/backend-quality`. Those fixtures are test data, not acceptance evidence. Historical investigation scripts and full reports are held in the local orchestrator archive.

The last official run passed regression but failed CRAP mapping and Auth mutation. Accounting mutation passed; Budget was interrupted, and Recovery and Convex did not start. The overall gate remains incomplete and failed. This cleanup does not change those results.

These checks establish local regression evidence only. Runtime completion still requires actual Clerk admission and normal public API and UI checks against the real Convex development deployment, as required by root `AGENTS.md`.
