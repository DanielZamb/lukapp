# D3 notes: XXXL visual pass

Design only. No app code changes and no commits. No devices were used; "Today" is D2's real S21 FE captures.

## Round 3 (from D4)

- Nav eyebrows are capped at 1.3, so they stay smaller than the screen title.
- History's single "Sort and filter" button becomes four filter rows (Sort, Places, Categories, Dates), each opening its own sheet. History at 2.0: 19.77 screen-heights (today 22.5).

## Round 2 (chosen direction)

The user chose round 2 as the direction.

**Settled by the user**
- Money in is positive green at XXXL.
- Keep the curled-L watermark in the Home band.
- Keep the copy, including "Set a limit".
- Keep the category colours.
- **Post money on Home is pinned at the bottom** in an ActionBar.
- The default-tier Post money fix is a separate ticket (draft below).
- Descriptions in rows are shortened to two lines.
- The place shows under the date heading when the whole day shares it, otherwise at the start of each row's grey line.

**Changed for this round**
- **Rows:** wrapped free text felt crowded. Every list row now follows the same order:
  1. a short, stable label: the category with its emoji tile, or "Transfer", or the date on Category look, where every row shares the category;
  2. the money on its own line;
  3. the description in muted meta type, at most two lines.

  The full description stays in the row's TalkBack label and one tap away in Entry details. `audit()` fails any shortened description whose full text is missing from the label. This applies to History, Batch, Overview (label, money, share bar) and Category look recents.
- **Date headings:** the date and the day's net share one line ("June 9 … −$374K"). The movement count is gone. The place appears under the date only when the whole day shares it; on mixed days, each row's grey line starts with its place. Batch moves its shared place to the section heading ("From Nu cajita").
- **Wrapping notes cut:**
  - History's "Totals cover the 53 loaded movements." is removed; the "53 of 53 loaded" line remains.
  - Batch's "Held on this device. Nothing is posted yet." becomes "Not posted yet".
  - Category look's "· no limit yet" is removed, because the Set a limit button says it.
- **Posting from Home:** tapping the balance isn't discoverable in either tier. Home now pins **Post money** in an ActionBar: 68 dp, primary, going straight to Post. Tapping the balance keeps opening "What do you want to do?" for Create a place. Post money is the screen's one primary button, and the Drafts tile is the one solid content surface.
- **Two lines, chosen:** at 2.0, History is 19.3 screen-heights with two-line descriptions and 20.3 with full text (today 22.5). The page keeps a toggle to compare. This relaxes "nothing clipped" for the description only. The label and money are never cut.

### Ticket draft: Post money on Home, default tier

> **Goal:** make posting discoverable from Home at the default text size. Today it hides behind a tap on the balance.
> **Change:** pin a Post money action at the bottom of Home, matching the chosen XXXL ActionBar. Use the default `PrimaryButton` (56 dp) with the `add` icon, going straight to `/post`. The balance keeps opening "What do you want to do?".
> **Scope:** `apps/mobile/app/index.tsx` (Home) and the shared pinned-footer primitive from the XXXL work.
> **Acceptance:**
> - A new default-tier light/dark baseline for Home only. Every other default screen stays pixel-identical.
> - The posting flow is unchanged.
> - TalkBack reads "Post money, button".
> - Verified on the real Convex development deployment with real Clerk sign-in, per AGENTS.md.
> **Why separate:** the XXXL work promises the default tier stays identical, so this change needs its own baseline and review.

- **Page:** `design/xxl-visual/index.html` (3.7 MB, self-contained). Rebuild with `python3 design/xxl-visual/build.py`. Sources are in `design/xxl-visual/src/`, and fonts and icons are vendored in `design/xxl-visual/vendor/`.
- **Screenshots:** `reports/xxl-2026-10-24/D3/*.png`. Each is a row of Today, D3 light and D3 dark, at 1.3 and 2.0. `audit.json` holds the last `window.audit()` result.
- **Inputs studied:** the D3 brief, both skills, D2 `audit.md` and `recommendation.md`, `coordinator-comparison-grid.png`, all D2 captures and capture JSON, T0 `api.md` and screenshots, `xxxl-system.html`, `prototype.html`, `XXXL-DESIGN.md`, `connecting.html`, `tokens.ts`, `typography.ts` and the screen sources.

## How it was measured

