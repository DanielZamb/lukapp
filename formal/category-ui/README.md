# Category UI CRUD and account-door verification

The current binding includes metadata CRUD. CategoryManager drives the public create/update/delete actions, preserves pending editor answers, requires a separate delete confirmation and queues account answers until the category modal dismisses. The real posting picker keeps a deleted selected identity visible as Unavailable category until the user removes it.

The binding remains pinned to the pre-integration snapshot below. The integrated `ac54f20fd431729db4d39077394cbc20ae2b6eb1` checkout needs source review; its normal check exits 3. Use pinned reproduction to reproduce these results. The merge does not extend proof or runtime acceptance.

Run both graphs:

```sh
node formal/category-ui/check.mjs
```

Run only management CRUD with `--graph crud`, or the posting account door with `--graph account`. Reproduce the exact reviewed source, all 24 actual product-code scratch mutations and restored baseline with:

```sh
node formal/category-ui/reproduce.mjs --prove-checks
```

The full baseline exits 2 for retained finding CATEGORY-UI-001. The CRUD-only baseline exits 0. Exit 3 means source review required, and exit 1 means extraction/tool failure. Never treat an existing finding as proof that an unrelated mutant was caught. The challenge isolates each graph and requires the named invariant and a matching source witness.

## Current result and bounds

The CRUD graph has 803 states and 1324 edges across 12 prepared seeds, maximum observed depth 12 under cap 24, zero frontier. It covers create with each of four nature answers, rename/style editing, Delete/Keep/Confirm delete, cancellation/reentry, one failure and retry, native account handoff, and one retained deleted selection with a possible external recreation under a fresh ID. Its eight raw TLC invariants pass.

The account-door graph has 1292 states and 1760 edges across 12 prepared seeds, maximum depth 21 under cap 28, zero frontier. Composer preservation, independent setup, pending command freezing and effective native cancellation/reentry pass. Exact-pair confirmation still fails: after confirming Daily → Existing, change From or To to Other and the normal Post callback saves that unconfirmed pair. Both original signs and account answers have witnesses. No money moved in this verification; the graph stops that transfer at local save.

TLA+ v1.7.4/TLC 2.19 is used for ordering of callbacks and asynchronous boundaries. The extractor executes real React components and emits raw observations/edges. TLC evaluates those observations rather than a handwritten substitute for the product functions. These are finite safety checks, not an unbounded TypeScript, whole-UI or cloud proof.

`CategoryCRUD.tla` checks exact user-intended requests, delete confirmation, frozen metadata, retained failed answers, effective cancellation, dismissal-before-account delivery, missing-selection recovery and field intent. `CategoryUI.tla` retains the posting checks. Plain JSON graphs and counterexamples are readable without TLA. Unicode/opaque equality is encoded losslessly for the TLA lexer.

The native layer and provider replies are substituted. Metadata responses are controlled input projections, not backend executions. A retained picker subscriber observes catalog updates; this does not prove full screen navigation. Appearance input is one actual emoji✨/swatch h30. React updates and effects flush between events. Arbitrary native animations, other batching, provider scheduling, persistence/restart, physical hardware, visual/a11y acceptance, first-run Setup and arbitrary input domains are excluded.

## Source, proof and history

The source is snapshot `f2e206227ec7fc08bb29ef70e5ff5f49209b91f1`, tree `27a8f15c5047d3dd96636949a52dd79e01720378`, 437 source blobs. Root HEAD/index were preserved. source-sync.json lists 25 covered production hashes. Every run also records exact verifier inputs, package/tool versions and source checks before/after extraction/TLC.

Current evidence lives in `.orchestrator/runs/2026-10-20-category-ui-crud-formal/`. The earlier f531 run is historical and remains unedited; its old live verifier inputs were copied with matching hashes into the new run's legacy-f531-verifier archive before updating these files.

The generated [.agents/skills/verify-category-ui/SKILL.md](../../.agents/skills/verify-category-ui/SKILL.md) contains precise events, bounds, coverage, source-review rules, commands and failure interpretation. The new run's backend-binding.json confirms the 22 files covered by the existing verify-categories CRUD proof match this snapshot. Backend soft-delete/history/classification semantics and provider acceptance remain separate evidence in formal/categories, not conclusions of the controlled UI response driver.

No product fix, shared-config change, deployment, reset, provider request, device or historical replay is part of this skill update. The original CATEGORY-UI-001 finding remains open. Use /maintain-formal-verification-skill for later sync work; because it is not installed here, the generated skill includes the manual procedure.
