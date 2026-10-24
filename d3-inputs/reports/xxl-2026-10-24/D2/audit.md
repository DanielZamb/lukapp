# D2 spacing and density audit

History and Overview need shorter initial content, while Post needs an action that survives the keyboard. Tightening gaps helps, but cannot make every loaded transaction fit into a short page.

## Evidence and scope

This is design and audit work. App code is unchanged. Native observations use source `f775d9a7dc6233c82a657f7ed8d49817399e8be4`, the physical Samsung S21 FE `R5CRC1BC1FA`, density 540 over physical 480, and a 320 dp window. The configured provider is `https://compassionate-opossum-63.convex.cloud`. The retained real Clerk session reached ordinary authenticated app screens. No synthetic identity, token, financial post, data reset, biometric bypass, or deployment was used. Fresh sign-in and current deployed backend SHA are not established by this audit. See [receipt](receipt.md).

The dataset is the dad's retained development session: six places, 33 categories, 53 loaded History movements, no waiting drafts, no current budget jars and no current-month activity in Arriendo. Populated Drafts, populated Budget, category activity and a nonempty batch are open state-coverage checks. Empty-state results must not be applied to populated screens.

Full captures live under `captures/<screen>-<scale>/full.png`. Each folder retains original step PNGs, native accessibility JSON, and `manifest.json`. A full capture covers the current loaded page through its footer, not all pages behind Load more. The dev client's floating Tools gear is an overlay and is excluded from app-design findings.

## Scroll measurements

Each number is total observed extent divided by the visible scrolling viewport. A value of 1.00 means no extra scrolling was observed. Standard content viewport is 2079 physical pixels, or 616 dp. With the Samsung keyboard, the unobscured Post viewport is 1181 pixels, or 350 dp. Sheet viewports are measured separately. Keyboard totals include the underlying 898-pixel tail covered by the IME. That tail comes from the native scroll rectangle, whose height remains unchanged with the keyboard, and agrees with the closed-form content extent within capture drift. The table reports both total content length and reachable stitched length. The keyboard full.png shows every reachable segment; the closed-keyboard full.png shows the obscured tail. No capture pretends that Post became reachable. These are approximate geometrical extents, not time or swipe-count metrics.

Native text anchors shared across frames establish actual movement. The runner records the number of supporting anchors and stops after no movement. Stitched images omit repeated status/navigation chrome. Accessibility bounds clip partly visible nodes, so the runner uses several matching anchors rather than a partly visible first row. Small cumulative drift remains possible. Reported hundredths distinguish captures and are not precision guarantees.

At 2.0, repeated `adb input swipe` attempts on History made no progress despite hidden content below. A normal `agent-device scroll` moved the same page, so that pass uses the supported device driver and retains its frames. The stationary adb captures are rejected, not reported as a one-screen History. No app fallback was added.

