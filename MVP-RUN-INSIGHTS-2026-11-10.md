# Lukapp MVP run, 10–11 November 2026: what the workers built and learned

This records the work of 31 finished worker checkouts before they were released, so that nothing depends on them. It covers branch `mvp/crud-es-co-feedback-20261110` (draft PR #15) up to `261801a`. General engineering lessons live in [VERIFICATION-LESSONS.md](VERIFICATION-LESSONS.md); this file is the account of one run.

Every result below is local regression evidence unless it says otherwise. No signed-in run against the deployed backend has happened, so runtime acceptance is open for all of it (see "Open follow-ups").

## State at `261801a`

- `pnpm vitest run --maxWorkers=6`: 3,137 tests pass (main had 1,331 passing and 1 failing). `pnpm typecheck` clean. `pnpm check:publication` passes.
- Convex development deployment `compassionate-opossum-63` runs `ffee6c6`; `261801a` adds only the regenerated API types. Anonymous calls to every new public function return `authentication_required`.
- Three workers were still running when this was written and are not covered: the amount-field review fixes (`t3/fix-amount-confirmation-send`, with an earlier interrupted attempt on `t3/amount-session-safety`) and the Close/Undo recovery fixes (`t3/preserve-unknown-place-outcomes`).

## What was built, by stream

Each line names the worker branch and its last commit. All of these commits are contained in the MVP branch and the branches are kept.

### Lifecycle controls (SEN-118, SEN-23, SEN-82)

| Branch | Head | What it delivered |
|---|---|---|
| `t3/place-recovery-lifecycle-api` | `70dfc98` | Backend: rename a Place, cancel a Recovery plan, linked replacement, contribution history, attribution correction, device list. |
| `t3/fix-savings-lifecycle` | `e5505e1` | Fixes from the Recovery backend review: a contribution could be counted twice through a correction; released principal could be stranded. |
| `t3/mobile-lifecycle-controls` | `98a098f` | Screens: rename a Place, typed Budget amount, devices and sessions, exact category colour. |
| `t3/place-recovery-lifecycle-ui` | `7589948` | Screens: cancel and replace a plan, contribution history, correct an attribution. |
| `t3/candidate-draft-lifecycle-controls` | `fba25e4` | Discard one Candidate; keep, update or discard one Draft. Fixed the failing baseline test, which was a real defect: frozen Candidates were dropped from the Ready set. |
| `t3/fix-lifecycle-command-freeze` | `419a3bf` | Fixes from the lifecycle and navigation review (six findings), including a stale batch editor that could post an entry twice under a new key. |

### Colombian Spanish (SEN-35)

| Branch | Head | What it delivered |
|---|---|---|
| `t3/spanish-first-screens` | `b1e953d` | Access, setup and home in the shared catalog. |
| `t3/organising-money-spanish` | `ad30be7` | Categories, Budget, Overview, History and Month Close. |
| `t3/spanish-money-inbox` | `2b20802` | Posting, review, inbox and Drafts. |
| `t3/translate-places-recovery-plans` | `be3eecd` | Places and Recovery. |
| `t3/catalog-copy-place-kinds` | `ec4d522` | Owner wording choices, the English rewrite of internal terms, Place kinds (Billetera digital stored as a savings account), duplicate names refused on create, 30-day screenshot period stated. |
| `t3/intake-timezone-budget-labels` | `18e8a3b` | Fixes from the review of the owner-decision changes: the month-backwards zone change is explained before sending; spend-nothing reads the same on every Budget surface. |

The catalog is `src/i18n/catalog/{en,es}/<namespace>.ts`; Spanish is typed against English and `src/i18n/i18n.test.ts` checks parity and placeholders. Each area has a guard test that fails if hard-coded copy returns.

### Problem reports to GitHub (SEN-120, onboarding slice of SEN-121)

| Branch | Head | What it delivered |
|---|---|---|
| `t3/github-feedback-backend` | `c1c0b53` | First backend: destination, submit, idempotency, quotas. |
| `t3/mobile-feedback-report-flow` | `88eff4e` | Shake, capture before the form, redaction, Settings entry, onboarding guide and practice mode. |
| `t3/secure-feedback-reports` | `5351bb4` | Backend redesign after the security review: the screenshot is bound to its report by digest, stays in backend storage, and recovery adopts only issues created by the app's own account. |
| `t3/secure-feedback-screenshot-flow` | `3f7072c` | App side of the redesign; a restart can no longer undo a redaction. |

### Owner decisions of 10 November

| Branch | Head | What it delivered |
|---|---|---|
| `t3/auto-cancel-reopened-plan` | `b00459c` | A plan reopened by a reversal while another is running is cancelled automatically. |
| `t3/recovery-event-calendar-dates` | `ab89b5e` | Stored activation and cancellation dates, with a backfill (run on development: 3 plans updated). |
| `t3/budget-limit-removal-zero` | `c8c19b0` | Backend: remove a limit from this month on; a real spend-nothing limit; bare zero still refused. |
| `t3/budget-zero-limit-removal` | `7ad4976` | Screens for the two choices. |
| `t3/workspace-settings-after-setup` | `91071bf` | Backend: default Place, time zone, one currency change before any entry. |
| `t3/workspace-settings-screen` | `f7b5851` | The settings screen. |
| `t3/close-place-backend` | `6de70f7` | Close a Place: lines for where the money went, Closing Adjustment categories. |
| `t3/undo-place-workflow` | `d6fb804` | Undo a Place: preview, scheduler-driven reversal batches, status, watchdog. |
| `t3/harden-place-undo` | `f18e901` | Fixes from the first Close/Undo review: preflight, recovery and scheduling. |
| `t3/bind-place-close-undo-confirmations` | `7a8143d` | Close carries the reviewed balance and date; Undo Start must present the preview fingerprint; abort only when stopped with nothing reversed. |
| `t3/place-close-undo-flows` | `9a70a75` | The Close and Undo screens; ended Places read-only everywhere they appear. |
| `t3/place-ending-confirmation` | `b810b47` | Screens send exactly what was reviewed and keep an unconfirmed request on the phone across restarts. |

### Amounts follow the workspace currency (SEN-122)

| Branch | Head | What it delivered |
|---|---|---|
| `t3/currency-aware-amount-grammar` | `009eb98` | Conventions table (COP and USD explicit, others on the previous Colombian profile), strict grammar, mutation checks of the grammar. |
| `t3/currency-aware-amounts` | `cc670c7` | The shared amount field in every screen; stored amount text tagged with its format; Draft and intake state migrations. |
| `t3/amount-edit-safety` | `88077e4` | Fixes from the first field review: caret after deletion, confirmation before sending, stale sessions. |
| `t3/native-amount-keyboard` | `8e8a8f5` | The redesign from the Samsung S21 FE study (below). Its device harness sits above the sign-in gates, so it is kept on that branch and in the local reports folder, not in the MVP branch. |

## What was verified, and how

- **Local tests** for every change, written failing-first for review findings. These are regression evidence only.
- **Independent reviews** by a model from a different family than the author: Recovery backend, feedback end to end, lifecycle and navigation, Spanish copy (about 115 strings changed), backend changes for the owner decisions, the amount grammar and field (three rounds), Close/Undo (three rounds). Every confirmed finding was reproduced in a test before it was fixed.
- **Mutation checks** on the amount grammar: five deliberate faults (accept a foreign decimal, allow a short group, drop the safe-integer bound, round excess decimals, swap USD separators) were each caught.
- **Anonymous negatives** against the deployed backend through the public API.
- **One device study**, component only: what Samsung Keyboard on an S21 FE sends to a text field, recorded key by key with a harness placed above the sign-in gates in a separate package (`com.lukapp.u01.dev`). Twenty recordings are replayed by `apps/mobile/src/features/amount/deviceReplay.test.ts`. This is not acceptance of the app: nothing was signed in.

## Defects and regressions found

- Frozen Candidates dropped from the Ready set (on main; the one failing baseline test).
- A stale batch editor could resend an unsettled entry under a new key and post it twice (on main).
- After a failed "Confirm all Ready" the batch could not be retried.
- Recovery: double counting through a correction; stranded principal.
- Feedback: a screenshot not bound to its report, a screenshot publishable without an issue, a retry adopting an unrelated issue, a restart undoing a redaction.
- Workspace settings: a time-zone change could move the current month backwards. Now refused (`time_zone_month_behind`).
- Close/Undo: a confirmation could apply to a balance or set of entries the person had not seen (two rounds). A third review found three more in recovery of an unknown outcome; their fix was in progress when this was written.
- Amount field: the first design inferred edits from text changes and could place a digit in the wrong position on a real keyboard (open `1,111`, delete inside, type `2`, and the value read `1,112`). The redesign removes inference. Five further findings were being fixed when this was written.

## Decisions made

Recorded in ADRs 0091 to 0097 (local `docs/adr`) and the owner-decisions file in the local reports folder. In short: two ways to end a Place and no reopening; Close asks where the money went; workspace settings after setup; zero Budget limits become "remove" or "spend nothing"; one running Recovery plan per expense; amount format by workspace currency, strict, never guessed, COP and USD only for now; report screenshots stay out of the repository and are deleted after 30 days; the feedback repository stays public.

Amount-field design, from the device study: the phone's own number pad is the only keyboard; the native text is the single source of truth and is never rewritten while typing; the grouped reading is shown on a separate "Reads as" line; the app's only edits are its decimal and sign keys; a pasted amount with a separator or a converted stored amount must be confirmed before sending.

## Open follow-ups

Runtime acceptance, blocked on the owner (all streams): unlock the Android emulator `Lukapp_XXL_T8_Cutout`, sign in with Clerk on a device, provide the GitHub token (fine-grained, Issues read and write on the feedback repository). Until then no ticket below can close.

| Item | Linear | Todo |
|---|---|---|
| Lifecycle gaps: signed-in checks of every control, navigation round trips, revoked device during each write | SEN-118, SEN-23, SEN-82 | `470b9247` |
| Spanish at the largest text size on a device; sign-in screens follow the phone language; some server-built History labels are English | SEN-35 | `6c6fa5fe` |
| First real report with and without a screenshot, retry, rate limit, retention deletion, shake on hardware | SEN-120 | `f70cc773` |
| Onboarding beyond the feedback guide | SEN-121 | `0fea0ea0` |
| Amount field: merge the five review fixes, then check sign and decimal keys on a real Samsung keyboard | SEN-122 | `f69d3372` |
| Small owner decisions: device check of wording and Place kinds | SEN-118, SEN-35 | `e81aee5d` |
| Auto-cancel of a reopened plan: record the decision on the ticket, signed-in check | SEN-23 | `b62b021f` |
| Budget remove and spend-nothing: record the decision on the ticket, signed-in check | SEN-61 | `789f9d39` |
| Workspace settings: signed-in check, zone change at a month boundary | SEN-118 | `5f8f8de8` |
| Close a Place: merge the recovery fixes; overdrawn and overpaid cases on a device | SEN-118 | `121381f1` |
| Undo a Place: merge the recovery fixes; more than 1,000 journal lines is refused; mappings on a second phone are not checked | SEN-118 | `96beb14e` |

Questions for the owner that no worker could settle: whether the server should accept future-dated entries at all; spend-nothing chosen at category creation; refunds on a spend-nothing category; whether Undo should continue if the person who started it loses access.

## Lessons for future workers

1. **Do not infer what the keyboard did.** A controlled text field that rewrites text while the person types loses or misplaces keys on a real Android keyboard, and worse inside a sheet whose portal renders one commit late. Read the native text literally, show derived formatting somewhere else, and test by replaying recordings from a real phone.
2. **A submit handler must read the current value at the press.** A value captured at render can be one keystroke old. Give the field a getter and make that the only way to read it.
3. **A confirmation belongs to the values on screen.** Send the reviewed balance, date or preview fingerprint with the command and let the server refuse a mismatch. Then check the other direction: something in the fingerprint that changes for unrelated reasons (the current month) can strand an honest person, so the app must know how to fetch a fresh preview.
4. **A coded error on a retry is not a refusal of the original.** Errors raised before the idempotency lookup (provider, session, device, membership) say nothing about the first attempt. Keep the request until a receipt, a post-lookup refusal or server state settles it.
5. **Store the request before sending, and do not send if storing failed.**
6. **Review with a different model family, and review the fixes too.** Every round on money entry and on Close/Undo found defects in the previous round's fix. When the list of special cases grows across rounds, simplify the model instead of adding a case; the amount field only became sound after its edit inference was deleted.
7. **Catalog merges:** each area owns one namespace file; the two `index.ts` lists conflict on every merge and are regenerated, not hand-merged. English copy stays word for word because tests find controls by it.
8. **Generated output stays out of the tree.** Workers kept committing `reports/`; it is ignored for a reason. Put evidence in the local reports folder and cite it.
9. **After merging a branch that adds routes, delete the ignored `apps/mobile/.expo/types`** or typecheck fails on stale generated types.
10. **Heavy exhaustive tests need room** on a machine that is also building for a phone: `testTimeout` is 60 s and the suite runs with `--maxWorkers`.
11. **The owner's phone holds their real app** (`com.lukapp.dev`). Test builds use a different package; confirm the package before every install, drive the screen through the T3 device tools, type by tapping keys, and leave settings as found.
12. **Release a worker's checkout as soon as its branch is merged.** Thirty-one finished checkouts held about 31 GB.

## Evidence kept

Raw evidence is not published: `reports/` is ignored by this repository's rules and new verification results belong there. What was chosen from the worker checkouts (reports, decision tables, failing-before logs, baseline witness scripts, mutation receipts; about 1 MB, full-suite logs dropped) is in the primary checkout under `reports/mvp-2026-11-10/worktree-evidence/<branch>/`, beside the worker reports already collected in `reports/mvp-2026-11-10/` and the device study in `reports/mvp-2026-11-10/amount-field/`. The recordings the tests need are tracked in `apps/mobile/src/features/amount/fixtures/`.

## Addendum, 11 November 04:50: the later review rounds (head `3fd1a15`)

The three workers still running when this was written have merged, followed by four more fix rounds, each prompted by an independent review of the one before. 3,477 tests pass. Backend on development is at `fb9ea3f`; later commits change the app only. Still no signed-in or device run.

| Merge | What it fixed |
|---|---|
| `95649f1` | A retry's coded error no longer releases a request whose outcome is unknown; a Close or Undo is not sent unless saved on the phone first; Undo's preview renews on a new month. |
| `a791015` | Amount field: batch confirm of unconfirmed amounts, Save reading the amount at the press, separate paste and conversion reasons, sign held beside the text. |
| `ad025e2` | Recovery Move money and Activate plan on the shared frozen-command rule; a batch item refused by an access check stays frozen. |
| `fb9ea3f` | Decimal key without caret acknowledgement (a completing mark is shown in a fresh input); "Confirm all Ready" follows the single-entry opening; Undo preview takes a `renewal` argument (backend). |
| `6451e15` | Every write screen builds its command from one reading of the form at the press; guard test `apps/mobile/src/features/pressReads.test.ts`. |
| `a597695` | Move money and Activate plan are stored before sending (`apps/mobile/src/features/unresolvedRequests.ts`), so a restart resends the same key. |
| `bd12675` | An amount carries the opening it was typed under and is refused under a later currency or owner state; two-step confirmations act only on what they showed (`apps/mobile/src/features/confirmation.ts`); a frozen Candidate resends its held command. |
| `3fd1a15` | Regression from `bd12675`: Post did nothing for a money-out Candidate. Also a Close left silent by a late paste. |

Findings per review round on 11 November: 3, 5, 4, 5, 2. The last round's ordinary-use defect was introduced by the round before it.

### Lessons added

13. **A null that means "skip" is a defect waiting.** Twice a helper returned null for "I cannot describe this" and its caller treated that as a finished press: the person tapped and nothing happened, with no message. A press either builds a command or shows a reason.
14. **Stop patching when a fix round introduces an ordinary-use regression.** The fifth reviewer's advice, taken: fix the two findings, add no further mechanism, and verify on a device before another review. If the next review finds another silent skip, make Post one function that returns a command or a reason.
15. **Each review round should be asked whether the design is converging,** with reachability stated per finding (ordinary use, one-frame race, retained callback). Counts alone did not show that the causes were narrowing until the regression appeared.
16. **Name the deployment on every deploy command.** `convex dev --once` without `CONVEX_DEPLOYMENT` in a worktree that has no `.env.local` creates a local anonymous config instead of failing.
17. **Check a worker's branch name before merging;** T3 renames `t3/<id>` branches after the task title.

### Next step

Device verification against the deployed backend, signed in: Post an expense Candidate after choosing a category, Post an income Candidate, the Budget warning and Continue, Close a Place, resend a frozen Candidate, Move money with a lost reply and a restart, and the amount field's sign and decimal keys on the Samsung keyboard. The Codex reviewer seat is out of quota until 16 November; the last round was reviewed by Grok 4.7.
