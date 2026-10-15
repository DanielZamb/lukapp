# V01 round-one corrections

The accepted findings against `308456396694d0204541b35d75538fb6d0802462` are corrected in quality tooling, configuration, tooling tests and documentation. Production modules, backend tests, compiler settings, the capacity fixture, thresholds, timeouts and dependencies are unchanged. All 43 prior quality artifacts other than the intentionally corrected README remain byte-identical to that commit. [integrity.json](integrity.json) records their hashes and the protected-file comparison.

The coordinator's [disposition](review-inputs/V01-quality-r1-disposition.md), both complete correctness results and the comment result are retained under `review-inputs`. This packet supplies corrections for fresh coordinator reviews. It does not establish official backend acceptance.

## Finding responses

### A1: Required stages and argument validation

Accepted. `all auth` previously selected only Auth mutation work. Runner and verifier acceptance checked only the listed stages. The CLI now rejects area arguments for `all` and `coverage`, missing verification directories, unknown areas and excess arguments before execution. Runner and verifier each apply the mode's exact stage plan and reject missing, duplicate, unknown or incompatible stages. `all` requires one `coverage-crap` stage plus all five configured mutation areas. Stage order is immaterial.

Partial coverage or mutation evidence remains explicitly partial. Both the receipt and reuse result expose `fullGatePassed`; that value can be true only for a passing complete `all` run. The actual verifier regression first accepts a synthetic, source-bound Auth-only mutation report as partial evidence, then rejects the same receipt when relabelled `all`. Other cases cover duplicates, incompatible and unknown stages, each omitted full-run stage, valid stage plans and the real CLI rejecting `all auth` without starting a run. Synthetic report statuses test receipt validation only. They are not executed mutants or mutation-score evidence.

### A2: Applicable compiler configuration binding

Accepted. The old manifest omitted `convex/tsconfig.json`. The manifest now hashes backend compiler configurations and the configuration dependencies resolved by the installed TypeScript parser. Its current configuration set is exactly `convex/tsconfig.json` and `tsconfig.json`. JSONC and transitive local inheritance are exercised with temporary tooling fixtures. Configuration dependencies outside the checkout fail binding. Compiler settings remain unchanged.

The sandbox configuration explicitly preserves the Convex child file, and generated area configurations preserve every resolved configuration dependency. Tests use the installed Stryker `ProjectReader.resolveInputFileNames` to check actual file selection, including a transitive configuration file in a temporary fixture. They do not start the Stryker engine, dry run, test runner or mutation execution.

There is a limit to the original sandbox finding. Installed Stryker already selected `convex/tsconfig.json` through basename matching of `!tsconfig.json`. The direct selector assertion therefore passed before remediation. The missing manifest hash was reproduced; exclusion of the child from an actual sandbox was not. The explicit preservation and dependency binding correct the configuration contract without claiming that an observed sandbox mismatch occurred. A stale child-configuration hash now makes the actual reuse verifier reject the receipt and name that changed file.

### A3: Executable ownership for ordinary branches

Accepted with the disposition's retained-data limit. Ordinary body and parameter branches now need an executable AST position owned by the function. Ranges crossing nested functions cannot supply ordinary branch observations. Uniquely justified named entries, V8 root counters and explicit parent selector mappings retain their separate proofs. Each row records rejected ordinary branch ranges, counts and reasons, so removed observations remain inspectable.

The reported erased-only CC10 probe previously received 100% coverage and CRAP 10. It now has missing observations, 0% coverage and CRAP 110. Tests also cover zero counters, a range crossing a nested function, erased parameter types, valid initializer branches, and independently justified named and V8 root calls. The original 21 reporter and mutation-accounting tests remain unchanged and pass.

This proves the reporter path, not that current V8 emits the synthetic erased-only mapping. No retained function uses the owned-body fallback before or after this correction. The actual retained-data effects below include stricter ordinary-range ownership elsewhere; they are not evidence of an erased-only fallback affecting a historical function.