| Screen/state | Font scale | Scroll length, screen-heights | Top three problems |
| --- | --- | ---: | --- |
| Home | 1.3 | 1.08 [capture](captures/home-1.3/full.png) | 148 dp empty Drafts tile dominates; Post is hidden behind the balance tap; Plans is below the first screen at 2.0. |
| Home | 1.5 | 1.1 [capture](captures/home-1.5/full.png) | 148 dp empty Drafts tile dominates; Post is hidden behind the balance tap; Plans is below the first screen at 2.0. |
| Home | 2.0 | 1.26 [capture](captures/home-2.0/full.png) | 148 dp empty Drafts tile dominates; Post is hidden behind the balance tap; Plans is below the first screen at 2.0. |
| Overview, List | 1.3 | 5.78 [capture](captures/overview-list-1.3/full.png) | Summary and History action displace all categories below the first screen; one uninterrupted 33-category region; icon and chevron consume the text column. |
| Overview, List | 1.5 | 6.53 [capture](captures/overview-list-1.5/full.png) | Summary and History action displace all categories below the first screen; one uninterrupted 33-category region; icon and chevron consume the text column. |
| Overview, List | 2.0 | 7.66 [capture](captures/overview-list-2.0/full.png) | Summary and History action displace all categories below the first screen; one uninterrupted 33-category region; icon and chevron consume the text column. |
| Overview, spend bars | 1.3 | 3.75 [capture](captures/overview-spend-1.3/full.png) | Summary repeats the List header cost; rows identify categories only by emoji; comparative values have weak name association. |
| Overview, spend bars | 1.5 | 3.78 [capture](captures/overview-spend-1.5/full.png) | Summary repeats the List header cost; rows identify categories only by emoji; comparative values have weak name association. |
| Overview, spend bars | 2.0 | 3.89 [capture](captures/overview-spend-2.0/full.png) | Summary repeats the List header cost; rows identify categories only by emoji; comparative values have weak name association. |
| History, loaded page | 1.3 | 15.16 [capture](captures/history-1.3/full.png) | No transaction in the first screen; repeated date/category/place metadata; 53 movements form one long visual region. |
| History, loaded page | 1.5 | 17.79 [capture](captures/history-1.5/full.png) | No transaction in the first screen; repeated date/category/place metadata; 53 movements form one long visual region. |
| History, loaded page | 2.0 | 22.5 [capture](captures/history-2.0/full.png) | No transaction in the first screen; repeated date/category/place metadata; 53 movements form one long visual region. |
| Entry details sheet, Barbero | 1.3 | 1 [capture](captures/entry-details-1.3/full.png) | Labels and values remain side by side; category wraps in the narrow right column; reversal has the same visual weight as dismissal. |
| Entry details sheet, Barbero | 1.5 | 1 [capture](captures/entry-details-1.5/full.png) | Labels and values remain side by side; category wraps in the narrow right column; reversal has the same visual weight as dismissal. |
| Entry details sheet, Barbero | 2.0 | 1 [capture](captures/entry-details-2.0/full.png) | Labels and values remain side by side; category wraps in the narrow right column; reversal has the same visual weight as dismissal. |
| Post single, keyboard closed | 1.3 | 1.67 [capture](captures/post-single-closed-1.3/full.png) | Post is below the fold; type choices precede needed category/place answers; 40 dp pair split separates Date from the same entry. |
| Post single, keyboard closed | 1.5 | 1.81 [capture](captures/post-single-closed-1.5/full.png) | Post is below the fold; type choices precede needed category/place answers; 40 dp pair split separates Date from the same entry. |
| Post single, keyboard closed | 2.0 | 2.04 [capture](captures/post-single-closed-2.0/full.png) | Post is below the fold; type choices precede needed category/place answers; 40 dp pair split separates Date from the same entry. |
| Post single, keyboard open | 1.3 | 2.95 total; 2.19 reachable [capture](captures/post-single-keyboard-1.3/full.png) | Post remains behind the keyboard at the scroll endpoint; Date is also obscured; vertical scrolling loses the amount context. |
| Post single, keyboard open | 1.5 | 3.19 total; 2.43 reachable [capture](captures/post-single-keyboard-1.5/full.png) | Post remains behind the keyboard at the scroll endpoint; Date is also obscured; vertical scrolling loses the amount context. |
| Post single, keyboard open | 2.0 | 3.59 total; 2.83 reachable [capture](captures/post-single-keyboard-2.0/full.png) | Post remains behind the keyboard at the scroll endpoint; Date is also obscured; vertical scrolling loses the amount context. |
| Batch, empty stack | 1.3 | 1 [capture](captures/post-batch-closed-1.3/full.png) | Two paragraphs repeat the empty-stack explanation; Add one is displaced; 24 dp list padding differs from the 16 dp page system. |
| Batch, empty stack | 1.5 | 1.13 [capture](captures/post-batch-closed-1.5/full.png) | Two paragraphs repeat the empty-stack explanation; Add one is displaced; 24 dp list padding differs from the 16 dp page system. |
| Batch, empty stack | 2.0 | 1.36 [capture](captures/post-batch-closed-2.0/full.png) | Two paragraphs repeat the empty-stack explanation; Add one is displaced; 24 dp list padding differs from the 16 dp page system. |
| Batch editor, keyboard closed | 1.3 | 1.55 [capture](captures/post-batch-editor-closed-1.3/full.png) | Add to batch is below the fold; repeated type options consume height; Date splits into another card. |
| Batch editor, keyboard closed | 1.5 | 1.68 [capture](captures/post-batch-editor-closed-1.5/full.png) | Add to batch is below the fold; repeated type options consume height; Date splits into another card. |
| Batch editor, keyboard closed | 2.0 | 1.91 [capture](captures/post-batch-editor-closed-2.0/full.png) | Add to batch is below the fold; repeated type options consume height; Date splits into another card. |
| Batch editor, keyboard open | 1.3 | 2.72 total; 1.96 reachable [capture](captures/post-batch-keyboard-1.3/full.png) | Add to batch remains behind the keyboard; Date is obscured; edited amount scrolls away. |
| Batch editor, keyboard open | 1.5 | 2.96 total; 2.2 reachable [capture](captures/post-batch-keyboard-1.5/full.png) | Add to batch remains behind the keyboard; Date is obscured; edited amount scrolls away. |
| Batch editor, keyboard open | 2.0 | 3.36 total; 2.6 reachable [capture](captures/post-batch-keyboard-2.0/full.png) | Add to batch remains behind the keyboard; Date is obscured; edited amount scrolls away. |
| Drafts, empty | 1.3 | 1 [capture](captures/drafts-1.3/full.png) | Sources narrows the heading to 116 dp; long eyebrow and Candidates break across lines; completion copy pushes the next action below the first screen at 2.0. |
| Drafts, empty | 1.5 | 1 [capture](captures/drafts-1.5/full.png) | Sources narrows the heading to 116 dp; long eyebrow and Candidates break across lines; completion copy pushes the next action below the first screen at 2.0. |
| Drafts, empty | 2.0 | 1.17 [capture](captures/drafts-2.0/full.png) | Sources narrows the heading to 116 dp; long eyebrow and Candidates break across lines; completion copy pushes the next action below the first screen at 2.0. |
| Category look, Arriendo, empty | 1.3 | 1.04 [capture](captures/category-look-1.3/full.png) | Category name repeats in a chip; 132 dp bottom padding creates unnecessary extent; activity precedes the limit action when populated, not exercised here. |
| Category look, Arriendo, empty | 1.5 | 1.07 [capture](captures/category-look-1.5/full.png) | Category name repeats in a chip; 132 dp bottom padding creates unnecessary extent; activity precedes the limit action when populated, not exercised here. |
| Category look, Arriendo, empty | 2.0 | 1.16 [capture](captures/category-look-2.0/full.png) | Category name repeats in a chip; 132 dp bottom padding creates unnecessary extent; activity precedes the limit action when populated, not exercised here. |
| Budget, empty | 1.3 | 1 [capture](captures/budget-1.3/full.png) | Only an empty state was available; populated budget rhythm is unmeasured; extra explanation or large spacers would add cost without a current task benefit. |
| Budget, empty | 1.5 | 1 [capture](captures/budget-1.5/full.png) | Only an empty state was available; populated budget rhythm is unmeasured; extra explanation or large spacers would add cost without a current task benefit. |
| Budget, empty | 2.0 | 1 [capture](captures/budget-2.0/full.png) | Only an empty state was available; populated budget rhythm is unmeasured; extra explanation or large spacers would add cost without a current task benefit. |
| Settings | 1.3 | 1.22 [capture](captures/settings-1.3/full.png) | Decorations leave 170 dp for text; category-name preview expands into several lines; Sign out is below the first screen. |
| Settings | 1.5 | 1.29 [capture](captures/settings-1.5/full.png) | Decorations leave 170 dp for text; category-name preview expands into several lines; Sign out is below the first screen. |
| Settings | 2.0 | 1.58 [capture](captures/settings-2.0/full.png) | Decorations leave 170 dp for text; category-name preview expands into several lines; Sign out is below the first screen. |

