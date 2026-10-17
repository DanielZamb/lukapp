# Prepare and execute the G03 development data transition

This change prepares data for `https://compassionate-opossum-63.convex.cloud` only. G03 has performed no provider reads or writes, imports, deploys, configuration changes, session changes, device operations, or pushes. Preparation reads the coordinator receipts and private files offline. No failed PR5 source is restored.

The parent reports U01, U02, and G02 integrated at `ff059e5`, with no schema changes since the G03 base `3367167`. Integrate this local tooling commit before execution. Finish reviewing the integrated source locally, then perform this data transition **before** deploying its schema. The guard requires the exact currently deployed schema from the root receipt throughout the transition.

## Prepare and review the private files

Run these commands in the worktree containing this commit:

```sh
python3 -B -m unittest discover -s scripts -p test_g03_transition.py -v
python3 -B scripts/g03_transition.py
```

Preparation is the default. It uses Python's standard library and never starts the Convex CLI. It writes only ignored `scratch/g03/` files, with directory mode `0700` and file mode `0600`. Existing output causes refusal. Use `--output scratch/g03-review2` for a separate preparation. Never commit, print, or attach the private payloads.

The receipt directory is `/Users/zambamon/Work/finance-tracker-v2/.orchestrator/runs/2026-10-17-frontend`. The tool reads the backup path from `deployment-backup.json` and the private sibling `clerkRevocations-prepared.json`. It never modifies either file. Pinned hashes are:

| Input | SHA-256 |
| --- | --- |
| Immutable 41,399-byte backup | `7df1ece3a5969bd03422cf03ffb18e0cb9a3c6c6d9c96ce7c2056d2a335ccdeb` |
| Exact deployed schema receipt | `67a9859544a1200c035e92c47631623c2c682a5482e8008ab5cc6e6055b691be` |
| Prepared tombstones | `a8496f056c677b707ea2db1a6c39beb4ea55fad2c28eb185652b10d815bc5b69` |
| Generated `manifest.json` | `a29f6d01d1c3c7067aa25b76a16ffaaf5f16601fa36ee9fcd009a198b2794f60` |

Review the manifest counts and hashes privately. `before/` contains original single-table JSONL files for rollback. `after/` contains complete replacement tables, including every surviving document's original `_id`, `_creationTime`, and other fields. Empty tables use zero-byte JSONL files. The tool refuses nonuniform export type metadata or extended Convex values rather than lose their types during conversion.