### B: Capacity fixture description

Accepted. README now states that each `expenses` invocation posts one signed public expense, then clones its remaining rows in transaction batches of at most 25. The earlier claim that every batch starts with another public command is removed. Only documentation changed. The complete fixture and its hash are preserved in `integrity.json`.

## Exact retained-data effects

The new calculation reads the original retained raw coverage and the archived `117ba020` source. It reproduces the original calculation before deriving the correction and comparing every row with the reviewed `3084563` report. All 748 AST identities and complexity values remain unchanged. The source scope remains 84 files. Mapping counts remain 426 named entries, 312 V8 roots and 10 missing observations. All 10 remain included failures, alongside the original reclassification failure. CRAP acceptance remains false with 11 failures. The original failing calculation remains in its original receipt.

The historical reclassification function still has CC 32. Its corrected retained coverage is now 86.53846153846153% and CRAP 34.497951752389625. The original 88.88888888888889% and CRAP 33.40466392318244 remain preserved. These are calculations on the archived source, before C02's approved change, and are not combined-source results.

Compared with `3084563`, 57 rows change. Numerical coverage decreases for 28 functions, increases for one and remains unchanged for 719. The other 28 changed rows have observation-count changes without a numerical coverage change. The correction rejects 104 formerly accepted ordinary branch ranges: 93 overlap nested functions and 11 have no owned executable position. Rejected ranges remain in each function row and the comparison artifact.

The one increase is `src/savingsRecovery/commands.ts`, `anonymous@187:34`, from 50% to 100%, CRAP 6 to 4. Its prior zero-count range `142:0`, from line 187 column 111 to line 188 column 110, crosses the nested callback at `188:78` and is rejected under the new ownership rule. The separate valid invocation proof remains. That nested callback still has missing observations and fails acceptance. This increase is a mapping effect on old data, not newly executed coverage or a passing overall gate.

Compared with the original pre-mapping report, coverage increases for 21, decreases for 45 and remains unchanged for 682 functions. [summary.json](validation/retained-data/summary.json) binds the original raw data, source hashes, reporters, installed V8 provider and complete input manifest. [effects-from-3084563.json.gz](validation/retained-data/effects-from-3084563.json.gz) records exact row effects and rejected observations. [corrected-report.json.gz](validation/retained-data/corrected-report.json.gz) retains every row and failure.

## Commands and hashes

The final [validation receipt](validation/receipt.json) records both commands, start and finish times, elapsed times, exit statuses, exact source, test, configuration and tooling hashes, and compressed stdout and stderr. Both commands exited 0 with no input changes. Targeted tooling tests passed 33 of 33, with no skips. Retained-data audit exit 0 means the historical rederivation succeeded; its CRAP acceptance remains false.

The frozen input digest is `c55e92a4cdca0d486b61bb0fb06c8dc7af0ff5b3ac88a9b542ea961300307aac`. The manifest retains all 84 production mutation files, the same 29 selected mutation-test files and one excluded load-test file, with exact hashes. Existing conservative scoring, the positive-Killed requirement, nonincremental/static settings and two-worker limit are unchanged. No new production mutant denominator or survivor score is claimed. Backend and mutation executions for this remediation are zero. The original 8457-generated, zero-executed dry-run finding remains history.

Reproduce only these tooling checks into a new directory:

```sh
node scripts/backend-review-validation.mjs quality/backend/review-r1/replay-unique
```

The command refuses an existing output directory. It executes only the two tooling test files, with test-file concurrency two, and retained-data recalculation. Development logs and the first development recalculation remain under `development`. The initial red run reproduced six assertions and also exposed an unrelated circular import in the selector test; that test import was corrected. The selector's separate pre-fix pass is retained, as are the intermediate and final green results. Final validation is bound to one unchanged input set.

Official full regression, instrumented load, coverage collection, mutation execution and real Convex and Clerk acceptance remain open. No explorer, provider, deployment, device, integration, PR, new thread or reviewer action occurred.
