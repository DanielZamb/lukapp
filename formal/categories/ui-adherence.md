# Category nature question audit

Audit date: 2026-10-20. Result: partial adherence. No product code changed.

`NatureQuestion.tsx` uses `useUi` for the heading, helper text, answer text,
spacing and a minimum 48-point touch target. It shares one question between
setup and posting, exposes radio checked/disabled states, restricts answers by
the posting direction, and disables input while saving.

The answer rows bypass `Choice` in `apps/mobile/src/ui/core.tsx`. They use
`ui.input` and Unicode checkmarks/circles. `Choice` supplies the shared card
background, padding, rounded border, selected primary border and Ionicons
selection indicator through `createCoreStyles` in `ui/styles.ts`. Those visual
states are absent from the new question. Native screenshots show the same
plain rows. This is a UI-system finding, not a failure of accounting routing.
The existing `Choice` also needs a disabled contract before it can replace
these saving-aware rows. A direct substitution would discard that behavior.

Both callers inherit the finding:

- `apps/mobile/src/features/categories/SetupRestyleSheet.tsx`, custom setup.
- `apps/mobile/src/features/categories/CategorySheet.tsx`, custom posting.

The audited six files, those three files plus `ui/core.tsx`, `ui/styles.ts`
and `ui/tokens.ts`, are byte-identical to source commit
`f5315c37a03154b8f6066adce8bc6d92458592f7`. The root HEAD remains
`57d58acd5f802aefb3959a378e238e130da267c1` with pre-existing uncommitted work.
The prior native evidence actually ran the question on
`8de70c590ae20e2cdc26c5e82fceea2f2ebdcbc0`; its unchanged question modules were
carried forward to `f5315c37` with a recorded source equivalence check.

Inspected evidence under
`.orchestrator/runs/2026-10-20-category-nature-questions/`:

- Setup: `ios/candidates/8de70c590ae20e2cdc26c5e82fceea2f2ebdcbc0/runtime/evidence/01-starters/0048-screen.png`.
- Posting: `ios/candidates/8de70c590ae20e2cdc26c5e82fceea2f2ebdcbc0/runtime/evidence/07-expense15-save/0006-screen.png`.
- `receipt.json` and `carry-forward-source-proof.json` record the bounded native acceptance and its source history.
- Final iOS receipt: `ios/candidates/f5315c37a03154b8f6066adce8bc6d92458592f7/runtime/final-receipt.json`.
- Final Android receipt: `android/candidates/f5315c37a03154b8f6066adce8bc6d92458592f7/runtime/receipt.json`.

That prior evidence names DEV `https://compassionate-opossum-63.convex.cloud`,
deployed backend source `4d9fd0e56e4c5ca3c8014d34cff1654dc0db9e73`, and Clerk issuer
`https://assured-vervet-68.clerk.accounts.dev`. It records real retained Clerk
admission, native SDK public category creation/read requests, expense/income
classification, account routing without category creation, name/selection
guards, and restart readback on both simulators. iOS subjects and workspace IDs
are in that receipt, not fabricated by this check. Existing limits include
physical biometrics, iOS isolated offline retry, explicit Retry-button failure,
session-only unsaved edits and backend source fingerprinting.

There was no fresh authenticated run in this audit. T3 `device_list` found both
platforms available and `device_open` opened the iPhone 17 panel, but the CLI
returned `DEVICE_IN_USE: Device is already in use by session
"t3-f5fdefc9bd884c3a73dcea0a"`. The existing session was preserved. New UI
acceptance remains open; earlier scoped acceptance is historical evidence.
There were no deployment changes, provider record changes, resets or production
operations in this audit.
