# Per-area sandbox correction

A's accepted P2 is fixed. The authoritative red reproduction is `red-corrected-fixture.log.gz` at parent `2a2de8b9705157ea32c330c2814aff2c67b51727`. It captures the actual Auth CLI setup through a command double, applies the installed preprocessing to copied inputs, changes copied `src/savingsRecovery/commands.ts`, and calls the actual runner guard and final verifier. Both incorrectly accepted the changed Recovery input. The negative assertion failed; the exact-scope control passed. This proves checker false acceptance, not historical sandbox corruption.

`prepareMutationStage` derives one explicit instrumented set from the frozen full manifest and the area selection. That same set supplies `mutationConfig.mutate` and the exemption used by preprocessing predictions. All other inputs receive expected preprocessed hashes. The guard compares the installed runner's actual configured `mutate` list with the declared selection, checks every input's existence, and retains observed hashes for the full manifest. The preflight checker and final receipt verifier independently validate the scope, configuration, expected-hash key set and complete observations. Final verification also requires the bound configuration and full input-manifest artifacts. Recorded positive flags cannot override changed copied bytes.

| Selection | Instrumented files | Other globally scoped production files still compared |
| --- | ---: | ---: |
| accounting | 44 | 42 |
| auth | 12 | 74 |
| budget | 6 | 80 |
| recovery | 6 | 80 |
| convex | 18 | 68 |
| full-diagnostic | 86 | 0 |

The full 86-file selection requires the explicit `full-diagnostic` label and matching configuration. It cannot satisfy an Auth-stage receipt. The full source manifest remains intact for every area. `stage-bindings.json` retains exact selected source hashes and predictions for every selection; these are input predictions, not new engine observations.

The final focused check passed 29 tests with one test-file worker and exit 0. `checks.json` records the command, all selected and omitted test names, exact tooling-test hashes and log hashes. The four unchanged synthetic `review A3` mapping cases were explicitly omitted from this run. Node reports zero skipped tests because its name filter omits those registrations; they receive no new execution credit. The earlier 67-test evidence remains historical. No mapper recalculation, backend test, native check, engine, full/load/coverage run, install or dependency change occurred. Generated and executed mutants are both zero; no mutation score is claimed.

The scope regressions cover actual setup for all five areas, the Recovery change during Auth, accounting and imported-mobile changes, missing instrumented files, forged positive flags, missing observations/configuration/artifacts, absent/duplicate/incomplete/overbroad/mismatched sets, and explicit diagnostic acceptance. Their suites and mutation reports are synthetic checker fixtures. They do not represent real backend execution or killed mutants.

`red.log.gz` and `red-with-verifier.log.gz` retain earlier fixture drafts with incorrect suite paths. They are not the final-verifier reproduction. Intermediate green logs also remain draft check evidence. Only `green.log` is bound to the final current input set. The failed sandbox receipts, original interrupted official run and old mapping interpretations remain unchanged. Historical preflights without the new explicit scope and observations cannot pass current verification. Their prior checker-validation receipts and engine exit statuses remain historical and are not rewritten.

B's conservative ignore-hint residual remains recorded in the terminal review. This correction does not change the mapper patch, observed counters, backend source/tests, native source, fixtures, dependencies, configuration or thresholds. The per-area mutation minimum remains 80%, AST per-function CRAP remains at most 30, and missing or ambiguous observations remain failures. The official combined-source gate is held for fresh coordinator-owned comment and correctness reviews.

The single commit containing this packet binds its exact source through `input-manifest.json`, `source.patch.gz` and `candidate.json`. Final commit/tree identifiers are reported in the handoff to avoid a self-referential receipt. `artifacts.json` binds every packet artifact except itself. `reuse.json` records unchanged historical evidence and protected input hashes. No historical report is relabelled as a current gate pass.