## What the first screen contains

The entries below summarize the actual first captures. The associated per-scale files remain the authority for line wrapping. The first need is a design judgment based on the screen's purpose, not a user-task study.

| Screen/state | Observed first-screen content at captured scales | What the dad needs first |
| --- | --- | --- |
| Home | Balance and six-place context, empty Drafts, Overview. Plans is partial at 1.3 and 1.5 and absent at 2.0. No explicit Post action. | Balance and a clear way to record money or handle real pending work. |
| Overview, List | Overview heading, Net/Out/In, History button and List/Bars. No complete category row. The first row only peeks in at 1.5. | Month total and the first meaningful category. |
| Overview, spend bars | Same summary, History button and toggle. No complete category bar at 1.5 or 2.0. | Named categories paired with amounts, not an emoji legend to remember. |
| History, loaded page | History heading, loaded-only caveat, Net/Out/In, search and the first filters. No transaction. | Recent transactions and a visible search/filter route. |
| Entry details sheet, Barbero | Barbero and its amount, When, Category, Place, currency note, Reverse and Close. The 2.0 sheet needs a small scroll. | What happened, the exact amount, when and where, then safe dismissal. |
| Post single, keyboard closed | Heading, One/Batch, amount, type options and Description. Place only begins at 1.5. Post is absent. | Amount, description and required answers, with a reachable Post. |
| Post single, keyboard open | Amount focus, upper form and keyboard. The main action is absent both initially and at the captured scroll endpoint. | The focused input, context and Post above the IME. |
| Batch, empty stack | Batch heading and mode, introductory text, empty card. Add one is near the bottom at 1.5 and below the first screen at 2.0. | An Add one action and a concise explanation. |
| Batch editor, keyboard closed | Heading, amount, type options, Description and the beginning of Place. Add to batch is absent. | The entry and Add to batch. |
| Batch editor, keyboard open | Amount and type options above the keyboard. Add to batch is absent at the scroll endpoint. | The input and Add to batch above the IME. |
| Drafts, empty | Sources, broken header, review-complete state and explanation. Continue to Month Close is visible at 1.5 and below the first screen at 2.0. | Whether anything needs review and the next safe action. |
| Category look, Arriendo, empty | Repeated category name, current-month amount, empty activity and the limit/edit actions. Those actions are visible at 1.5 and 2.0. | Category amount and a clearly related limit action. |
| Budget, empty | Budgets and Set a October limit. The needed first action is visible. | The first limit action in this empty state. |
| Settings | User/workspace title, Appearance and My finances. Categories reaches the first screen at 1.5 and only begins at 2.0. Sign out is absent. | Appearance and the workspace/category destinations. |

