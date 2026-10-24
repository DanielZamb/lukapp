# D4 notes: XXXL proposal for every other screen

Design only. No app code changes, no commits and no devices. D4 applies the round-2 decisions from D3 (`reports/xxl-2026-10-24/D3/notes.md`) to every screen and flow D3 didn't cover.

- **Page:** `design/xxl-flows/index.html` (1.1 MB, self-contained).
  - Rebuild both D3 and D4 with `python3 design/xxl-visual/build.py`.
  - The page reuses the D3 engine and phone CSS: `design/xxl-visual/src/engine.js`, `app.css` and `screens.js`. D4's own files are `flows.js` (the steps) and `flows.html` (the page).
- **Screenshots:** `reports/xxl-2026-10-24/D4/`.
  - `NN-<flow>-2.0-light.png` and `-dark.png`: every step of a flow, side by side, at fontScale 2.0.
  - `00-page-top.png` and the `99-*.png` page sections.
- **Audit (round 2):** `audit.json` covers 124 frames: 55 steps in light and dark at 2.0, plus the first step of each of the 14 flows at 1.3. Every check found 0 problems: overflow, clipping, truncation without a full label, groups over two, small targets, contrast, hero and the new missing-icon check. The missing-icon check caught one real bug, `alert-circle` was never vendored, which is now fixed. 31 one-line statuses are cut, each with its full text in the row's label.
- **Sources read:** every route in `apps/mobile/app/` and the feature screens they use:
  - drafts, intake, attention, plans and budget;
  - recovery, month close, places, settings and account;
  - categories, setup, level door, device admission and local auth;
  - history filters and reversal, plus the pickers.
- **Real-phone captures:** D2 has them for Drafts (empty), Budget (empty) and Settings, and those three appear as "Today". No other D4 screen has a capture.

## Round 3

- **Nav eyebrows:** the grey uppercase label above a screen title now uses an `eyebrow` style (12 sp, capped at 1.3, slight tracking), so it stays clearly smaller than the title. At 2.0 it's about 15.6 dp against a 40 dp title, and it no longer wraps. This applies to both pages, including Home's "THIS MONTH". Content labels such as "MONEY OUT" are unchanged.
- **Sort and filter, one at a time (chosen):** History shows the four filters as rows (Sort, Places, Categories, Dates), each with its current value, and each opens its own sheet of full-width options. Proposals A and C are removed. D3's History uses the same rows; at 2.0 it's now 19.77 screen-heights (today 22.5).
- **Audit:** 122 frames, all checks at 0, including icons.
- **Comments:** all 28 threads are addressed. They can't be resolved from here because none were sent to Claude; resolve them in the artifact view.

## Round 2: the user's 28 comments

All 28 threads are still open on the page. None were sent to Claude, so I couldn't reply on them. The page's "Your comments" section maps each one to its change.

