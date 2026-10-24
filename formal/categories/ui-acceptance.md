# Category UI and CRUD acceptance, 2026-10-20

The category question now composes the existing `Choice` cards. Name inputs use
`Field`, deletion uses the semantic danger treatment, and category palettes follow
light/dark mode. Settings → Categories supports creation, reading, search,
renaming, emoji/color edits and confirmed deletion. Account answers still use
the established account-setup handoff. Metadata updates preserve money direction
and posting classification; accounting reclassification remains separate.

The [initial audit](ui-adherence.md) is historical. The
[implementation receipt](../../.orchestrator/runs/2026-10-20-category-crud/receipt.json)
records current evidence and its limits.

| Evidence | Result |
| --- | --- |
| Client source | `bef2bf0e1700781e764e115cf5e9e8a368821129` |
| Backend source | `0da53d45c19702f894851f99c3702e3ec04bfc39`; backend bytes identical in the client snapshot |
| Real deployment | `https://compassionate-opossum-63.convex.cloud` |
| iOS | Real native Google/Clerk admission, retained session and native Face ID simulator unlock; normal SDK category reads/create/update/delete passed |
| UI negatives | Missing answer blocked save; duplicate name blocked save; Keep category canceled deletion; cold relaunch required unlock and retained empty catalog |
| Appearance | Light/dark choices inspected; keyboard overlap reproduced and corrected with the shared sheet's top safe-area inset |
| Android | Same source built and installed; authentication remains open at “Checking local protection…” after a normal restart |
| Local regression | 1,081 passed, zero failed; root/mobile typechecks passed |
| Bounded verification | 12 checks passed; all 18 real-source mutants failed their intended assertions; restored copy passed |

The development reset removed all 34 original categories from active catalogs
across three workspaces. Tombstones retain historical identities. The two isolated
iOS test categories were deleted through the public app. Final active catalogs
are empty for every user; all 60 entries, 120 lines, ledger accounts, financial
profiles and budget revisions retain their original values. Production was untouched.

The [iOS receipt](../../.orchestrator/runs/2026-10-20-category-crud/ios-round2/receipt.json)
contains exact authenticated SDK inputs, persisted category IDs, screenshot hashes,
build/install hashes and negative checks. Administrator table readbacks supplement
the native interaction; they do not establish authentication. Used-budget deletion,
saved-post retries, reversals and cloud races were not newly exercised through
the signed-in UI; relevant finite histories passed locally. Native sheet automation
required screenshot/OCR coordinates because its accessibility tree is sparse.
Complete VoiceOver, physical hardware and Android runtime acceptance remain open.