- **Frames:** 320 dp wide, with the S21 FE's real geometry from the captures: 29 dp status bar, 616 dp scroll viewport, 48 dp nav bar and a 266 dp keyboard. The status bar, nav bar and keyboard are crops of the real captures; dark mode uses inverted crops.
- **Text sizing:** follows Android 14's non-linear font scaling, which the S21 FE uses. D2's capture geometry confirms it: today's 44 sp hero line is 52.1 dp at 2.0, and the AOSP curve gives 52.0. React Native's `maxFontSizeMultiplier` caps from `typography.ts` are applied the way `PixelUtil` applies them: linear by the cap whenever the system scale is larger.
- **Screen-heights:** scroll content ÷ visible scroll area, the same definition as D2's manifests. These are HTML estimates.

Round 2, with two-line descriptions:

| Screen | Today 1.3 | D3 1.3 | Today 2.0 | D3 2.0 |
| --- | ---: | ---: | ---: | ---: |
| Home (Post money pinned) | 1.08 | 1.59 | 1.26 | 1.86 |
| History (all 53) | 15.16 | 15.93 | 22.50 | 19.29 (20.26 full text) |
| Post, keyboard open | 2.95 (2.19 reachable) | 4.16 | 3.59 (2.83 reachable) | 4.89, Post always visible |
| Batch | 1.00 (empty) | 2.35 (3 drafts) | 1.36 (empty) | 2.63 (3 drafts) |
| Overview | 5.78 | 1.99 | 7.66 | 2.13 |
| Entry details | 1.00 (sheet) | 1.40 | 1.00 (sheet) | 1.56 |
| Category look | 1.04 (empty) | 1.69 | 1.16 (empty) | 2.04 |

- **Home balance at 2.0:** 45.8 dp on one line ("56.526.163,06" under "COP"). Today's balance renders at about 34.6 dp, fit-to-width with "COP" inline. The hero spec of 52.8 dp doesn't fit 288 dp, so the number shrinks just enough to fit, never below today's size.
- **`window.audit()`:** checks all 30 D3 frames (7 screens × 2 scales × light/dark, plus 2 island frames). It reports 0 overflow, 0 clipping, 0 groups over two items, 0 targets under 56/60/64/68, 0 AA contrast failures and 0 hero violations. Earlier runs caught a `box-sizing` overflow in batch rows, a 56 dp ghost button tagged as secondary, muted text at 4.45:1 on the Home band, and 4.43:1 on a category tint; all four are fixed.
- **Post content:** the Post-with-keyboard proposal shows the form filled with the first captured movement. Today's capture is the empty form, so the D3 length includes a filled description and a chosen category.

## Character checklist

