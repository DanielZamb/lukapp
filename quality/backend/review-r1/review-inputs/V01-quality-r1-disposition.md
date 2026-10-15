# V01 quality review round 1 disposition

Reviewed HEAD 308456396694d0204541b35d75538fb6d0802462, tree de7085542dc07cdf6dc017fc7e39e2d2a1067dd2, base 9fbf2ea372e86459f17f086d1f4392fd51ad7cad.

Comment review passed with zero deletions. Correctness A requested changes. Correctness B approved with residual observations. Both tasks completed with no pending child runs. Full terminal results remain in V01-comments-r1-terminal.json and V01-quality-correctness-{a,b}-r1-terminal.json. The owner independently inspected A's findings and agrees with all three, with the retained-data limit stated below.

## Accepted corrections

1. A1, P1. Reject incompatible CLI arguments such as `all auth`. The runner and reuse verifier must independently enforce mode-required stage completeness and uniqueness. A full `all` receipt requires coverage-crap and exactly all five configured mutation areas. Missing, duplicate, unknown or incompatible stages must not pass. A single-area mutation receipt is partial evidence and cannot establish the full gate. Add meaningful regressions around argument validation and actual receipt acceptance, including the reported incomplete all-mode case.
2. A2, P2. Bind convex/tsconfig.json and its applicable configuration dependencies in source reuse hashes and preserve them in the Stryker sandbox. Keep compiler settings unchanged. Demonstrate that a child-configuration change invalidates reuse and that sandbox selection preserves the applicable files. Current extends points to the already-bound root config; that does not cover changes to the child.
3. A3, P2. Reject erased-only or ambiguously owned branch observations as function coverage evidence. Require executable ownership for ordinary body/parameter branches while preserving valid independently justified function-entry/root mappings. Add the reported erased type-only branch regression and relevant valid/zero/nested cases. A's in-memory probe establishes a reporter false-pass path. It does not establish that current V8 emits the mapping or that any retained row was affected. Retained 748-row observations and the 10 missing failures remain evidence, not assumed impact.
4. B's README correction. Describe the actual capacity fixture: each expenses helper invocation posts one signed public expense, then clones its remaining rows in transaction batches of at most 25. Correct the claim that each batch starts with another signed public command. Change documentation only, preserve all dataset sizes, original assertions and transaction boundaries.

## Review reconciliation

B correctly distinguishes a single-area mutation pass from full acceptance. That does not resolve A's demonstrated `all auth` path or the verifier accepting an incomplete receipt labelled `all`. Accept A1. B's approval also contains no counterexample to A2 or A3. Accept both with A3's evidence limit.

Keep existing criteria fixed: CRAP at most 30 per function; at least 80 percent separately for all five mutation areas; fresh nonincremental execution with static mutants; conservative denominator and failure statuses; maximum two heavy workers. Do not weaken the existing timeout-only acceptance rule as incidental cleanup. The hardcoded reused count remains backed by bound nonincremental configuration, not an independently observed report field.

## Authorized remediation

Release the source freeze only for the existing V01 owner in its exclusive worktree. Scope is quality tooling, quality configuration, tooling tests, documentation and new retained-data audit artifacts. No backend production source, backend regression tests, dependencies, compiler policy, load fixture or timeout changes. Preserve prior artifacts; any corrected retained-data calculation gets a new explicit receipt.

Run targeted tooling tests and bounded in-memory or retained-data recalculation needed to prove these corrections. Do not run full backend regression, capacity load, coverage collection, Stryker dry runs or mutant execution. No explorer, provider, deployment, device, new reviewer, new thread, integration or PR actions.

Freeze a clean exact commit/tree, input digest, patch, finding responses and command receipts for fresh coordinator comment and independent correctness reviews. Official quality execution remains held until the corrected tooling and combined C02/C04/F03 source are reviewed. Local quality and real-provider acceptance remain open.

## A2 evidence refinement after implementation

The owner exercised installed Stryker ProjectReader.resolveInputFileNames and reports that the original `!tsconfig.json` rule already selects convex/tsconfig.json by basename matching. That selector assertion passes before the correction. The coordinator read the new test and installed ProjectReader source without rerunning it. Accordingly, withdraw the claim of an observed child-config sandbox omission. The missing child hash in the original manifest remains demonstrated. Explicit child selection and generated preservation of TypeScript-resolved configuration dependencies are preventive corrections, not proof that the old sandbox lacked this existing file. Preserve the passing baseline selector evidence beside the red manifest evidence in the fresh review packet.

The owner reports 32 targeted tooling tests passing and no backend/engine execution. Corrected retained-data audit and exact frozen-source reviews remain pending; this update does not approve the in-progress source.
