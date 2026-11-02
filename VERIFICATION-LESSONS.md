# Lukapp engineering lessons from verification

For the people and agents who inherit this app.

The most instructive failures looked correct when viewed from one layer. A transfer could balance while the user had never confirmed its final destination. A retry could return success for a different amount. Two History rows could describe one journal. A large verification run could check the wrong source. A replay could produce correct financial totals and still leave important native flows untested.

The common failure was losing a distinction that mattered. Request identity became a button press. Account-pair confirmation became a boolean. A deleted category became a missing record. A bounded result became a general claim.

The work below is about preserving those distinctions. Historical findings remain attached to their tested source. Deliberately injected faults are identified as such. Current regression specifications are evidence of intended behavior, not a claim that they were rerun while writing this guide. The source notes below identify the original files and their hashes. Fuller supporting excerpts remain in the separately delivered offline package. The reference checkout is `f7aa22f`, recorded on 23 October 2026. [S01](#s01) [S02](#s02) [S07](#s07) [S17](#s17)

## Retained verification assets

The compact private inputs, source excerpts, essential witnesses, and provider record live in `.verification/`. Read [VERIFICATION-ASSETS.md](VERIFICATION-ASSETS.md) for their structure and runnable checks. Original `.orchestrator` and worktree locations in the historical source notes may no longer exist. Current verification uses the retained inputs and does not require those old directories.

## The commitments worth carrying forward

- A financial retry identifies the same intent and returns the same effect. A changed intent requires a new key.
- A user confirmation belongs to the exact values the user reviewed. Changing those values invalidates the confirmation.
- Posted history retains its identities. Editing presentation or deleting a choice cannot silently reinterpret old money.
- A derived view must agree with the ledger, but agreement alone does not establish user intent, authentication, or complete UI behavior.
- A verification claim names its source, assumptions, input domain, execution boundary, and exclusions.
- Uncertainty about a financial dispatch calls for reconciliation. Repeating the tap is not reconciliation.

These commitments are the synthesis of the cases below. They are design obligations, not a declaration that every subsystem has already satisfied them.

## Financial correctness depends on identity and time

### A retry repeats intent, not execution

The accounting pilot exposed five failure modes by changing real production code in isolated copies. These were deliberate faults, not five defects found in the unchanged baseline. The shortest traces are worth keeping:

```text
expense1, expense1                 duplicate money after a lost reply
expense1, expense2                 changed amount accepted under an old key
unbalanced                        unequal debits and credits persisted
expense1, reverse0a, reverse0b     one original reversed twice
expense1, reverse0a                reversal repeats the original effect
```

The key alone is insufficient. Replay recognition must compare the original payload and preserve the original receipt. Reversal uniqueness must attach to the original journal, because two callers can use different reversal keys. Mirroring must preserve account and category identities while swapping debit and credit. A test that checks only the final net balance can miss the wrong records or the wrong links. [S02](#s02)

Two kinds of validation also need different timing. An exact acknowledged post must still replay after its accounting period locks. Current authorization must still be enforced: a transient provider failure can deny a retry, and a later authorized retry can return the original post. Membership removal or device revocation must win a stale handoff between action and mutation. “Check idempotency first” is therefore a rule inside the financial operation, not permission to bypass current access control. These boundary cases are encoded in the inspected regression specifications. [S20](#s20) [S21](#s21)

### Deletion must retire a choice without destroying its past

Hard-deleting a used category breaks more than a picker. The category mutation rehearsal includes a fault that loses the historical label and breaks a saved posting retry. Another fault keeps the deleted category selectable. Both behaviors are wrong, for different reasons. [S04](#s04) [S05](#s05)

The useful pattern is a retained identity with separate active-selection rules. A deleted category disappears from new choices and its active budget jar, while old journals, original retries, and reversals retain their meaning. Recreating the same name creates a fresh identity. Renaming or restyling changes metadata, not accounting nature or posting classification. Reclassification is a separate domain operation. [S04](#s04) [S23](#s23)

The UI must also retain a deleted selection long enough for the user to remove it. Hiding the selection while leaving its ID in the draft makes an invalid state invisible. A visible unavailable selection is recoverable. The bounded UI model challenged this behavior explicitly. [S06](#s06) [S27](#s27)

### Plans describe money; they do not secretly move it

The budget specifications keep planning revisions separate from ledger writes. Overspending remains a recordable financial fact. When Food and Family overlap, the same expense consumes the full amount in both jars, while total spending counts the expense once. Adding jar consumption is therefore not a valid way to calculate total spending. [S18](#s18)

Time matters as much as amount. A September expense reversed in October after September locks leaves September consumption intact and produces negative consumption in October. It does not roll a credit into November. A late save for a month that has ended must be rejected rather than silently moved to another month. Replaying an old acknowledged budget revision returns its receipt without restoring the old limit over a newer revision. These are regression specifications, not new cloud acceptance. [S18](#s18)

Savings Recovery has a different distinction. Reversing the expense that justified a plan suspends future recovery; it does not undo money already moved into savings. Reversing a contribution transfer does lower recovered progress. If the transfer exists before the contribution is adopted, a retry must reuse that transfer. Replaying a saved contribution must remain distinguishable from requesting a new contribution after suspension. [S19](#s19)

### The workspace calendar is part of the transaction

At 23:30 in Bogotá on 31 October, the UTC date is already 1 November. The same instant belongs to November in Auckland. The inspected specifications require setup accounting dates and budget months to follow the workspace zone. Truncating a UTC timestamp into a date would put a valid transaction in the wrong period. [S24](#s24)

This is not a formatting issue. It changes which limit applies, whether a period is locked, and which month receives a correction. Keep accounting date, event time, and the workspace's current month explicit. A new clock source or date widget must preserve that distinction.

### A correct preview cannot be computed from an incomplete page

The ledger summary specifications use a revealing example: 55 postings produce a 50-row preview, but totals include all 55. Summing visible rows loses money. Making every Home read scan the whole ledger preserves correctness at an increasing cost. The supported pattern is bounded previews plus independently maintained totals that reconcile to the underlying journals. [S22](#s22)

A backfill must also coexist with new writes and retries. The inspected tests interleave one-row migration batches with new activity, require a not-ready result until completion, and reject an overflow without leaving either a partial journal or a partial summary. A migration-complete flag is a claim about finished work, not a switch that makes an unfinished view trustworthy. [S22](#s22)

## User intent must survive the interface

### Confirmation is a relationship between values

The original `CATEGORY-UI-001` counterexample confirmed one transfer pair, changed an endpoint, then used the normal Post callback. The old source allowed the new, unconfirmed pair to be saved. No provider posting was performed by that local model. [S07](#s07)

The later focused check used three accounts and both amount signs. Removing invalidation from From, To, or Swap broke pair-review safety. Bypassing the submit guard saved a same-account transfer even though `canSubmit` was false. That last witness matters: a disabled control cannot substitute for a guarded handler. [S08](#s08) [S09](#s09)

The good pattern compares what the user confirmed with what will be submitted. Every endpoint change invalidates the relationship. Submit checks it again. The separate native run checked endpoint changes, Swap, transfer posting, reversal, and linked History details. That focused closure did not advance the broader old category UI proof. A fixed defect and a refreshed whole-model binding are different achievements. [S08](#s08) [S10](#s10)

### One journal can have two valid perspectives

The reported transfer ledger was already balanced. Rewriting its money would have repaired the wrong layer. The correction was in review and presentation: all-places History needed a negative source movement and a positive destination movement under one journal identity. [S10](#s10)

Opening the destination movement must preserve that account and its positive sign. Following a reversal link must preserve the clicked perspective. From and To are accounts, not a category label. Two rows are not necessarily duplicate postings, and a correct net-zero total does not prove either row tells the right story. Keep journal identity and viewing account as separate values. [S10](#s10)

### Let an answer establish meaning before filtering choices

The old posting flow hid income choices while a draft amount was negative. The user had to know how to change the sign before the interface would offer the category that explained the sign. The later build allowed choosing Salary from that negative draft and changed the amount to positive while preserving its magnitude. Choosing Food changed a positive draft to negative. [S12](#s12)

The important edge cases were interaction continuity: choose a category before any amount, retain incomplete decimal input, handle an opposite-nature selection, preserve the same-nature category limit and primary-account rules, and use a newly created category's nature before the catalog refresh arrives. Remounting the picker on sign change would interrupt the very flow the fix enabled. The receipt records Android emulator admission and normal public API posts; physical-device and iOS reruns remained open. [S12](#s12)

### Pending work needs a stable owner and payload

The UI mutation challenges disconnected Save and Confirm Delete, changed the wrong category identity, allowed editing a pending name, dropped answers after failure, delivered account setup before modal dismissal, and retained a stale nature answer after a name change. These were injected faults used to test the checker. Each was required to violate its named property. [S27](#s27)

The design lesson is to freeze the submitted command while pending, retain the user's answers when a request fails, make cancellation effective, and give native dismissal an acknowledged place in the flow. Choosing “this is still my money” or “I pay a debt” should hand off to account setup; treating every answer as a category would invent the wrong accounting meaning. [S05](#s05) [S06](#s06)

### Repair the layer that owns the failure

The Android blank strip after keyboard dismissal came from applying a second height adjustment where the native window had already resized. The regression ran the installed React Native component. The accepted emulator run compared the parent and fixed build after real posting, cancellation, and cold restart. The fix removed the extra Android adjustment and retained the iOS behavior. [S11](#s11)

Adding padding to individual screens would have hidden the symptom in several places. So would relying on a screenshot that was stale or black; the receipt explicitly rejects that capture as evidence. Native geometry, keyboard state, a parent reproduction, and a real framework regression together located the owner of the problem. Physical Samsung acceptance was still a separate check. [S11](#s11)

## Verification methods that earned trust

### Challenge the checker with faults that matter

The valuable mutation result is not “the process exited nonzero.” It is “this production-code fault caused this behavioral assertion or invariant to fail, with this witness.” A compile error, missing dependency, source-hash rejection, or unrelated pre-existing finding does not establish that the intended bug was detected. [S05](#s05) [S06](#s06) [S08](#s08)

The focused transfer check required separate properties for pair review and unconfirmed saves. The broader category challenge isolated named invariants so the known transfer finding could not make every mutant appear caught. Baseline and restored artifacts had to agree after scratch mutations were removed. This tests both the observation and the restoration procedure. [S06](#s06) [S08](#s08)

### Observe the fact independently of the flag

Checking the hook's own review boolean would repeat the implementation's belief. The transfer model instead compared saved and confirmed endpoint fields. The accounting model inspected persisted lines, accounts, and categories. This independence is why a mutation could disagree with the property's expected value. [S02](#s02) [S08](#s08)

A ledger can be balanced and still contain the wrong amount, date, category, account, actor, or description. The accounting pilot explicitly excluded general positive-request and metadata fidelity. The historical replay separately compared mapped financial rows and derived views, then retained metadata fidelity limits. Safety invariants and value fidelity answer different questions. [S02](#s02) [S13](#s13)

### Bounds and assumptions belong beside the result

The accounting pilot explored a small fixed fixture, a finite command vocabulary, two callers, and bounded retries. It assumed serializable atomic Convex mutations. The UI extractor flushed effects between events and substituted native behavior and provider replies. Neither established arbitrary framework scheduling or real cloud concurrency. [S02](#s02) [S03](#s03) [S06](#s06)

Within a finite domain, a passing exhaustive result needs a completed frontier. A mutant can stop at its first valid counterexample and still demonstrate a fault; that does not make its graph exhaustive. More states are not automatically stronger evidence. A crashed model checker or an unfinished extraction has no passing verdict. [S03](#s03) [S08](#s08)

### Source identity is part of the claim

The checked source must be immutable or checked for changes during execution. The accounting run rejected mixed-version evidence. The category UI checker uses a source-review result when covered files drift. Moving hashes forward without reviewing changed behavior would erase the very warning the binding exists to provide. [S02](#s02) [S03](#s03) [S06](#s06)

Branch names, current HEAD, native binaries, and the deployed backend can each describe different source. The category-first release therefore recorded its frozen source and APK hash. Later source sync compared backend bytes with the deployment record. This establishes source correspondence within those receipts; it does not create a fresh authenticated UI pass. [S12](#s12) [S17](#s17)

The relocation check exposed an ambient input that source hashes do not capture. The old and maintained account-door graphs differed only in wall-clock-derived dates, 20 October versus 23 October. Their CRUD graph, counterexamples, and finding stayed byte-identical. Baseline and restored output matched within the new run. Exact historical graph equality across days therefore also needs an explicit clock. Preserve the original artifacts when that clock was not pinned. [S30](#s30)

Historical findings also need source identity. The first category audit described missing CRUD features that later work implemented. The original transfer counterexample must remain true of its old snapshot even after a later fix. Preserve that history without presenting old findings as current defects. [S04](#s04) [S06](#s06) [S10](#s10)

### Authentication must be observed through the real boundary

Local identities and controlled provider responses are excellent regression tools. They cannot demonstrate a user's real Clerk admission, physical biometric behavior, or a public request to the development deployment. An administrative read can corroborate persisted records; it cannot establish who authenticated through the app. [S01](#s01) [S04](#s04)

The inspected boundary specifications add another lesson: a provider response is not enough if local revocation or membership changes before the write commits. Signed identity, operation permissions, current membership, and device state must agree at the handoff. These specifications are local evidence. Historical source-review concerns must be re-evaluated against current code before they are declared present or fixed. [S21](#s21) [S26](#s26)

Real devices also impose real limits. A human unlock requirement is a prerequisite, not an invitation to fabricate a token or introduce a production fallback. An anonymous request returning `authentication_required` proves rejection of that request, not success of signed-in access. [S01](#s01) [S16](#s16)

## What the long replay taught us

### Reconcile uncertainty before another financial action

The partial replay encountered transient observation gaps: one batch briefly exposed four of five writes, and one operation used a normal safe Retry path. Waiting and reconciling the known IDs avoided reposting the whole batch. A timeout is an uncertain observation until persistence is checked; it is not proof that nothing happened. [S13](#s13)

Preserve staged, dispatched, and settled states separately. Before a financial action, verify the actual account, date, amount, category, and description in the current UI. After an interruption, reconcile the staged queue and exact journal mappings before continuing. In a partial batch, keep failed candidates without resubmitting successes. Preserve structured revocation errors, including their local-wipe meaning, rather than flattening them into per-item strings. The last two rules are also encoded in the inspected intake specifications. [S13](#s13) [S25](#s25)

### Classify the failure before changing the product

Clipped controls, stale screenshots, missing accessibility descendants, date-widget readiness, and driver assertions stopped automation before a dispatch. Those stops were useful guards, not automatically product failures. The transfer receipt explicitly separates prewrite driver recoveries from product findings. [S10](#s10) [S11](#s11)

The converse matters too. An unsupported historical budget operation is a product-coverage gap, not permission to substitute the current month and count a pass. A missing opening-balance category remained missing even when financial totals matched the reached prefix. Keep tool failure, product defect, unsupported capability, and human prerequisite as different outcomes. [S13](#s13)

### Correct the oracle without rewriting the record

A classifier missed explicit loan transactions. The accepted lending-scope correction preserved original frozen inputs, published effective input hashes, and excluded the affected actions. One iOS action had already posted and received one authorized native reversal. Android had not posted it. [S15](#s15)

This illustrates a legitimate oracle change: identify the mistaken premise, version the corrected scope, preserve the original, reconcile already-applied effects, and review the new expectation independently. Quietly changing expected totals until they match would destroy the evidence. Passing a wrong oracle is still wrong.

### A passed prefix is a useful result with an endpoint

The final partial closeout stopped iOS at source 884 and Android at 600. Financial and read-model checks passed for their reached prefixes, and the common source-600 comparison matched. The remaining native gaps and unexecuted tail were retained. Different ending balances reflected different stopping points. [S13](#s13) [S14](#s14)

Report the endpoint, the effective scope version, the source-to-journal mapping, and the dimensions compared. Financial equality, literal metadata fidelity, category completeness, full native coverage, and cold-restart acceptance remain separate results. The user stopped this run. No future reader should mistake its preserved cursor for authorization to resume it. [S13](#s13) [S14](#s14)

### Put repeatable work in a deterministic runner

The replay already had scripts for bounded batches and preserved state. The closeout identified a stable supervisor as the missing piece: routine known-state handling kept returning to model-driven inspection. Frequent polling, repeated screenshots, and repeated context consumed substantial effort without expanding the financial property being checked. [S13](#s13)

The useful direction is a runner that owns one device, validates an immutable manifest, records transitions, reconciles exact IDs, handles known stops, and emits a compact report. A model handles a new failure or mapping decision. This is a design inference from the run, not a measured speedup. Normal authenticated API replay can answer an accounting question efficiently, but it remains API evidence and cannot replace native UI acceptance. [S13](#s13)

Timing must also describe the thing measured. Tool wall time overlaps background work. Backend execution time is not end-to-end latency. Cached input tokens include repeated context, not that many distinct facts. Adding overlapping durations or treating a source-only sample as a complete request census creates precise-looking misinformation. [S13](#s13)

## What helped and what did not earn its cost

The work worth repeating was narrow and inspectable: reproduce on the parent; fix the owning layer; assert literal outcomes; challenge the check with a real-code fault; preserve the shortest counterexample; restore the source; and exercise the relevant user flow through normal admission. Exact-ID reconciliation and unchanged-state negatives made financial actions reviewable. [S02](#s02) [S08](#s08) [S10](#s10) [S11](#s11)

The less useful work fell into recurring patterns:

- **Treating a large run as a strong result.** The older quality run had passing regression tests, failed coverage mapping, a failed auth mutation gate, and unfinished mutation areas. The correct conclusion was incomplete quality acceptance. Missing mappings were not hundreds of demonstrated product defects. [S28](#s28)
- **Keeping every intermediate artifact as if each were irreplaceable.** Compiler outputs, dependency trees, duplicate binaries, TLC working state, and repeated successful captures do not each carry a unique lesson. The retained UI seal itself excludes reproducible TLC working state. Minimal inputs, verifier versions, decision-changing witnesses, and final receipts have higher long-term value. This is a preservation recommendation, not a claim that dependencies have already been audited for deletion. [S29](#s29)
- **Letting the checker agree with its own implementation.** A boolean, a mock call count, or totals recomputed through the same path can repeat a mistake. Compare the saved fact with an independent expected fact. The transfer handler mutant is a concrete demonstration. [S08](#s08) [S09](#s09)
- **Broadening a narrow pass in the report.** A simulator unlock is not physical hardware acceptance. Build and install are not signed-in behavior. Source equality is not a fresh runtime check. A finite proof is not an unbounded system proof. [S01](#s01) [S04](#s04) [S12](#s12)
- **Repairing the wrong layer.** Balanced transfer records did not need a financial rewrite. A keyboard ownership error did not need scattered screen padding. A driver failure before Post did not demonstrate an accounting defect. [S10](#s10) [S11](#s11)

The aim is not to collect less evidence indiscriminately. It is to keep the evidence that can change a decision and make repetitive execution cheap enough to rerun.

## What the next verification effort still owes

The existing work does not establish every logic subsystem on the current checkout. The next coverage inventory must include accounting and openings, categories, authorization and device admission, budgets, Savings Recovery, intake, period controls, derived summaries, and their adapters. The code contains useful regression specifications for several of these areas; specifications inspected here are not fresh execution results.

The most consequential unfinished questions are:

1. Do the old bounded models still describe the current source, including moved callers and omitted state?
2. Do retries under lost replies, crashes, period locks, deleted categories, and current authorization preserve the same intent and effect?
3. Do ordinary writes and backfills keep journals, summaries, links, and opening guards consistent under interleaving?
4. Do dates and month boundaries follow the workspace zone across budgets, setup, recovery, and corrections?
5. Do partial batches retain only unsettled work and propagate security actions without reducing them to ordinary item errors?
6. Does the exact deployed source pass real Clerk admission and the relevant negative cases through normal public APIs?
7. Which UI behaviors have current native evidence, and which still need iOS, Android, physical hardware, accessibility, or forced-retry acceptance?
8. Which earlier source-review concerns still apply? Re-evaluate the source before carrying a historical severity forward.

The old broad category UI binding, partial replay tail, historical native gaps, incomplete older quality gates, and fresh signed-in acceptance after the latest cleanup must retain their own status. One later success cannot silently close all of them. [S06](#s06) [S13](#s13) [S16](#s16) [S17](#s17) [S26](#s26) [S28](#s28)

## What must survive when the recordings are gone

The durable inheritance has four parts: the rule, a counterexample, an executable check, and a statement of scope. For an old result, add exact source and tool identity, the minimal immutable input and oracle, and a receipt that names what actually happened.

This guide preserves the reasoning and concrete failure sequences. The source notes below retain original-file hashes and evidence classes. The companion package at `.verification/knowledge/field-guide/` contains fuller source excerpts and a machine-readable counterexample catalog. That package is local-only and may be absent in a fresh checkout. The existing product tests and verifiers remain the executable machinery. New executable checks are still needed wherever a lesson has only a written counterexample.

A source hash cannot recover a deleted file. A preserved excerpt cannot reproduce a whole replay. A summary cannot establish an authentication event that was never observed. Keep the few witnesses that resolve a real dispute and the inputs needed to rerun the important checks. Rebuildable output can be treated as output.

Future maintainers owe the user an exact answer to four questions: What did they intend? What persisted? What can safely be retried? What do we still not know?

## Source notes for future agents

These notes identify the evidence used for the historical conclusions. Files under `.orchestrator/` and `.agents/` are private local resources and may be absent in a fresh checkout. Worktree paths name the original worktree, not the active checkout. A missing original prevents reproduction of that run; it does not make the historical result a current pass. Hashes identify the original bytes and do not reconstruct omitted files.

<a id="s01"></a>

### S01 Real-provider acceptance rules

Evidence class: project requirement.

- Original: `AGENTS.md`. SHA-256: `3a7beccae1518f0a971bdae7320c75b8bf7117e61c7f36e406d79e7803148dee`.

<a id="s02"></a>

### S02 Accounting retry and reversal pilot

Evidence class: historical bounded result and injected faults.

- Original: `.orchestrator/runs/2026-10-20-accounting-replay-formal/receipt.json`. SHA-256: `8ccc9ddc7fa5b1a4dd31f3cacd74bb5f1b3482a6c49858ef9069fd4ecaa70256`.

<a id="s03"></a>

### S03 Accounting verifier scope and failure interpretation

Evidence class: verifier contract.

- Original: `.agents/skills/verify-accounting-replay/SKILL.md`. SHA-256: `5740849578bcff6689647b048d2c116b53169df112053bc664c85963be6abe0f`.

<a id="s04"></a>

### S04 Category verification and native CRUD acceptance

Evidence class: historical bounded and scoped runtime results.

- Original: `formal/categories/receipt.json`. SHA-256: `59323f53221a0d88bd61d2e020dae166c43455111c80e410fd6d20d9815464b9`.

- Original: `formal/categories/ui-acceptance.md`. SHA-256: `5f4fe80fab7af5bce9a7a1de6b8b0fd68ea7112e31e07cfcb0ce0371e1262a1c`.

<a id="s05"></a>

### S05 Category real-source mutation scenarios

Evidence class: declared injected faults; acceptance is in S04.

- Original: `formal/categories/verify.py`. SHA-256: `68e3c382bc697012cdbfe009ec93f6a45873d634fbec8b421d37caa22c08dab5`.

<a id="s06"></a>

### S06 Bounded category UI model and its exclusions

Evidence class: historical proof binding and verifier contract.

- Original: `formal/category-ui/README.md`. SHA-256: `414b02b36b529c9f50c81997aae02b26150b2d2050e7765c126176262aa7a79c`.

<a id="s07"></a>

### S07 Original changed-transfer-pair counterexample

Evidence class: observed defect on pinned source.

- Original: `.orchestrator/runs/2026-10-20-category-ui-crud-formal/CATEGORY-UI-001.md`. SHA-256: `6a94f5936149936b3fc44afbef7d87022b67043edef6d69e584cc12ca8c03888`.

<a id="s08"></a>

### S08 Focused transfer-pair closure and real-source challenges

Evidence class: historical focused result.

- Original: `.orchestrator/runs/2026-10-20-transfer-intent/formal/receipt.json`. SHA-256: `bf9f6b85aca9d568e328e104437b1f3d80319ed93dfa1037d66731e8d5a9da79`.

- Original: `.orchestrator/runs/2026-10-20-transfer-intent/formal/README.md`. SHA-256: `8beca3110903f054be83c3b651ae6352809a39ce9886de4a6b2766428e1d3a32`.

<a id="s09"></a>

### S09 Submit-guard bypass witness

Evidence class: injected fault observed in actual-hook model.

- Original: `.orchestrator/runs/2026-10-20-transfer-intent/formal/mutant-submit/witness.json`. SHA-256: `4231a16f1a1d8943daf701051a90beae5f4f26987fda0098a0c1f1a7f512565d`.

<a id="s10"></a>

### S10 Transfer and two-sided History native result

Evidence class: historical scoped iOS and real-provider result.

- Original: `.orchestrator/runs/2026-10-20-transfer-intent/receipt.json`. SHA-256: `acf98b1b5bafbdf1598e322318a06e079b976b0cf5c2f4fd33d1381ac9507b7e`.

<a id="s11"></a>

### S11 Android keyboard gap diagnosis and verification

Evidence class: observed defect and scoped emulator result.

- Original: `worktree:fix-transfer-history-stack-20261020/.orchestrator/runs/2026-10-20-android-bottom-gap/receipt.json`. SHA-256: `e32d50c6b27150c783cc316a1976200546a6c61d872fdcbf61eb4612489c00b1`.

<a id="s12"></a>

### S12 Category-first direction behavior and release result

Evidence class: observed defect and scoped emulator result.

- Original: `worktree:fix-transfer-history-stack-20261020/.orchestrator/runs/2026-10-21-category-first-direction/receipt.json`. SHA-256: `a959ca53e519a99ad044a1ef3d7f69331dd5779cb919841a6653f6780b3d0249`.

<a id="s13"></a>

### S13 Historical replay partial closeout and operational lessons

Evidence class: historical run report with explicit measurement limits.

- Original: `.orchestrator/runs/2026-10-21-filtered-ui-replay/partial-run-closeout.md`. SHA-256: `81a6dfb87aa6c7c07ec7979aeef892ff76407197a977253345b4660734d4ed6f`.

<a id="s14"></a>

### S14 Replay stopping points and separate acceptance dimensions

Evidence class: historical partial result.

- Original: `.orchestrator/runs/2026-10-21-filtered-ui-replay/monitor/user-requested-partial-closeout.json`. SHA-256: `fbe26b2f2502ccb24c84c78d63071e97914bc370f966c6f08c56c40d292733c8`.

<a id="s15"></a>

### S15 Lending scope correction review

Evidence class: historical oracle correction.

- Original: `.orchestrator/runs/2026-10-21-filtered-ui-replay/scope-corrections/lending-v1/coordinator-final-review.json`. SHA-256: `0c13970afb62bdd91487614824b5d33fdf7243f29f6c925dc39ef80c7e70ee96`.

<a id="s16"></a>

### S16 Development legacy-table cleanup receipt

Evidence class: deployed inspection and anonymous public negatives.

- Original: `.orchestrator/runs/2026-10-23-convex-cleanup/receipt.json`. SHA-256: `bd5dc2cfe62bc00283f81ac82c777d7f525ea0a8971b2ccc54ae8b15aad32b96`.

<a id="s17"></a>

### S17 Latest PR source and backend correspondence

Evidence class: source sync result; fresh runtime remains open.

- Original: `.orchestrator/runs/2026-10-23-convex-cleanup/pr-sync/receipt.json`. SHA-256: `de2764e738dd4db4829af8ae92c5ade8af3d96594e81fd2583c24d807db826a3`.

<a id="s18"></a>

### S18 Budget edge-case regression specifications

Evidence class: inspected tests, not newly executed.

- Original: `convex/budget.test.ts`. SHA-256: `539f1e73caf4717d225d6b35b288f675ab843b7c78026f9f722b6eedb781472b`.

<a id="s19"></a>

### S19 Savings Recovery edge-case regression specifications

Evidence class: inspected tests, not newly executed.

- Original: `convex/savingsRecovery.test.ts`. SHA-256: `54477129df73c00e666dd3096651025d9451ed374304e2f0bf53d3b5a9af3a7d`.

<a id="s20"></a>

### S20 Period locking and replay regression specifications

Evidence class: inspected tests, not newly executed.

- Original: `convex/period.test.ts`. SHA-256: `eb476c56e95c6dc8e96e3379782216bbd6199b1f8b1dc779190976d08f45c577`.

<a id="s21"></a>

### S21 Authorization handoff and replay regression specifications

Evidence class: controlled provider tests inspected, not newly executed.

- Original: `convex/accountingBoundary.test.ts`. SHA-256: `df529813a52c6abdd0cced8599b259ae05f7716eb871494885e2b91e458f02ec`.

<a id="s22"></a>

### S22 Ledger summaries, migrations and overflow specifications

Evidence class: inspected tests, not newly executed.

- Original: `convex/ledgerSummary.test.ts`. SHA-256: `348d66fe64869438f2e9a3c1aa658b3618bd41caa0886f79f65ae47eda1ed971`.

<a id="s23"></a>

### S23 Category identity and metadata regression specifications

Evidence class: inspected tests, not newly executed.

- Original: `convex/categoryCrud.test.ts`. SHA-256: `c1c1029988e2c8799bed188213607c432a399274276460c075ca0b4fa685732f`.

<a id="s24"></a>

### S24 Workspace-zone calendar regression specifications

Evidence class: inspected tests, not newly executed.

- Original: `convex/workspaceTimeZone.test.ts`. SHA-256: `88c69b4f4489526c4ca0c59d600bf14aa882a661ca7666f01ec6a78748188b90`.

<a id="s25"></a>

### S25 Intake partial-batch and revocation specifications

Evidence class: inspected tests, not newly executed.

- Original: `convex/notificationIntake.test.ts`. SHA-256: `78e02e36215da5f593e7c781feacbe981d5c520f34197816127b3baae71995dc`.

<a id="s26"></a>

### S26 Older source-only security review disposition

Evidence class: historical concerns; current applicability not established.

- Original: `.orchestrator/runs/2026-10-13-core/orchestrate/lukapp/closeout/security-disposition.json`. SHA-256: `3fa9efac6841a4453061de25b1ef675286bfb338fcdbb4a891499895f50b7757`.

<a id="s27"></a>

### S27 Category UI challenge witnesses

Evidence class: injected faults and named invariants.

- Original: `.orchestrator/runs/2026-10-20-category-ui-crud-formal/cold-final/challenges/receipt.json`. SHA-256: `fdc53fa23baa21af2dc45a4aede85fe2b650a9ccd36d6ab6f3c84068f27f5d46`.

<a id="s28"></a>

### S28 Older stopped quality run

Evidence class: historical failed and incomplete quality gates.

- Original: `.orchestrator/runs/2026-10-13-core/orchestrate/lukapp/closeout/quality-final-stopped.json`. SHA-256: `5c6ee35aba95b92d6ba35e76ed5a6acb9a4501cc4a814d45068f682397c67550`.

<a id="s29"></a>

### S29 Sealed category UI evidence preservation scope

Evidence class: historical preservation receipt.

- Original: `.orchestrator/runs/2026-10-20-category-ui-crud-formal/seal.json`. SHA-256: `ed6bf5c830b12586ce9da5d1c937c11900176bf0a00dab6bcf55b1eeb6b3d54d`.

<a id="s30"></a>

### S30 Ambient clock during historical reproduction

Evidence class: local relocation observation, not runtime product acceptance.

- Original: `.verification/evidence/category-ui/baseline-provenance.json`. SHA-256: `d5c8d8a7a023c9060ec783027f2ffc088dc4eb9176fe13be7ca2bf59a51a1b76`.