**Home**
- Accent: two violets with two jobs. The pinned Post money is the one primary button, and the Drafts tile is the one solid content surface. The band is a quiet tint.
- Hierarchy: 1. the balance, 2. Post money (always in the same place), 3. Drafts, 4. Overview and Plans.
- Brand: lockup, THIS MONTH, bell and profile sit in a violet band. The dark band uses the splash night colour #21132f, with the curled-L watermark at 9% (16% dark).
- Life: "COP" in violet, a wallet chip for "Across 6 places", icon tiles on the destinations.
- Laws ([Von Restorff](https://lawsofux.com/von-restorff-effect/), [Jakob](https://lawsofux.com/jakobs-law/), [Common region](https://lawsofux.com/law-of-common-region/), [Aesthetic-usability](https://lawsofux.com/aesthetic-usability-effect/)): an accent works only when it's alone, the familiar header stays, and the band groups balance with places. Test whether posting is still found through the balance.

**History**
- Accent: the tinted Net card, and incoming money in positive green.
- Hierarchy: 1. Net −$3.1M, 2. Out and In, 3. date sections.
- Brand: the same tint as Home's band and Post's amount card.
- Life: each row leads with a 36 dp emoji tile in the category's colour and the category name, then the money on its own coloured line, then the description in grey (two lines). Transfers get swap tiles. Date headings are one line (date and day net), with the place under the date when the whole day shares it.
- Laws ([Selective attention](https://lawsofux.com/selective-attention/), [Chunking](https://lawsofux.com/chunking/), [Proximity](https://lawsofux.com/law-of-proximity/)): money comes before tools, and shared facts move up to the heading.

**Post (keyboard open)**
- Accent: a focused violet amount card with a caret, and a violet Post button pinned above the real keyboard.
- Hierarchy: 1. the amount at hero size, 2. Post, 3. type, description and details.
- Brand: One and Batch are a real segmented control again.
- Life: the entry-type chips stay visible, two per row, the selected one with a 2 dp border and tint; Place, Category and Date get tiles; a "Money out" line with an arrow.
- Laws ([Fitts](https://lawsofux.com/fittss-law/), [Hick](https://lawsofux.com/hicks-law/), [Jakob](https://lawsofux.com/jakobs-law/), [Peak-end](https://lawsofux.com/peak-end-rule/)).

**Batch**
- Accent: a count badge on the Batch tab, and "Post 3" pinned.
- Hierarchy: 1. the net at hero size in the same amount card as single Post, 2. the drafts, 3. Add one.
- Life: History-style rows (emoji and category, money with a 56 dp remove button, grey description), with the shared place on the section heading.
- Laws ([Goal-gradient](https://lawsofux.com/goal-gradient-effect/), [Zeigarnik](https://lawsofux.com/zeigarnik-effect/)).

**Overview**
- Accent: the Net card, and List selected in violet. "Go to tx history" drops from primary violet to secondary.
- Hierarchy: 1. Net and Out, 2. the top four categories, 3. View all 33.
- Life: emoji coins, share bars in each category's colour (the length carries the meaning), money on its own line.
- Laws ([Von Restorff](https://lawsofux.com/von-restorff-effect/), [Miller](https://lawsofux.com/millers-law/), [Chunking](https://lawsofux.com/chunking/)).
- Data: shown with June, summed from the 53 captured movements, because October is empty.

**Entry details**
- Becomes a page at XXXL.
- Accent: a green Posted badge, and Reverse entry in a danger tint set apart from Close details.
- Hierarchy: 1. −80.000 under COP, 2. Barbero, 3. labelled facts with tiles.
- Island: no sticky chrome at the top and both actions in the pinned footer, so the T8 camera island has room. The page includes a scrolled frame with the island shown.
- Laws ([Proximity](https://lawsofux.com/law-of-proximity/), [Fitts](https://lawsofux.com/fittss-law/), [Peak-end](https://lawsofux.com/peak-end-rule/)).

**Category look**
- Accent: the category's own colour tints the summary (6% in light keeps muted text at AA). Violet stays on the one primary action.
- Hierarchy: 1. COP 672.225, 2. its share of June's spending, 3. Recent: two date-led rows (date, money, grey description), then View all 6.
- Removes the repeated name chip and the unexplained 132 dp tail. Island frame included.
- Laws ([Common region](https://lawsofux.com/law-of-common-region/), [Selective attention](https://lawsofux.com/selective-attention/)).

## Primitive proposal for T0

Every primitive renders its XXXL treatment only when `tier === "xxxl"`. In the default and reflow tiers it returns today's component, so the default tier stays pixel-identical and `defaultTier.test.ts` is unchanged.

| Primitive | Props | XXXL behaviour |
| --- | --- | --- |
| `MoneyHero` long-value rule | `currency, amount, negative?, tone?, floor?` | Currency on its own line (label, primaryText). The number keeps the hero spec (44, cap 1.2). If it doesn't fit one line, it shrinks minimally to fit, never below `floor` (today's rendered size) and never to row-money size. If `floor` still overflows, it wraps at a group separator. |
| `BrandBand` | `children, watermark?` | Home only. A full-bleed tint (#f7f2fe light, #21132f dark) holding the lockup, bell, profile, balance and places chip. The curled-L watermark is decorative and hidden from screen readers. |
| `TintCard` | `tone: "brand" \| "category", color?, focused?` | Tint #f6f1fd with border #e6d9fa (dark #1b1328 / #36265a), 24 radius, 16 padding. Category tone mixes the category colour at 6% (10% dark). `focused` adds a 2 dp primary ring. |
| `FlowSummary` | `net, out, in, currency, scopeNote?` | Net in screen type, then Out and In as a two-item group with direction tiles; In uses the positive tone. Replaces both `CapitalFlow`s at XXXL. |
| `EmojiTile` / `IconTile` | `emoji, style, size: 36 \| 48 \| 64` / `icon, tone` | Category colour at 15% with a 32% border. Emoji at 16–22 sp, capped at 1.3, so it never outgrows the tile. The 36 dp size leads a row's label line. |
| `moneyTone` | `(minorUnits) → TextTone` | In is positive, out is default, over a limit is danger. The sign stays in the text. |
| `DateSection` | `date, net?, place?, children, sticky?` | One line: the date in section type and the day's net in muted money type (positive when in), wrapping only if it can't fit. `place` shows under the date when every row shares it. 12 dp to the first card, 24 dp between cards, 32 dp between dates. |
| `ListRow` XXXL anatomy | `label, leading (tile), money, description?, trailing?` | Label line (tile + short label), money on its own line, then the description in muted meta clamped to two lines. The full description goes into `accessibilityLabel`. History, Batch, Overview and Category look all use it. |
| Home `ActionBar` use | `primary: {label: "Post money", icon: "add", onPress}` | Home is the first non-form screen to use the pinned ActionBar. It reserves its height in the scroller. |
| `ChipSet` | `options, value, onChange, columns: 2` | Two 56 dp chips per row, with a wide option spanning the row. Selected is a tint, a 2 dp primary border and bold text, with no check icon (D4 chip rule: the icon made labels break at 2.0). |
| `Segmented` | `options {value, label, icon?, badge?}, value` | 56 dp segments. The selected one uses the background surface and primaryText. |
| `ActionBar` (D2) | `primary, secondary?, status?` | Pinned above the real keyboard and safe inset, 12/16 padding, primary 68 and secondary 60. |
| `DestinationRow` | `icon, title, detail` | The icon tile and chevron share the top line; title and detail run full width below. |
| `ShareBar` | `value, color` | An 8 dp track. Decorative; the money beside it is the readable value. |
| `StatusBadge` | `tone, icon, label` | Status only. |
| `PreviewGroup` (D2) | `items, totalCount, viewAllLabel` | Two pairs, then a counted View all. |

D2's spacing tokens are kept as they were: insideRow 8, rows 16/16, headingToContent 12, betweenGroups 24, betweenSections 32, page 16, pageBottom 24, footer 12/16. D3 adds two:
- `tileToCopy` 12, the gap between a tile and its text.
- A 4 dp gap between a heading and its meta line, because the date summary belongs to its heading.

## Decisions

All settled; see Round 2 above. Nothing is waiting on the user for the design itself.

## Hand-in (relay to the coordinator)

> D3 is done, and the user chose round 2: `design/xxl-visual/index.html` (build: `python3 design/xxl-visual/build.py`). Screenshots: `reports/xxl-2026-10-24/D3/01-home-2.0.png`, `02-history-2.0-dates.png`, `03-post-2.0.png`, `04-batch-2.0.png`.
> - Home: lockup, bell and profile in a violet band with the curled-L watermark. Balance at 45.8 dp under COP. Post money pinned at the bottom in an ActionBar. The violet Drafts tile stays.
> - History: tinted Net card, In in green. One-line date headings (date + day net). Rows are category + emoji, then money, then a grey two-line description. 19.3 screen-heights at 2.0 (today 22.5).
> - Post: a focused amount card at hero size, a real One/Batch segmented control, type chips two per row, Post pinned above the IME.
> - Batch: hero net, History-style rows, Post 3 and Add one pinned.
> - Overview: shared Net card, history link demoted to secondary, two pairs then View all 33 (2.13 at 2.0, today 7.66).
> - Entry details: a page with the hero amount, Posted badge, labelled facts and a pinned Reverse/Close footer, leaving room for the island.
> - Category look: tinted with the category's colour, hero total, date-led recents, pinned actions.
> - Primitives: MoneyHero long-value rule, BrandBand, TintCard, FlowSummary, Emoji/IconTile, moneyTone, DateSection, ListRow XXXL anatomy, ChipSet, Segmented, ActionBar, DestinationRow, ShareBar, StatusBadge, PreviewGroup, plus Home using ActionBar for Post money. Each one keeps the default tier identical.
> - The user decided: green for money in; keep the watermark, the copy and the colours; Post money pinned at the bottom; two-line descriptions; place on the date heading when the day shares it. The default-tier Post money fix is a separate ticket (draft in notes.md).

## Open checks

- Native verification on the S21 FE is still owed for:
  - non-linear text against these estimates;
  - the ActionBar above the IME;
  - the island on Entry details and Category look;
  - TalkBack.
- HTML lengths are design estimates, not device results. Default-tier screenshots must be compared with their baseline when T0 implements these primitives.
- D2's captures include a floating gear overlay (a dev tool). It isn't part of the app design.