Convex supports [single-table JSONL replacement, empty JSONL clearing, and retained system fields](https://docs.convex.dev/database/import-export/import). Each table replacement is atomic. The sequence of 15 separate imports is not atomic. Never edit the ZIP, use `--replace-all`, or import the entire backup as rollback.

## Establish and hold the write pause

The following steps are instructions for the parent. G03 has not performed them. Do not execute imports until the parent has established all of these conditions:

1. Arrange exclusive administrative access to this development deployment. Stop every `convex dev` watcher, deployment automation, test runner, seed job, other migration, and agent that can write to it. Other operators must refrain from dashboard edits, CLI mutations, imports, code pushes, and configuration changes for the whole window. Keep the configured Owner and Clerk settings unchanged.
2. Open the Convex dashboard, select deployment **compassionate-opossum-63**, confirm its development URL above, and use **Deployment Settings → Pause Deployment**. Record the deployment name, pause confirmation, time, operator, and intended manifest hash in the parent's execution receipt. Use the dashboard's supported pause control, not an application flag or a changed session. [Convex documents this deployment pause](https://docs.convex.dev/production/pause-deployment).
3. Keep the deployment paused. Inspect dashboard Logs and function activity for calls that started before the pause. Wait for those mutations, actions, and HTTP actions to finish. Do not infer that pause cancels an already running action. If any invocation, callback, or external privileged writer cannot be accounted for, stop before the first import. Confirm that no other administrator is writing. The empty scheduled/provider queues and the revoked device in the original snapshot do not establish this condition.
4. Run the guard below. It verifies the live paused state and absence of queued scheduled work both before and after exporting fresh data. It compares all 33 application tables, including the provider-work and denial tables, and the exact deployed schema. Any mismatch prevents a command from being printed.

Under Convex's pause, new application function calls fail, scheduled work queues, and cron executions are skipped. Normal application reads are unavailable too. Webhook deliveries cannot be treated as successfully processed during this window. Leave their configuration unchanged and let the provider's existing retry behavior operate. Inspect failed deliveries and reconcile them after the final source is installed, before claiming provider acceptance. [Pause semantics](https://docs.convex.dev/production/pause-deployment).

Administrative operations can still work while paused, including dashboard data edits and code pushes. Pause therefore does not exclude another administrator. During this transition, allow only read-only dashboard inspection, the guard's administrative reads and exports, and the one parent-executed import command it prints. After the final guard succeeds, the separately reviewed integration deploy may proceed while pause remains held. No Clerk writes, session operations, environment edits, or unrelated data writes belong to this window.

The `--writers-paused` flag attests to the dashboard pause, completed pre-pause calls, and exclusive administrative access. The tool verifies paused state, but it cannot prove that all earlier actions finished or prevent an administrator from writing. Its reads and the subsequent import do not form a compare-and-swap transaction. Do not unpause to make a guard query work. If administrative inspection or export fails while paused, stop and resolve that provider prerequisite without importing.

## Execute one guarded command at a time

Use normal configured Convex CLI credentials from the integrated worktree. Its installed CLI must match the repository's Convex `1.46.0` dependency. The tool passes the exact deployment name on every CLI call and verifies the resolved URL before inspecting data. It never receives or prints a credential.

After establishing the pause, run:

```sh
python3 -B scripts/g03_transition.py next \
  --output scratch/g03 \
  --review-sha a29f6d01d1c3c7067aa25b76a16ffaaf5f16601fa36ee9fcd009a198b2794f60 \
  --deployment compassionate-opossum-63 \
  --url https://compassionate-opossum-63.convex.cloud \
  --writers-paused
```

`next` only reads providers and prints one shell-quoted command. It never executes imports. Read that command, confirm its table and private file, then execute it immediately in the same worktree. Do not pipe the output to a shell, save a command list, or batch imports. The first command has this form, with the absolute path to this worktree's payload:

```sh
pnpm exec convex import --deployment compassionate-opossum-63 --replace --table clerkRevocations "$PWD/scratch/g03/after/clerkRevocations.jsonl"
```

After that command finishes successfully, rerun `next` with the same arguments. It obtains new state before emitting the next command. The order is the table order below. A clean interruption can resume because each affected table must exactly equal its original or prepared contents. Tombstones must exist before any cleanup. Their generated IDs and creation times are allowed; their prepared fields and two-session coverage must match exactly.

| Affected table, in import order | Before | After | Removed | Added |
| --- | ---: | ---: | ---: | ---: |
| clerkRevocations | 0 | 2 | 0 | 2 |
| accountingPeriods | 31 | 30 | 1 | 0 |
| categoryReceipts | 11 | 0 | 11 | 0 |
| deviceChallenges | 7 | 0 | 7 | 0 |
| financialAccountProfiles | 30 | 29 | 1 | 0 |
| firstRunCompletions | 1 | 0 | 1 | 0 |
| journalEntries | 55 | 54 | 1 | 0 |
| journalLines | 110 | 108 | 2 | 0 |
| ledgerAccounts | 87 | 83 | 4 | 0 |
| mobileDevices | 1 | 0 | 1 | 0 |
| openingPositions | 1 | 0 | 1 | 0 |
| personalWorkspaceOwners | 1 | 0 | 1 | 0 |
| userCategories | 11 | 0 | 11 | 0 |
| workspaceMemberships | 17 | 16 | 1 | 0 |
| workspaces | 17 | 16 | 1 | 0 |
| Total affected rows | 380 | 338 | 44 | 2 |

The original backup has 393 rows. The prepared result has 351. All 16 other workspaces and their accounting relationships retain their IDs and contents. Unchanged nonempty tables are `deviceSessionDenials` with 2 rows, `clerkWebhookDeliveries` with 2, and `periodControlDecisions` with 9. All other original empty tables remain empty. No Owner allowlist setting is read or changed by the tool.

The recursive closure starts at the workspace holding all 11 incompatible categories and the one revoked mobile document. It follows references to removed document IDs through objects, arrays, and JSON-encoded request strings until no new rows enter the closure. It includes the nested `firstRunCompletions` receipt and seven challenges referencing that device. It refuses any closure count outside the reviewed 14-table removal map and any surviving reference to a removed document.

After the 15th import, run `next` once more. Require `Prepared target reached`. Keep the pause and take a private final export for the parent's receipt:

```sh
umask 077
pnpm exec convex export --deployment compassionate-opossum-63 --path "$PWD/scratch/g03/after-transition.zip"
```

Record the manifest hash, each import result, affected counts, final export hash, and observed pause state. Only then proceed to the parent's separately controlled schema/source deployment. Never resume old handlers merely to test the transition. Retain pause until the parent completes its deployment and security gates. Resuming can release queued work; inspect the scheduler and webhook retries before doing so.

## Refuse arrivals and changed state

The guard recognizes only the original snapshot plus exactly completed prepared table replacements. It compares row contents, not counts alone. It refuses new tables, extra denials, changed existing denials, provider work, changed surviving documents, unexpected tombstones, changed schema, pending schema validation, queued scheduled jobs, and a running deployment. It rechecks pause, queue, and schema after the fresh export.

A webhook or background arrival observed between imports causes the next guard to refuse. Do not clear the arrival, regenerate tombstones, rerun a stale command, or overwrite the table to restore the expected count. Keep the deployment paused and preserve a private diagnostic export. The parent must determine whether the pause was lost, an earlier call remained in flight, or another administrator wrote, then review a new snapshot and plan if needed. An arrival after inspection and before import is not protected by a transactional precondition. Maintaining pause, draining pre-pause calls, and excluding administrative writers are mandatory, not optional checks.

If an import fails or its result is ambiguous, inspect the supported dashboard import status and wait for that import to settle. Never start another import concurrently. Then rerun the guard. A table with unexpected contents causes refusal. Unknown state requires parent review rather than forced replacement.

## Roll back before the schema deployment

Rollback is available only while the pinned old schema remains active and all rows still match a recognized transition state. Hold the same pause, drain, and exclusive-administrator conditions. Run:

```sh
python3 -B scripts/g03_transition.py next \
  --output scratch/g03 \
  --review-sha a29f6d01d1c3c7067aa25b76a16ffaaf5f16601fa36ee9fcd009a198b2794f60 \
  --deployment compassionate-opossum-63 \
  --url https://compassionate-opossum-63.convex.cloud \
  --writers-paused \
  --rollback
```

Execute the one emitted command, then rerun this guard until it reports `Rollback data restored; both tombstones remain.` It restores changed cleanup tables in reverse order, using `before/<table>.jsonl`. It skips unchanged tables and never clears `clerkRevocations`. If no forward import occurred, rollback performs no write and reports that no tombstones have been imported.

A fully restored data state has 395 rows, the original 393 plus the two prepared tombstones. Both original `deviceSessionDenials` rows remain unchanged. The old revoked mobile row can return only with its original revoked state and its denial preserved. This is a data rollback, not a source rollback. The immutable full ZIP contains an empty `clerkRevocations` table, so restoring it wholesale would remove the new negative admission records.

After the integrated schema is deployed, this rollback refuses. Do not relax that schema or restore failed PR5 code to make old incompatible records fit. The parent must review a forward repair if data recovery becomes necessary after cutover.

## Local evidence and remaining gates

Fifteen offline tests pass. They exercise the actual immutable private backup, exact surviving document contents, denial coverage, recursive and JSON-encoded references, deterministic payloads, supported empty JSONL files, private permissions, wrong-environment refusal before provider contact, manifest tampering, schema changes, changed live rows, scheduled arrivals, pause loss during export, partial forward progress, and denial-preserving rollback. Simulated administrative reads test the guard logic; they are not provider acceptance.

No Convex administrative read, pause, import, or deploy has been executed by G03. The guard's system-query compatibility while paused and administrative import behavior still require the parent's live check. The system query names follow the installed CLI's schema inspection and the [official backend's deployment state](https://github.com/get-convex/convex-backend/blob/main/npm-packages/system-udfs/convex/_system/frontend/deploymentState.ts), [scheduler](https://github.com/get-convex/convex-backend/blob/main/npm-packages/system-udfs/convex/_system/frontend/paginatedScheduledJobs.ts), and [schema inspection](https://github.com/get-convex/convex-backend/blob/main/npm-packages/system-udfs/convex/_system/frontend/getSchemas.ts) code. A different provider response causes refusal. No unpause fallback is built.

Final integrated schema acceptance, actual authenticated Clerk admission, normal public API requests, webhook retry reconciliation, native UI acceptance, and physical-device checks remain open under root `AGENTS.md`. The historical data establishes compatibility requirements only.
