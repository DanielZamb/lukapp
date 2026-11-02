# Retained verification assets

The engineering lessons are in [VERIFICATION-LESSONS.md](VERIFICATION-LESSONS.md). The private `.verification/` directory holds the small inputs and witnesses needed to interpret or rerun the important checks. It replaces the executable dependencies on the former `.orchestrator/` directories and the old external finance project.

Keep `.verification/`, `.agents/`, and this checkout's `.git` during cleanup. These hidden directories are not interchangeable. `.git` retains the pinned source commits and custom refs. `.agents` contains the project verification skills read by the checkers. `.verification` contains private financial inputs, configuration, selected historical evidence, the pinned TLC tool, and the latest tested APK. Do not publish or force-add its private contents to Git.

## What is retained

- `inputs/accounting-v1/` contains the original ten hashed corpus files, their unchanged manifest, the exact legacy oracle source, and a portable input checker. The originals remain byte-identical. The portable checker retains the original hash, dependency-order, coverage, selector, and signed-sum assertions.
- `inputs/filtered-replay/` contains the original filtered scope and oracle, the reviewed lending correction, and their hash manifests. It preserves the expectations of the stopped partial replay, not authorization to resume it.
- `evidence/` contains compact receipts, original counterexamples, actual mutant source and observation witnesses, category assertion reports, and selected native/provider outcomes. It does not retain every recording, graph expansion, or intermediate log.
- `provenance/` contains exact older verifier bundles, the original transfer checker, original skill snapshots, the unmodified provider registry, and the original delivered guide ZIP. Recorded old paths are historical locations, not dependencies to recreate.
- `provider/provider-verification.json` preserves the provider gate's acceptance states and remaps references when their exact evidence was retained. Its retention note identifies the incomplete raw audit trail. Relocation does not upgrade runtime acceptance.
- `knowledge/field-guide/` contains the offline reader, Markdown, counterexample catalog, retained source excerpts, and integrity checker. Its builder now uses those retained excerpts. It requires no old worktree or `.orchestrator` source.
- `tools/tla/v1.7.4/tla2tools.jar` is the pinned TLC tool with SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`.
- `legacy-transition/` retains the pinned administrative backup, schema, and prepared tombstones used by the older offline G03 checks. Retaining them does not authorize another deployment transition or record reset.
- `artifacts/` retains the tested `f7aa22f` Android APK and its original receipt. Its build source is historical even if this checkout later advances.
- `private/` retains a distinct replay configuration without replacing the current configuration. Never print its values.

`RETENTION-MANIFEST.json` records retained file hashes and the required Git sources. The manifest covers a preservation snapshot. A later intentional change to a retained file needs a new manifest; a matching hash does not establish product correctness.

## Run the checks from this checkout

Installed repository dependencies, Python, Node, pnpm, Java 21, Git, and tar are prerequisites for the relevant commands. No command below establishes real Clerk admission or physical-device acceptance.

Check the retained file inventory and references:

```sh
python3 .verification/verify-retained.py
```

Check the exact original accounting corpus without the old external project:

```sh
python3 .verification/inputs/accounting-v1/verify_inputs.py
```

Reproduce the pinned accounting model and its five production-code mutation challenges:

```sh
node formal/accounting-replay/check.mjs --source-ref f5315c37a03154b8f6066adce8bc6d92458592f7 --self-test
```

Run the category domain checks and their mutation rehearsal. At the relocation checkpoint, all 12 baseline checks and 18 mutant assertions passed, while the source-review gate remained open for `convex/store.ts`, `convex/schema.ts`, and `convex/personalDefaults.ts`. The resulting exit 1 is recorded as `SOURCE_REVIEW_REQUIRED`, not a new current-source proof:

```sh
python3 formal/categories/verify.py --prove-checks
```

Reproduce the pinned broader category UI result and its challenges:

```sh
node formal/category-ui/reproduce.mjs --prove-checks
```

That historical UI reproduction returns exit 2 because it preserves `CATEGORY-UI-001` on the old source. A current-source check can return exit 3 for source review. Neither result is interchangeable with an extraction failure or a passing current-product proof.

Reproduce the later focused transfer-pair closure:

```sh
node formal/transfer-pair/check.mjs --reproduce
```

Rebuild and check the offline guide without its old source directories:

```sh
python3 .verification/knowledge/field-guide/build.py
python3 .verification/knowledge/field-guide/verify_artifact.py
```

New execution output belongs in `reports/`. Generated reports are distinct from the retained evidence in `.verification/evidence/`. Do not overwrite an old receipt to make it describe a newer source.

## Cleanup boundary

The authorized removal target is the canonical checkout's former `.orchestrator/` directory once the relocation receipt confirms validation. Its old recordings, dependency installs, native builds, and generated state stores are intentionally omitted from this compact kit. Their loss reduces historical audit detail. The source rules, small original inputs, and selected decision-changing witnesses remain.

Keep the rest of the canonical checkout, including its Git database, current configuration, private retained kit, project skills, and uncommitted Markdown. This cleanup does not authorize production changes, resuming a stopped replay, deleting unrelated projects, or removing the system SDKs and tools needed to run the checks.