**New rules**
- **Status lines:** short facts under a row or heading (spent of limit, place type, listener state, a recovery percentage, a checklist state) use a new `status` style. It's 14 sp capped at 1.3, so it reads at 2.0 as it does at 1.3, and it stays on one line. In rows, the full text is in the screen-reader label and on the next screen. Prose (explanations, legal copy) keeps body or meta and stays uncapped.
- **Space, not cards:** a tinted card only where a number is entered or decided (Post, Budget's "Stay under", Move money, the History and Overview totals). Elsewhere the main number sits on the page, set apart by space. No decorative pills: Limit is on, A second place and Posted use emoji, name and amount.
- **Options:** full width, one per row, 60 dp, with a tick on the chosen one. Used for suggested limits (three now, since the one below what's already spent is dropped), new limit, place types, dates and sort.
- **Context in the island:** June's spending while setting a limit, and the live category look while editing, sit in T8's camera island. A docked-pill frame shows phones without a centred cutout.

**Long text, from research**
- Front-load the key message and write in small chunks. Avoid walls of text and put the rest behind a disclosure ([Intuit content design, mobile](https://contentdesign.intuit.com/product-and-ui/mobile/); [writing small](https://contentdesign.intuit.com/style/writing-small/)).
- Apple's larger-text criteria prefer wrapping, but accept one- or two-line truncation in lists when the full text is available in another view ([App Store Connect, Larger Text evaluation criteria](https://developer-mdn.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria)).
- Applied to Discarded and the intake disclosure: three short facts, then "Read the full disclosure".

**Notification intake, rebuilt from the APK screenshots (Android)**

The APK screen is one long scroll: disclosure paragraphs, acknowledgement, error line, beta diagnostics, status rows, settings buttons, configured sources, the app and account picker, the inbox link, and Disable and wipe. The proposal splits it by task:
1. **Before you turn it on:** three facts (only apps you choose; encrypted on this phone for 15 days; can miss or delay alerts), the beta note (original text kept encrypted for 24 hours, never uploaded), "Read the full disclosure", and the acknowledgement.
2. **The hub,** in the real state: access granted, listener connected, no apps, and the error line.
   - It leads with "Not reading any app yet", then Apps you read from and This phone (access, listener, last check, Refresh, Android settings).
   - Then the inbox and beta diagnostics rows, with Turn off and wipe last. Add an app is pinned.
3. **Add an app:** likely bank apps first among the 220 on the phone.
4. **Where its alerts go:** choose the place.
5. **Reading Nu:** the working state.
6. **Turn off and wipe:** three facts, then the red action.

The APK shows the internal workspace ID ("Current workspace Personal · jx75…"). The proposal never shows it: "Personal · COP · Bogotá". iOS isn't drawn because I have no iOS screens.

**New proposals**
- **History sort and filter:**
  - A: one sheet with every filter.
  - B: one filter at a time. The four filters are rows on History, and each opens its own sheet.
  - C: a page where each filter opens in place.
- **Reverse entry:** two rows (Barbero stays −$80.000; a reversal is added +$80.000) and the net effect, $0.
- **Device access unavailable:** a centred red moment, "This phone lost access", two numbered steps, Sign out pinned.
- **Splash:** a proposal only. It keeps the chosen splash's halo, stroked wordmark and "Unlocking Lukapp…" status. Setup and the lock screen are approved as is.

**Measured effect at 2.0 (HTML estimates)**

| Step | Round 1 | Round 2 |
| --- | ---: | ---: |
| Candidates | 3.29 | 2.37 |
| Review complete | 1.36 | 1.12 (today 1.17) |
| Budget board | 2.49 | 2.03 |
| Month close review | 2.34 | 1.82 |
| Plan the recovery | 3.12 | 2.74 |
| Places | 2.11 | 1.98 |

**Decisions for the user (round 2)**
1. **Status text capped at 1.3:** this relaxes "body text is never capped" for short status facts only.
2. **D3 rows:** apply the new status style to D3's History, Batch and Overview rows, so both pages match?
3. **Filters:** decided in round 3, one at a time.
4. **This phone lost access:** Sign out leads, with Check again secondary.
5. **iOS intake:** send the iOS screens.
6. **Still open from round 1:** Now/Later tabs; Discarded inside intake; budget categories sorted by spending; Places' history shortcut inside the place.

## Round 1

## Rules carried from D3 round 2

- **Rows:** emoji and category first, then the money on its own line, then a grey description of at most two lines. The full text goes in the TalkBack label.
- **Headings:** fit one line. Facts put the label above the value. At most two items per card.
- **Actions:** the main action is pinned at the bottom in an ActionBar. Tall forms become pages; pickers and short decisions stay sheets (ADR-0090).
- **Money colour:** main amounts follow the hero rule with the currency above. Money in is green, over a limit is red, due is amber, and violet is for brand and actions.
- **New: one chip rule.** A selected chip shows a 2 dp primary border, a tint and bold text, with no check icon. At 2.0 the icon pushed "Transfer" and "Checking" to break mid-word. D3's Post chips are updated to match, and D3 still passes its audit (30 frames).

## Flows (46 steps)

| Flow | Steps | What changes at XXXL |
| --- | --- | --- |
| Drafts and notification intake | Candidates, Review complete, Sources, Before you use intake, Discarded, Records added, Month Close warning | The ready total leads at hero size, and "Confirm 3 ready" is pinned. The pulsing warning icon becomes an amber card. Now/Later tabs with counts. Candidates use the History row with a status badge. Sources shows the listener's health with a badge, the privacy promises as facts, and Discarded management. |
| Alerts | Alerts, Nothing crossed a line | Over the limit, then Close to the limit. Each alert is a budget row: the amount over in red, a jar, then spent-of-limit in grey. |
| Plans | Plans | Two destination rows with icon tiles, as on Home. |
| Budgets | Board, No limits yet, Choose a category, Set the limit, Edit a limit, Budget would cross, Limit is on | The 2-column jar grid becomes one column of budget rows. The next action and "Set another limit" are pinned. Composing uses a focused amount card with a live jar and suggested limits, two per row. Edit becomes a page. "Would cross" stays a sheet. |
| Savings recovery | Plans, Expenses to recover, Plan the recovery, Active plan, Move money, Moved | Each step leads with its amount: saved back is green with a progress jar, due is amber. Months are radio rows, two per card. Destinations are place rows. The action is pinned on every step. |
| Month close | Review, Confirm, June is complete | June spending at hero size. Four checklist rows with badges (Done, Warns, Reviewed, amount due). Lock is pinned. Confirm is a sheet, and the closed state is a centred moment. |
| Places | Places, A place, Add a place, Pick a look, A second place | Places opens on Home's brand band with the real total. Place rows show emoji, name, balance and type, with debt in red; then View all 6. Add is a page with type chips. The emoji picker stays a sheet. |
| Settings | User and workspace | Appearance uses the segmented control. My finances and Categories become destination rows; Categories shows a count. Sign out is red-tinted and separated, and the lockup closes the page. |
| Categories | Manager, Edit, Picker in Post | Categories are grouped by direction under a search. Edit is a page with a live look chip, emoji grid, colour swatches, the direction question and Delete. The picker stays a sheet with checkboxes and a Primary label. |
| Setup and first run | Splash, Where does your money go?, You're set | The splash keeps the violet look and scales the promise. Setup becomes a page: category checkbox rows with emoji, starting amount, currency chips, alerts choice. Start tracking is pinned. |
| Access and devices | Locked, Name this device, Another phone uses Lukapp, Device access unavailable | One heading, one fact group and a pinned action each. Both phones are shown as facts before the move. |
| Pieces of the D3 screens | History filters, Reverse entry, Post a transfer, Posted | Filters as a sheet with radio and checkbox rows. Reverse as a red-tinted confirmation sheet. Transfer with From and To as labelled place tiles. Posted as a centred moment with the category chip. |

## Measurements (HTML estimates at 2.0)

Most single-purpose screens fit one screen. The longer ones are:

| Step | Screen-heights |
| --- | ---: |
| Candidates (populated) | 3.29 |
| Plan the recovery | 3.12 |
| Where does your money go? | 3.08 |
| Budget board | 2.49 |
| Active plan | 2.36 |
| Month close review | 2.34 |
| Edit a category | 2.33 |
| A place | 2.29 |
| History filters | 2.28 |

Their main action is always pinned, so it never sits below the fold. The three screens with real captures:

| Screen | Today | D4 |
| --- | ---: | ---: |
| Drafts, empty | 1.17 | 1.36 (adds Sources) |
| Budget, empty | 1.00 | 1.00 |
| Settings | 1.58 | 1.36 |

## New primitives for T0 (on top of D3's list)

| Primitive | Props | XXXL behaviour |
| --- | --- | --- |
| `StatusBadge` (from D3) | `tone, icon, label` | Candidate state, month-close checks, listener health. |
| `NoteCard` | `tone: "warning" \| "danger" \| "neutral", icon, title, body, onPress?` | A titled card that replaces pulsing icons and loose warning paragraphs. |
| `BudgetRow` | `category, limitMinorUnits, consumptionMinorUnits, onPress` | Label, then left/over (red when over), a 14 dp jar in the category colour, then "spent of limit". The default tier keeps the jar grid. |
| `ProgressJar` | `value, color, over?, size: 14 \| 22` | Shared by budgets and recovery. Decorative next to its amount. |
| `ChoiceRow` | `label, detail?, selected, kind: "radio" \| "checkbox", leading?` | 72 dp rows, two per card. |
| `CenteredMoment` | `icon, tone, title, body?, chip?, amount?` | Confirmations and level doors. Actions go in the ActionBar. |
| `SheetHeader` | `title, eyebrow?, onClose` | A 56 dp title row with a 56 dp close button. |
| `EmojiGrid` / `SwatchGrid` | `options, value, onChange, columns: 4` | 56–60 dp targets. They're pickers, so the two-per-group rule doesn't apply. |
| `LookChip` | `emoji, color, label` | A live preview and a reward chip. |

## Decisions for the user

1. **Candidates tabs:** "Needs you now" and "Can wait" don't fit side by side at 2.0. They become Now and Later with counts; the section heading keeps "Needs you now".
2. **Sources owns Discarded.** Discarded notifications move from a button on Candidates into the Sources page, next to the listener's health.
3. **Reconciliation warning:** the pulsing icon becomes an amber card that stays until it's read once.
4. **Budget edit becomes a page** at XXXL. "Would cross" and Month Close's confirmation stay sheets.
5. **Choosing a budget category** sorts by last month's spending, with search first.
6. **Places:** the per-row history button moves into the place's page. Places shows two pairs, then View all 6.
7. **Settings:** Categories shows a count, and Sign out is red-tinted.
8. **Copy:** "Set a October limit" becomes "Set an October limit". Long explanations are shortened, with the meaning kept.
9. **One chip rule** (above), including D3's Post chips.

## Example data

Real where the captures have it:
- Ernesto, Personal · COP, and the 6 places (4 named: Nu cajita, Davivienda FIC, Cash wallet, BDB credit card);
- the 33 categories and the balance COP 56.526.163,06;
- the 53 movements;
- the empty Drafts, Budget and Settings states.

Examples elsewhere, all built from the captured movements:
- notification candidates shaped like bank pushes;
- June limits on real June spending;
- a recovery plan for the largest June expense (Grace, COP 440.000, 4 months);
- per-place balances that add up to the real total;
- the device names.

## Open checks

- Native verification on the S21 FE is owed for every flow:
  - non-linear text;
  - ActionBars above the IME, on Budget compose, Move money and Setup;
  - sheets at XXXL heights;
  - TalkBack reading of the shortened descriptions and badges.
- These are HTML estimates, not device results. Default-tier baselines must stay identical when T0 implements the primitives.
- The Post money button on Home at the default text size is a separate ticket (draft in `D3/notes.md`).

## Hand-in (relay to the coordinator)

> D4 is ready: `design/xxl-flows/index.html` (build: `python3 design/xxl-visual/build.py`), covering every screen D3 didn't, in 12 flows and 46 steps at 2.0 light/dark and 1.3. Screenshots: `reports/xxl-2026-10-24/D4/01-intake-2.0-light.png`, `04-budget-2.0-light.png`, `05-recovery-2.0-light.png`, `07-places-2.0-light.png`. The audit passes on 104 frames.
> - Same rules as D3 round 2: category → money → grey two-line description; pinned main actions; pages for tall forms and sheets for pickers; green in, red over, amber due.
> - New primitives: NoteCard, BudgetRow, ProgressJar, ChoiceRow, CenteredMoment, SheetHeader, EmojiGrid/SwatchGrid, LookChip.
> - One chip rule, D3 included: selection is a border and tint, with no check icon.
> - The user needs to confirm the 9 decisions in `notes.md`. Native verification is still owed.