## Spacing and grouping

Values below distinguish source-defined spacing from measured bounds. Source values remain constant across 1.3, 1.5 and 2.0. Text height and wrapping change. Bounds samples use 1.5 at 3.375 physical pixels per dp. Page padding measures 54 pixels, or 16 dp, on the standard pages. Bottom padding is part of the scroll extent.

| Screen | Inside a row | Between rows | Between groups | Between sections and page padding | Observed break in rhythm |
| --- | --- | --- | --- | --- | --- |
| Home | Source 4 dp between title/detail. Drafts icon-to-title measured 25.7 dp at 1.5, due to space-between. | Tiles are separate 148 dp targets. | Source and measured 20 dp. | Source page gap 20, padding 16. | A large internal gap belongs to one tile, while 20 dp separates different tasks. Empty Drafts looks more important than its status warrants. |
| Overview List | Source name/value 8, value/remaining 4, row vertical/horizontal 12/16. | Hairline, no external gap. | All 33 rows share one region. | Measured In block to History action 48 dp, History action to toggle about 48 dp. Padding 16. | The largest header gaps occur before any category. One continuous category card contradicts the intended two-item grouping. |
| Overview spend | Source bar-row horizontal 8, list gap 4, minimum target 48. | 4 dp. | No semantic date/category clusters. | Same large header gaps as List, padding 16. | Short bars reduce height but remove the category name. Compact geometry does not establish understanding. |
| History | Source title/subtitle 4, subtitle-to-money 12, row vertical/horizontal 12/16. | Hairline. | One continuous loaded list. | Header children 20, list begins after another 12. Padding 16. | The repeated date/category/place line adds several lines per movement. Header choices consume more than a viewport before a transaction. |
| Entry details | Source hero gap 4. Detail rows vertical 8, horizontal label/value gap 12. | No strong section boundaries. | Detail facts share one block. | Sheet gap 12, horizontal padding measured 24 rather than page 16. | Category has 167 dp on the right. Personal Care wraps while its label sits beside it. The relationships need vertical label/value rows. |
| Post single and batch editor | Source amount gap 8, Description gap 4. Migrated ValueRow inner 10, vertical/horizontal 24/20. | Hairline within each pair. | 40 dp between the Place/Category pair and Date. | Screen gap 20, padding 16. | Date belongs to the same transaction but gets the same large split as a new subject. Post remains at the end of content. |
| Batch empty stack | Source paragraph/card gap 20, empty card inner 8 and padding 20. | No rows in this state. | Not exercised with entries. | Main batch padding 24 and bottom 132. | Two explanations repeat what adding an entry does. Add one loses priority and the page has a different horizontal grid. |
| Drafts empty | Source hero gap 8, hero top 16 and bottom 20. | No candidate rows in this state. | Not exercised with candidates. | Default page section gap plus hero padding, page 16. | Sources takes 96 dp. The header copy gets only 116 dp, so even the eyebrow breaks into three lines. A long blank interval precedes Review complete. |
| Category look empty | Source amount block gap 8, vertical padding 12. Empty row vertical/horizontal 12/16. | No activity rows in this state. | Activity in one card. | Page gap 20, padding 16, bottom 132. | The name appears in the heading and chip. Bottom padding creates scrolling after the task is already done. |
| Budget empty | Existing Header followed by one 68 dp primary action. | No rows. | No jars. | Page padding 16. | No current density defect beyond the lack of populated-state evidence. Preserve the direct action. |
| Settings | Migrated ValueRow inner 10, vertical/horizontal 24/20. | Hairline. Measured rows 136 and 162 dp at 1.5. | Two rows in one card. | Page gap from Appearance to card is about 48 dp. Padding 16. | Icons, gaps, padding and chevrons leave 170 dp for metadata. Categories becomes a multi-line catalog preview. |

