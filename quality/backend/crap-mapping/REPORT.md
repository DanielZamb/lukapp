# CRAP coverage mapping correction

This tooling-only correction rederives the retained advisory data for source `117ba020aa73e4fc8f60dba63a4ecc185980fbd5`. It does not execute backend code or establish combined-source acceptance. Official execution remains held for the coordinator's reviewed combined source. The coordinator-set criteria remain mutation score ≥80% separately per area and AST per-function CRAP ≤30; missing or ambiguous coverage fails regardless of the calculated CRAP value.

The original reporter accepted `const f = () => 1;` as 100% covered from an executing outer declaration line with no function or branch observations. The corrected reporter returns coverage 0 and `missingCoverage: true`. It accepts only uniquely mapped entry observations or executable statements/branches owned by the function. Nested functions, outer lines, structural braces, erased type declarations, module counters, and ambiguous function-value selection ranges cannot supply invocation credit. Explicit zero entries override positive body-line counts. Coverage still uses the lower statement/branch percentage, with unchanged AST complexity and unrounded CRAP comparisons. Every row exposes its mapping, observation basis, problems, and entry-range proofs.

## Actual V8 / TypeScript mapping

The installed Vitest V8 converter records block coverage ranges as branches in `applyCoverage`, but adds a function-map entry only when `block.functionName && i === 0`. Anonymous callbacks can therefore have a function-root branch observation without a named function entry. Its `originalEndPositionFor` source remapping biases the next mapping; retained TypeScript ranges can end after the function's AST end at a comma, semicolon, closing parenthesis, or whitespace. The correction permits only these trailing delimiters and whitespace, requires the complete function body and a matching function header/body boundary, and rejects ranges crossing executable tokens. Shared returned-function body ranges and contradictory counts fail as ambiguous.

The retained data contains 429 named entries: 426 map uniquely to AST functions and three generated instance-initializer entries do not. Among the original 517 functions with empty `functionEntries`, 195 have recoverable named entries and 312 have unambiguous anonymous V8 root branches. The other 10 have no owned function observations. No retained row requires the owned-body fallback; synthetic regression cases exercise that fallback and its conservative minimum branch coverage.

The provider file hash, Node/TypeScript versions, every source hash, reporter hashes, input manifest, and retained artifact hashes are in [summary.json](summary.json). The original source and reporter are retained in [source-snapshot.json.gz](source-snapshot.json.gz), so retained-data regression fixtures remain independent of subsequent production changes.

## Exact retained-data effects

| Observation | Original | Corrected |
| --- | ---: | ---: |
| Functions in scope | 748 | 748 |
| Empty function-entry lists | 517 | 10 |
| Missing observations | 0 | 10 |
| CRAP acceptance failures | 1 | 11 |
| Acceptance result | Fail | Fail |

Corrected mappings are 426 named entries, 312 V8 root branches, and 10 missing observations. AST function identity and complexity are unchanged for all 748 functions. Observation bookkeeping changes for all 748; numerical coverage increases for 29, decreases for 23, and remains unchanged for 696. Of the 23 decreases, 13 now have explicit zero invocation counts; the other 10 have missing observations. [effects.json.gz](effects.json.gz) preserves every changed metric's exact before/after value. [corrected-report.json.gz](corrected-report.json.gz) preserves all rows, proofs, and failures.

The original `previewCategoryReclassification` failure remains CC 32, coverage 88.88888888888889%, CRAP 33.40466392318244. This historical source predates C02's approved correction. Its failing calculation remains retained and is not a result for the eventual combined source.

The following 10 callbacks all remain acceptance failures, with coverage 0 and `no-owned-function-observations`. They are included scope, not exclusions. Missing observations alone do not prove whether the callback was called.

| Source | Function position | CC | CRAP at 0% |
| --- | --- | ---: | ---: |
| `src/accounting/categories.ts` | `anonymous@95:63` | 1 | 2 |
| `src/savingsRecovery/commands.ts` | `anonymous@188:78` | 1 | 2 |
| `src/savingsRecovery/progress.ts` | `anonymous@64:87` | 1 | 2 |
| `src/savingsRecovery/queries.ts` | `anonymous@43:56` | 2 | 6 |
| `src/savingsRecovery/queries.ts` | `anonymous@90:48` | 1 | 2 |
| `src/savingsRecovery/queries.ts` | `anonymous@90:106` | 1 | 2 |
| `src/savingsRecovery/queries.ts` | `anonymous@91:21` | 1 | 2 |
| `src/savingsRecovery/queries.ts` | `anonymous@91:78` | 1 | 2 |
| `src/savingsRecovery/queries.ts` | `anonymous@100:50` | 3 | 12 |
| `src/savingsRecovery/queries.ts` | `anonymous@112:56` | 2 | 6 |

## Validation and reproduction

Previously executed `node --test scripts/backend-quality.test.mjs` passed all 21 tooling tests, with no failures or skips and exit status 0. Cases cover the reported outer-line bug, actual retained named/anonymous/missing callbacks, called and explicitly uncalled entries, nested ownership, shared body ambiguity, function-valued conditional selection, erased syntax, missing/conflicting counters, and minimum statement/branch coverage. These checks exercise the reporter and archived fixtures; they run no backend tests.

Previously executed `node scripts/crap-mapping-audit.mjs` reproduced the original calculation exactly from its archived reporter and source before deriving the correction. Its exit status 0 means the historical rederivation and invariants succeeded. The corrected advisory acceptance is still false, with 11 failures. The audit is not the official CRAP gate. Both commands are repeatable from this checkout with the existing locked dependencies and retained Git history. No further runtime rerun was performed while finishing this freeze.

[validation.json](validation.json) records these observed executions, exact tool hashes, artifact hashes, and a byte comparison proving all 37 original quality artifacts other than the intentionally corrected README are unchanged at the frozen source ref. No production modules, backend tests, source contracts, dependency files, policy, timeouts, mutation denominator, suppression handling, or original receipts changed. No coverage, full/load regression, or mutation execution occurred for this correction. The older 100%/37-test claim and suppressed baseline finding remain in their original history.
