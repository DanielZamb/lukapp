# V01 round-two correction

The single accepted P2 against `8c37322d59eaab20e761ee093e9f8729702b3822` is corrected by a two-line guard in `scripts/crap.mjs`. An executable ordinary branch rejected for nested-function overlap adds `ambiguous-nested-branch-ownership` to the parent's mapping problems. The parent then fails acceptance with `missingCoverage: true`, `mapping: ambiguous` and coverage 0. This applies regardless of the rejected count, positive entries or statements, and other accepted branches. It introduces no attribution algorithm.

Invocation proofs and rejected ranges remain visible. Coverage 0 on an ambiguous row represents unknown branch coverage under conservative acceptance, not observed nonexecution. Erased-only rejection and independently justified function-entry and root proofs remain unchanged. A1, A2, mutation accounting, configuration, policy, dependencies, backend tests, production modules, load fixture and timeouts are unchanged.

The coordinator's [disposition](review-inputs/V01-quality-r2-disposition.md.gz), complete A and B verdicts and parent triage are retained verbatim as gzip files under `review-inputs`, including their original trailing whitespace. B's approval confirmed the historical increase but did not resolve A's threshold-crossing probe. The earlier justification of that increase was wrong and is withdrawn in the current README. All prior reports remain historical evidence without edits.

## Regression evidence

Four focused regressions in `scripts/backend-quality-r2.test.mjs` failed against the reviewed reporter before the guard and passed after it. They cover:

- A CC10 parent with a positive entry, nine rejected zero executable return paths and nine independently mapped zero child entries. The corrected parent has coverage 0, CRAP 110 and an explicit ambiguous mapping. Child entry proofs and zero counts remain intact.
- Positive owned-statement fallback with both zero and positive rejected counts.
- A remaining accepted positive branch alongside zero or positive rejected executable ranges.
- The exact archived `commands.ts` range `142:0`, its positive parent invocation and its still-missing nested callback.

The original 33 tooling tests remain unchanged. The source-bound final [validation receipt](validation/receipt.json) records 37 passed, zero failed and zero skipped, with one test-file worker. The focused red and green logs are retained under `development`, with the red reporter ref and exact test-file hash in [integrity.json](integrity.json). A's complete result retains its bounded threshold-crossing probe. No new engine or backend execution supplies these synthetic mapping observations.

## Exact retained-data effects

The fresh calculation uses the same archived `117ba020` source and original raw coverage. All 84 source hashes and all 748 AST identities and complexity values are checked. For every row, statement and branch observation counts, function entries, entry proofs and rejected range records are identical to the reviewed `8c37322` report. The guard changes acceptance and derived metrics only.

| Result | Reviewed `8c37322` | Corrected |
| --- | ---: | ---: |
| Functions | 748 | 748 |
| Empty function-entry lists | 10 | 10 |
| Explicitly ambiguous mappings | 0 | 50 |
| Other missing mappings | 10 | 10 |
| `missingCoverage` rows | 10 | 60 |
| Acceptance failures | 11 | 60 |
| Overall acceptance | Fail | Fail |

Exactly 50 rows change compared with `8c37322`: all 50 coverage values decrease, none increases, and 698 remain unchanged. All 11 prior failures remain failures, so 49 functions newly fail acceptance. Current mapping classifications are 386 `fnMap`, 302 `branch-root`, 50 `ambiguous` and 10 `missing`. The 50 ambiguous rows still retain their original invocation proofs. These are conservative mapping failures, not diagnosed production defects. The receipt's `missingObservations` field counts `missingCoverage` rows, including ambiguities; only 10 rows actually have empty entry lists.

The disputed `src/savingsRecovery/commands.ts`, `anonymous@187:34`, now has coverage 0, CRAP 20, `missingCoverage: true` and the explicit ambiguity problem. Its invocation entry remains `[1]`. Rejected `142:0` remains count 0, from line 187 column 111 to line 188 column 110, with reason `nested-function-overlap`. The nested callback at `188:78` remains missing and failing. Historical coverage 50%, CRAP 6 at `3084563`, and the invalid increase to 100%, CRAP 4 at `8c37322`, remain preserved in their original reports and in the new comparison.

Compared with `3084563`, 57 rows change and numerical coverage decreases for 52, with no increases. Compared with the original pre-mapping report, coverage increases for 20, decreases for 75 and remains unchanged for 653. All of the original ten missing observations remain included failures. The archived CC32 reclassification failure remains failing; its original calculation is not replaced. Neither these archived calculations nor the synthetic probe establish combined-source or real-provider results.

[summary.json](validation/retained-data/summary.json) binds all original inputs and exact effects. [effects-from-8c37322.json.gz](validation/retained-data/effects-from-8c37322.json.gz) contains each changed field, entry proof and rejected observation. [corrected-report.json.gz](validation/retained-data/corrected-report.json.gz) retains every function and all 60 failures. There are no new scope exclusions or discarded audit observations.

## Frozen checks and reproduction

The input digest is `27a30fa01fd163c2be468634234f9db19d8335884e52b70439b92d636ffc0a1a`. Both final commands exited 0, with no input changes. The audit's successful exit means historical rederivation and invariant checks succeeded; CRAP acceptance remains false. The validation receipt records commands, times, tool exits and exact source, backend-test, tooling-test, configuration and script hashes, plus compressed stdout and stderr. The manifest retains the same 84 production mutation files, 29 selected mutation-test files and one excluded load-test file.

Reproduce the tooling suites and archived calculation into a new directory:

```sh
node scripts/backend-review-validation.mjs quality/backend/review-r2/replay-unique
```

The helper refuses an existing output directory and runs the three tooling test files with `--test-concurrency=1`. It then recalculates retained data. It runs no backend or mutation tests. All 72 prior quality artifacts other than the intentionally updated README remain byte-identical to `8c37322`; their hashes and protected-path comparisons are in `integrity.json`.

New backend and mutant executions are zero. No new mutation score, denominator or survivor result is claimed. Official combined-source regression, load, coverage and mutation gates remain held. Real Convex, Clerk and device acceptance remain open. No explorer, provider, device, deployment, push, PR, new thread, delegation or reviewer action occurred.
