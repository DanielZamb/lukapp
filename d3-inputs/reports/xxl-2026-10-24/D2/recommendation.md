# D2 recommendation

Use tighter rhythm as the shared XXXL foundation, bounded previews on Home and Overview, and a pinned action for Post and its batch editor. Keep full History available on its own page, with a compact summary disclosure and date context. Keep the default tier unchanged.

## Why this combination

The physical 2.0 pass measured History at 22.50 screen-heights for 53 loaded movements, Overview List at 7.66, and Post with its keyboard at 3.59 total, of which 2.83 is reachable. The Post action remains covered at the scroll endpoint. The [audit](audit.md) retains the measurements, source/build and first-screen evidence.

Spacing cannot solve each of these problems by itself. Home's empty Drafts tile takes 148 dp. Settings loses 118 dp of its 288 dp content width to padding, icons, gaps and the chevron. Those are spacing and row-layout costs. History's full descriptions and repeated metadata are content costs. The action covered by the IME is a screen-structure problem.

[Proximity](https://lawsofux.com/law-of-proximity/) supports a shorter heading-to-content gap than the distance between subjects. [Common Region](https://lawsofux.com/law-of-common-region/) and [Chunking](https://lawsofux.com/chunking/) support meaningful date and task groups. [Hick](https://lawsofux.com/hicks-law/) supports disclosing alternate entry types while keeping the current type visible. [Fitts](https://lawsofux.com/fittss-law/) supports a stable, reachable action. These are reasons to test the proposals, not proof of improvement.

## The three directions

The self-contained [exploration page](/Users/zambamon/Work/finance-tracker-v2/design/xxl-density/index.html) contains before/after views of Home, History and Post for A, B and C. Before images are the physical 1.5 captures. The after side supports 1.3, 1.5 and 2.0, dark/light, scroll, disclosure, search and a simulated keyboard.

The values below are measured HTML geometry at 1.5. They are estimates of a design direction, not native implementation results. Native and browser typography differ. Direction B initially exposes four of the same 53 movements, so its shorter initial page is not a reduction in the amount of history available.

| Direction | Home | History initial | Post, keyboard closed | Cost |
| --- | ---: | ---: | ---: | --- |
| A, rhythm only | 1.36 screens | 27.54 screens | 2.06 screens | Full information, approved type and pair grouping can be longer than today's partially migrated screens. |
| B, rhythm and disclosure | About 1.13 screens | About 2.16 screens | About 1.72 screens | Extra taps to inspect old dates and secondary facts. Full expansion is much longer. |
| C, disclosure and structure | About 1.14 screens with pinned action | About 17.20 screens | About 1.84 screens with pinned action | The action bar reduces reading space. Date headings and keyboard focus need native testing. |

B's numbers can change slightly as date disclosures open. The live page measures its current state. C is a cumulative disclosure-and-structure direction, not an isolated structure experiment. Its initial History length includes all 53 movements, six visible transfer contexts and 47 closed metadata disclosures. Fully expanding B at 1.5 measures 32.80 screens. Its shorter initial view does not represent a reduction in total information.

C's closed-keyboard Post is a little longer than B because the footer reserves space. That is an acceptable tradeoff if the real IME check proves the action is reachable. A shorter screenshot is not the goal by itself.

## Proposed XXXL spacing tokens

These are proposed values for T0. They apply only when `tier === "xxxl"`. Keep every default and reflow value as it is. Existing type caps remain as approved. Body, meta and label text keep their uncapped scaling.

| Name | Value in dp | Relationship |
| --- | ---: | --- |
| `insideRow` | 8 | A label and its value, or the title and its money line. |
| `rowVertical` | 16 | Top and bottom padding inside a content row. Row height still grows with text. |
| `rowHorizontal` | 16 | Card edge to text, aligned to the page grid. |
| `betweenRows` | 0 | Hairline within a two-item card. |
| `headingToContent` | 12 | A section/date heading and the content it names. |
| `betweenGroups` | 24 | Separate cards belonging to the same subject. |
| `betweenSections` | 32 | Different tasks or subjects, with an explicit heading. |
| `pagePadding` | 16 | Left and right of the page. |
| `pageTop` | 12 | Content start below safe-area chrome. |
| `pageBottom` | 24 | End of normal content, plus actual safe inset if needed. |
| `footerVertical` | 12 | Action-bar padding above and below its control. |
| `footerHorizontal` | 16 | Action-bar alignment with the page. |

Keep touch targets at least 56 dp, primary controls at least 68, secondary controls 60 and inputs 64. These are minimums, not fixed heights that clip multi-line text. Keep money on its own line and labels above values. Every card contains at most two items.

Do not turn 24 or 32 into substitute semantics. A date heading, container or connecting border must explain which rows belong together. Two cards under one date need 24 dp between them, not another 32 dp section break. A heading needs only 12 dp to its first card.

## T0 follow-up contracts

Screens should supply content and relationships. The UI layer should choose spacing, grouping and the XXXL presentation. The following are proposed contracts, not added app code.

| Component/API | Proposed props | Owner behavior at XXXL |
| --- | --- | --- |
| `Stack` | `space: "related" \| "groups" \| "sections"`, `children` | Maps relationships to 8, 24 or 32 dp. Default behavior uses the exact existing layout. Avoid arbitrary per-screen gaps. |
| `Section` | `title`, `children`, optional `action: {label, onPress}` | Keeps title and content 12 dp apart. Gives the action its own 56 dp target without squeezing the heading. |
| `Group` refinement | Existing `title`, `children` | Preserve pair splitting. Separate title gap from the gap between cards. Do not put the heading into the same 24/40 dp gap sequence. |
| `PreviewGroup` | `title`, `items`, `renderItem`, `totalCount`, `previewGroups` default 2, `viewAllLabel`, `onViewAll` | Shows at most four items in two cards, with a full-width View all target. Total count describes the actual scope, including whether only a page is loaded. |
| `DisclosureSection` | `title`, `summary`, `expanded`, `onExpandedChange`, `children` | Uses a 56 dp trigger, announces expanded state and keeps a visible summary. Does not hide validation errors, pending retry state or required warnings. |
| `DateSection` | `dateLabel`, `children`, optional `sticky` | Presents one date heading over paired cards. Sticky headings stay inside the owning list, clear of native close/status chrome. |
| `ActionBar` | `primary: {label, onPress, disabled, pending}`, optional `secondary`, optional `status` | Pins above the actual keyboard and safe inset. Reserves its measured height in the scroller. Preserves disabled/pending/retry behavior. |
| `ValueRow` layout refinement | Existing content props, optional semantic `valueKind: "money" \| "text"` if T0 needs it | Keeps values below labels. Optional decorations cannot reduce the usable text column to 170 dp. Place an icon above the copy or omit a decorative chevron at XXXL through the shared layout. |
| `MoneyHero` explicit long-value presentation | Existing `currency`, `amount`, plus a reviewed named presentation such as `exact` | Displays the entire value at a known readable size. Never adds shrink-to-fit or changes precision without an explicit product decision. |

The `Stack` and `Section` default contract needs care. Adopting a generic component cannot change default pixels by accident. Use an explicit default-layout mapping or introduce the component only in callers whose old default layout it reproduces exactly. Do not put tier branching back into screens.

## E1, Home and Overview

1. Replace the empty Drafts promotion with a concise status disclosure. When work actually needs attention, show a truthful count and an explicit Review action.
2. Show Post money directly after the balance. Test the pinned Home alternative with the dad before adopting it everywhere. The balance itself may retain its action sheet, but it cannot be the only discoverable route to posting.
3. Keep the six-place context near the balance. Put Overview and Plans in a two-item destination group. Keep long category and account lists on their own pages.
4. In Overview, compress Net/Out/In into a labelled summary disclosure or summary section. Keep the selected month and total visible. Do not use the primary visual treatment for navigating to History while displacing the page's own category content.
5. Show two category cards, then View all 33 categories for this captured dataset. Use the real count in implementation. Named bars still need a category label above money. Do not keep the current emoji-only bars as a density shortcut.
6. Resolve the exact-balance presentation with T0. At the specified hero size the observed amount is 322.24 dp wide, against a 288 dp content column. A currency line alone does not fix that.

## E2, Post and batch

1. Pin Post or Add to batch through `ActionBar` on the normal Post page and batch editor, as well as tall sheets. Verify it above the physical Samsung keyboard, not only in HTML.
2. Use a labelled 64 dp amount field with a currency addon. Keep Description uncapped and allow it to grow. A long description must not push the action behind the keyboard.
3. Show the current entry type. Disclose alternate types in a familiar control, without changing what the type means. Preserve category direction, transfer From/To confirmation, initial-balance restrictions and the exact submitted intent.
4. Keep Place, Category and Date in one named Entry details section. Split cards in pairs as required, but use the 24 dp card gap and a single heading to preserve their relationship.
5. Keep batch count and net above its entry preview. Show two cards initially, then an explicit full-batch view. Never hide failed or pending entries under an unlabelled summary.
6. Replace the empty batch's repeated paragraphs with one short explanation and Add one. Retain the meaning that entries remain on the device until posted.
7. Native acceptance still owes posting, validation, retry, pending payload preservation, partial batch recovery and keyboard dismissal. This audit sends no financial mutation.

## E6, Drafts and Settings

1. Give the Drafts heading full width. Move Sources below the main task or into a separate 56 dp action after the summary. An uncapped eyebrow must not break into fragments just to preserve a secondary header action.
2. Keep Ready count, amount and the applicable confirmation action together. Use two candidate cards per group. After two groups, offer a full candidate list with counts for Needs you now and Can wait.
3. In the empty state, say Nothing waiting once. Keep Continue to Month Close near that status. Move the longer explanation to a disclosure while preserving the meaning that local candidates do not block close.
4. In Settings, use concise destination descriptions or counts rather than three category names in a 170 dp column. Show the actual catalog on Categories. Preserve the real user's title and workspace context.
5. Keep destructive actions distinguishable and placed after navigation. A shorter Settings page must not make Sign out easier to hit accidentally.
6. Use the same relationship spacing for Places, recovery and month close when those screens adopt the system. They are not covered by this D2 native matrix and remain E6 checks.

## Other screen owners

E3 should apply the date-group and summary/disclosure directions to History, then turn Entry details into vertically labelled facts with a clearly separated correction action. Preserve transfer perspectives and journal identity.

E4 should test populated Budget and its editor. The empty Budget page already exposes its primary action immediately. E5 should remove Category look's repeated name and unexplained 132 dp tail, then keep limit context before the recent-activity preview. D2 does not authorize edits in either epic.

## Verification before implementation acceptance

Repeat the complete matrix against the real Convex development deployment and retained or fresh real Clerk admission. Record the backend's deployed source, not just the Metro SHA. Exercise the implemented native action bar with the actual IME, both compose modes, long input, validation, errors and pending retry.

Compare default-tier light/dark screenshots against their baseline. Verify two items per group, money on its own line, labels above values, target minimums and no clipped text. Then ask the dad to find an older expense, record one expense, review a candidate and change Appearance without guidance. Record errors and first choices. HTML lengths and law-based predictions are not those task results.
