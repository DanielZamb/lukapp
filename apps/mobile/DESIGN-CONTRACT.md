# Expo UI design contract

This contract carries the selected SEN-6 design rules into the real UI core required by [SEN-31](https://linear.app/sennkai-labs/issue/SEN-31/freeze-the-first-cutover-prototype-as-the-ux-record), [SEN-37](https://linear.app/sennkai-labs/issue/SEN-37/wayfind-the-expo-ui-module-spec), and [SEN-33](https://linear.app/sennkai-labs/issue/SEN-33/stand-up-the-expo-ui-core). Navigation corrections and product levels live in [UX-CONTRACT.md](./UX-CONTRACT.md). The frozen prototype's stop line lives in [CAPABILITY-CEILING.md](./CAPABILITY-CEILING.md).

## Executable token API

[`src/theme/tokens.ts`](./src/theme/tokens.ts) is the sole real-app owner of colors, spacing, radius, font families, font sizes, and the minimum touch target. It ports the exact values and exports, with comments removed, from `8c1e2ea62db29398b23620a222be0ee23640d9d1:sen-6-mobile-workflow-prototype/theme/tokens.ts`, [original module](https://github.com/DanielZamb/lukapp/blob/8c1e2ea62db29398b23620a222be0ee23640d9d1/sen-6-mobile-workflow-prototype/theme/tokens.ts). The original source SHA-256 is `6d14115d75222eb80bf66b44160f2c85df183268c9d70e0b5d8bb9fa73bafc7f`. The cleaned module has different bytes because its comments were removed.

The module imports nothing and performs no I/O, framework setup, preference storage, or font loading. Its runtime exports are `themes`, `spacing`, `radius`, `font`, `fontSize`, and `touchTarget`. Its type exports are `Theme` and `ThemeMode`. `ThemeMode` is light or dark. `Theme` derives its keys from the light theme and accepts string color values so both themes can use it. The `as const` declarations preserve the frozen literal values and readonly typing; they add no runtime validation or freeze.

Consumers import the named exports directly, for example from `../theme/tokens` inside a component folder. Select `themes[themeMode]` at the real app's theme boundary and pass the resulting `Theme` to shared components. Do not duplicate literal token values in a component, make a second theme module, or import the frozen prototype at runtime.

The seven spacing values are xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, and section 36. Radius values are sm 10, md 16, lg 20, xl 24, and full 999. Font sizes are label 12, body 16, action 17, title 20, and hero 44. `touchTarget` is 48. Colors retain every light and dark value, including dark primary `#8b5cf6` and the translucent dark border. Do not recompute the colors from their historical OKLCH comments.

Font families remain `Geist_400Regular`, `Geist_500Medium`, `Geist_600SemiBold`, `Geist_700Bold`, and `Geist_800ExtraBold`. F02 owns loading these families in the real app's root before rendering text. Choose `font.regular`, `font.medium`, `font.semibold`, `font.bold`, or `font.extrabold` rather than a generic family plus weight. The recorded source loads them at `8c1e2ea62db29398b23620a222be0ee23640d9d1:sen-6-mobile-workflow-prototype/app/_layout.tsx`, [font loading reference](https://github.com/DanielZamb/lukapp/blob/8c1e2ea62db29398b23620a222be0ee23640d9d1/sen-6-mobile-workflow-prototype/app/_layout.tsx). F01 installs no font or runtime package.

## Screen and container rules

The exact principle source is `8c1e2ea62db29398b23620a222be0ee23640d9d1:sen-6-mobile-workflow-prototype/DESIGN-PRINCIPLES.md`, [principles](https://github.com/DanielZamb/lukapp/blob/8c1e2ea62db29398b23620a222be0ee23640d9d1/sen-6-mobile-workflow-prototype/DESIGN-PRINCIPLES.md). Apply these rules to each real screen:

- Name one immediate job and give it one visually dominant action. Keep required secondary actions available.
- Aim for five to eight meaningful groups on a normal decision screen. A header, hero value, disclosure, tile, list group, or primary action counts as a perceived group. Supporting labels are part of that group. Split excess decisions into steps.
- Each principal component carries one to three information elements. Keep only what supports the immediate decision and open detail for additional facts. The Candidate row is description, supporting fact, amount.
- Keep related facts close. Separate decisions by at least `spacing.xl`, 20 points, and major screen zones by `spacing.section`, 36 points. Use the 4-point scale throughout.
- Make interactive targets at least 48 points high. Give icon-only controls accessible labels and sufficient actual bounds plus expanded hit areas. A tiny icon inside a large noninteractive container does not meet the rule.
- Reveal secondary explanations on demand. Where a pace view is available, its legend appears on press. Required actions, including Month Close when available, stay discoverable.
- End consequential actions with calm feedback that says what changed and what happens next. Reuse confirmation content; apply the posting-specific banner and Local Entry Draft confirmation distinction in the UX contract.

The exact container and recent-count source is `8c1e2ea62db29398b23620a222be0ee23640d9d1:sen-6-mobile-workflow-prototype/NAVIGATION-REVIEW.md`, [review](https://github.com/DanielZamb/lukapp/blob/8c1e2ea62db29398b23620a222be0ee23640d9d1/sen-6-mobile-workflow-prototype/NAVIGATION-REVIEW.md). A card needs a boundary that explains interaction, state, or a meaningful content unit. Passive balances on Overview and Financial Account detail have no outer card. Appearance is an open section. Nested cards need an actual interaction or state reason. Spacing and type hierarchy can establish a relationship without a border.

Overview shows four recent entries; Financial Account detail shows at most three. [SEN-44](https://linear.app/sennkai-labs/issue/SEN-44/specify-the-posted-activity-module), resolution `81b965a2-724f-4b41-9585-d4aa8c3120c1` of 2026-09-30, adds history pages of 50 postings and one paginated query per list. Its basic row has title, supporting date/category or To/From account, and signed amount. A reversed original appears once with Reversed; hide the reversal row from that list and keep all ledger effects in balances.

## Shared components and ownership

The shared set is `Header`, `ListRow`, `ListGroup`, `PrimaryButton`, `SecondaryButton`, `Choice`, `ActionTile`, `ProgressBar`, and `ConfirmationScreen`. F02 implements them once in the real UI core with this token module. A destination adds a component only when none fits its job. Notification Intake reuses the shared header, buttons, choices, and grouping; its Candidate row stays in its own module.

Authority: [SEN-39](https://linear.app/sennkai-labs/issue/SEN-39/decide-the-expo-stores-and-shared-primitives), resolution `1a1e5754-2528-48b0-ad6a-2e18e64451c2` of 2026-09-30. It replaces earlier sheet, compose, and jar proposals with the nine named components and extracts one confirmation component from the four prototype confirmations. Real sheet and Budget Board behavior may use those components without inventing global stores or competing posting forms.

The source workflow's local component implementations establish shape, not the production interface. F02 owns accessible interaction, layout, pressed/disabled states, and reusable props. The token module remains pure. Theme preference, font loading, router state, encrypted input, queries, and posting adapters belong to their real owners outside it.

## Copy and unresolved implementation choices

Basic copy uses Draft, Post, Account, Move money, and Complete month. Liability amounts say owed. Advanced accounting provenance opens deliberately; basic views do not expose Journal Entries, Ledger Accounts, debits, credits, account codes, period locks, or Posting Authority as routine labels. Recovery replenishes an expense through saving; it does not undo that expense or create money owed to oneself.

The sheet package in the throwaway app is not a production selection. [SEN-22](https://linear.app/sennkai-labs/issue/SEN-22), comment `3859c551-c9f4-4857-98d4-7d27bd4a2245` of 2026-08-23, explicitly requires reevaluating it for the real app. Preserve keyboard handling, backdrop dismiss, drag handle, and close behavior; choose the mechanism against the actual installed runtime. This port makes no new external API assumption.

The source notes at `8c1e2ea62db29398b23620a222be0ee23640d9d1:sen-6-mobile-workflow-prototype/notes.md`, [notes](https://github.com/DanielZamb/lukapp/blob/8c1e2ea62db29398b23620a222be0ee23640d9d1/sen-6-mobile-workflow-prototype/notes.md), explain route placement, prototype switchers, and actual press bounds. Reusable components belong outside the router's route directory. Prototype variant switches are historical evidence. Future preference experiments belong in a dev-only lab in the real app and leave settled product layout intact.

## Verification and F02 proof

F01 executed both pure modules through the installed Node/TypeScript path and compared all runtime export values. It also checked the new module with strict standalone TypeScript and checked whitespace with `git diff --check`. No literal-mirroring permanent test is added. Source and command receipts are supplementary local evidence; this document and the durable issue/git references remain readable without the run directory.

F02 must import this module into actual shared components, load all Geist weights, and verify light/dark rendering, meaningful grouping, 48-point targets, keyboard and sheet behavior, confirmation states, and the settled navigation in the runnable app. Source equivalence is not live UI, simulator, native-service, physical-device, or cutover proof.