## Laws of UX findings and checks

The user's [Laws of UX skill](/Users/zambamon/.codex/skills/laws-of-ux/SKILL.md) and its [decision guide](/Users/zambamon/.codex/skills/laws-of-ux/references/decision-guide.md) are the primary method. The laws below explain hypotheses tied to captured artifacts. They do not prove that a change improves usability.

| Screen | Evidence and principle | Proposed change | Observable check |
| --- | --- | --- | --- |
| Home | [Von Restorff](https://lawsofux.com/von-restorff-effect/) and [Aesthetic-Usability](https://lawsofux.com/aesthetic-usability-effect/). The only solid violet tile says Nothing waiting, while Post is hidden behind an unlabeled balance tap. | Make Post explicit. Reduce empty Drafts to a status or disclosure. | Ask the dad to record an expense without guidance. Record the first target chosen and wrong turns. |
| Overview List | [Proximity](https://lawsofux.com/law-of-proximity/) and [Chunking](https://lawsofux.com/chunking/). Large gaps separate the summary and its controls, while 33 categories share a single card. | Tighten the summary. Show two pairs, then View all categories with a count. | Can the dad find a named category without reading the full page? Compare scroll extent and wrong taps. |
| Overview spend | [Tesler](https://lawsofux.com/teslers-law/). Emoji-only bars push category identification onto memory. Shorter is not automatically easier. | Retain category names above money and bars. | Find a category with an ambiguous emoji and read its spend without opening another view. |
| History | [Common Region](https://lawsofux.com/law-of-common-region/), Chunking and [Serial Position](https://lawsofux.com/serial-position-effect/). The first screen has no entries, and 53 movements share one visual region. | Summary disclosure, search, date headings and two-entry cards. Keep full history available and distinguish both sides of a transfer. | Find the most recent expense and a specific older date. Measure initial scroll and errors separately from the full-list length. |
| Entry details | Proximity. Category and Place values align to the far right of their labels. Category wraps independently. | Put each label directly above its value. Separate the correction section from basic facts and dismissal. | Read category and place aloud without scanning across the page. Confirm Close stays easy to find. |
| Post single and editor | [Fitts](https://lawsofux.com/fittss-law/), [Hick](https://lawsofux.com/hicks-law/) and Tesler. Post and Add to batch remain covered at the keyboard scroll endpoint. Three entry-type choices consume space before required answers. | Pin the primary action above the IME. Present the current type and disclose alternate types. Preserve transfer review and retry state. | Complete single and batch forms with the real keyboard, including long description, validation error and a pending retry. Verify the action and focused field remain visible. |
| Batch stack | [Goal-Gradient](https://lawsofux.com/goal-gradient-effect/), as a design hypothesis only. Empty state repeats instructions and places Add one late. No nonempty batch was available. | One explanation, then Add one. For populated batches show a truthful count, net and the next unfinished entry. | Add two entries and identify what remains before posting. Do not claim this populated behavior was tested here. |
| Drafts | Hick and Fitts. A secondary Sources action narrows the main heading and delays the completion action. | Move Sources after the primary task, shorten the eyebrow and keep an uncapped message. | At 2.0, identify whether anything needs review and reach Month Close without interpreting broken words. |
| Category look | Proximity and Common Region. Repeated name and the empty activity card interrupt the relationship between amount and limit action. | One category identity, a summary, related limit facts/actions, then activity preview. | Find spend and change-limit action. Repeat with actual activity and a real limit. |
| Budget | No observed density failure in the empty state. [Jakob](https://lawsofux.com/jakobs-law/) supports retaining the familiar direct primary action. | Keep the empty state concise. Apply the row system only when jars exist. | Audit two populated jars and the editor before E4 acceptance. |
| Settings | Proximity and Chunking. The category preview is several names in a narrow column, without an associated decision. | Show category count or a concise destination description. Keep the catalog on Categories. | Find Appearance, finances and Categories at 2.0. Verify the whole row target is at least 56 dp. |

Uniform Connectedness supports an explicit date heading visually connected to its two-entry groups. A border around unrelated dates would communicate the wrong relationship. The Doherty threshold is not evaluated because this audit did not measure interaction latency. There is no claim that the two-item rule follows from Miller's numerical capacity result. It is an approved Lukapp constraint.

## Design conflicts exposed by real content

The actual balance `56.526.163,06` measures 322.24 CSS pixels in the spec's Geist 600 hero, size 53, tracking -2.65. The page has only 288 dp after its 16 dp margins. Splitting COP onto its own line is insufficient. The current Home shrinks the combined amount to fit. The prototype instead uses the named money size for the exact value, with an explicit note. This is a proposed MoneyHero presentation decision for T0, not an approved silent spec change.

The original spec assigns 40 dp both from a Group title to its first card and between cards because the current Group uses one gap for all children. A title and its content need a smaller 12 dp association. Do not apply one token to both relationships.

Two-item groups add a break after every pair. At 53 movements, at least 27 cards are required. Reducing a 40 dp gap to 24 saves 416 dp over 26 card breaks, but it cannot remove thousands of dp of text. This is arithmetic from the approved grouping rule, not a measured native speedup or a before/after implementation result.

## Recommendation and open acceptance

See [recommendation](recommendation.md) for the selected combination, spacing tokens, T0 component contracts and E1/E2/E6 changes. Open the self-contained [pattern exploration](/Users/zambamon/Work/finance-tracker-v2/design/xxl-density/index.html). Its native before captures remain fixed at 1.5; the prototype selector changes only the after side. HTML and native lengths are not interchangeable.

All 42 captured screen/state and scale cases are present across the requested routes. Open checks include populated Drafts/Budget/category/batch states, dad-led task attempts, TalkBack and native implementation acceptance of the proposed action bar and disclosure. No implementation ticket or provider gate is closed by this design report.
