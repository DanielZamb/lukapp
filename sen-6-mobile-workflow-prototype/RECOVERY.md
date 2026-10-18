# Recovered prototype, state of 2026-08-28

This folder overlays the August prototype on `prototype/sen-6-mobile-workflow` (8c1e2ea, Aug 21). That branch never received the work from Aug 23–28. The files were rebuilt on 2026-10-18 from Cursor's local agent store (`~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`). Each file is the content saved after its last Cursor edit. Each was checked against the SHA-256 in its content ID.

| File | Last Cursor edit (UTC) | Composer |
| --- | --- | --- |
| `CAPABILITY-CEILING.md` | 2026-08-29 00:08 | `eb1b952f` |
| `DESIGN-PRINCIPLES.md` | 2026-08-28 23:54 | `eb1b952f` |
| `NAVIGATION-REVIEW.md` | 2026-08-28 23:58 | `eb1b952f` |
| `README.md` | 2026-08-29 00:02 | `eb1b952f` |
| `app/_layout.tsx` | 2026-09-26 15:33 | `87fdd4cb` |
| `app/index.tsx` | 2026-08-28 23:30 | `eb1b952f` |
| `components/batch-native-stack.tsx` | 2026-08-24 01:16 | `fc522096` |
| `components/batch-tx-prototype.tsx` | 2026-08-24 00:27 | `fc522096` |
| `components/budgets-view.tsx` | 2026-08-28 23:58 | `eb1b952f` |
| `components/capital-flow.tsx` | 2026-08-24 00:18 | `fc522096` |
| `components/create-tx-prototype.tsx` | 2026-08-24 01:40 | `fc522096` |
| `components/drafts-inbox.tsx` | 2026-08-24 01:38 | `fc522096` |
| `components/first-time-setup.tsx` | 2026-08-23 21:09 | `fc522096` |
| `components/home-sheets.tsx` | 2026-08-23 21:10 | `fc522096` |
| `components/level-1-door.tsx` | 2026-08-23 08:03 | `5d0e79cc` |
| `components/plans-budget-data.ts` | 2026-08-28 23:54 | `eb1b952f` |
| `components/plans-budget-flows.tsx` | 2026-08-28 23:58 | `eb1b952f` |
| `components/prototype-switcher.tsx` | 2026-08-23 21:09 | `fc522096` |
| `components/segment-toggle.tsx` | 2026-08-24 01:37 | `fc522096` |
| `components/tx-history-data.ts` | 2026-08-23 21:09 | `fc522096` |
| `components/tx-history.tsx` | 2026-08-24 00:18 | `fc522096` |
| `components/variant-e-workflow.tsx` | 2026-08-28 23:30 | `eb1b952f` |
| `evidence/README.md` | 2026-08-23 01:23 | `9063d322` |
| `notes.md` | 2026-08-23 01:23 | `9063d322` |
| `scripts/capture-sen7-evidence.mjs` | 2026-08-23 01:23 | `9063d322` |

## Adjustments
- `components/drafts-inbox.tsx` replays six later edits from a Claude Code session dated 2026-08-24 03:14–03:19Z, made after Cursor's last snapshot. Each replayed script asserts the text it replaces.
- `app/_layout.tsx` is the 2026-09-26 version. It adds `GestureHandlerRootView` and an optional Convex provider that stays inactive unless `EXPO_PUBLIC_CONVEX_URL` is set. `.env.local` was not restored.
- `package.json` adds `@gorhom/bottom-sheet` and `convex` at the versions installed in the original `node_modules`.
- `app/workflow.tsx`, `app/notification-intake/[variant].tsx` and `components/notification-intake-prototype.tsx` were removed. They were already gone by Aug 23, and `drafts-inbox.tsx` replaced them.
- `components/batch-tx-prototype.tsx` is an orphan: nothing imports it. It does not typecheck against the final `create-tx-prototype.tsx`. Variant D, `batch-native-stack.tsx`, replaced it.

`tsc` passes apart from that orphan file. `expo export --platform android` bundles.
