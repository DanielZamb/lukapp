> Cloud handoff, October 24, 2026. The user authorized publishing this brief and both skills on `xxl/d3-visual`. The original restrictions on commits and publishing artifacts below have an exception for this handoff upload. The design-only scope and ban on app code changes still apply.
>
> Read `.claude/skills/frontend-design/SKILL.md`, `.claude/skills/laws-of-ux/SKILL.md`, and `.claude/skills/laws-of-ux/references/decision-guide.md` before designing. These are repository copies of the requested skills; no local Codex skill installation is needed.
>
> Paths under `/Users/zambamon/Work/finance-tracker-v2/` refer to repository-relative locations. The referenced D2/T0 reports and captures, approved XXXL system, and other ignored design pages are still local and are not included in this upload. Obtain those inputs before claiming to have studied them. If T3 thread tools are unavailable in Claude Cloud, include the hand-in in your response for the user to relay to the coordinator.

# D3 — XXXL visual pass: give the large-text screens their character back

**Owner:** Claude Opus 5.5, a design thread. **Worktree:** `xxl/d3-visual` from local `frontend-xxl`, for reading code only. **No app code changes and no commits.**
**Coordinator:** T3 thread `mcp:9d88e6e4-0955-44d3-bc12-3a9bd50a8da6`. Report there with `t3_thread_send`.

## Skills (use both)
1. **`frontend-design:frontend-design`**: invoke it with the Skill tool before designing.
2. **The user's `laws-of-ux` skill:** read `/Users/zambamon/.codex/skills/laws-of-ux/SKILL.md` and `references/decision-guide.md` next to it. It lives in Codex's folder, so read it directly.

## Why
D2 (a Sol worker) measured the XXXL screens on the real phone and proposed structure. The user then rejected its **visual layer**:

> "We got the job done, everything is visible, but does it have the character of the original screens? Does it communicate something other than 'here's a list'? Where are the accents, where's the visual hierarchy, where is the life?"

The coordinator's critique, which the user agreed with:
- **Home:** D2 dropped the brand mark, the bell and profile buttons, the **violet Drafts tile** (the accent) and the destination icons. What's left is identical grey cards with one violet button, and nothing says Lukapp or "your money".
- **History:** the first screen became controls (Loaded totals +, Search, Filters) in identical grey pills. The money, the point of the screen, is hidden behind "+". The movements are plain text, with **no category emoji**, though the app has them. Today's screen gives the money colour and weight ("In $712K" in violet).
- **Post:** the hero amount (a huge "−0") shrank to a form field, One/Batch became stacked grey buttons that read like a menu, and the entry-type chips were hidden. Posting should feel like the main moment.
- Overall: no tint surfaces, no positive green, no emoji tiles, a flat hierarchy where the title is the loudest thing, and no brand moments. The laws D2 cited (Von Restorff, aesthetic-usability, Jakob's law) argue *for* the original character.

## Keep from D2 (structure, measurements, tokens)
- Measurements on the S21 FE at 320 dp: History **22.5** screen-heights at 2.0 (53 movements); Overview list 7.66; Post with the keyboard open has 3.59 total but **2.83 reachable**, with **Date and Post hidden under the keyboard**.
- Structural fixes:
  - **Post and Add to batch pinned above the real keyboard**;
  - **History grouped by date**, with a counted "View all" or bounded previews where it truly helps;
  - two-card previews then "View all" for long lists on Home and Overview;
  - full History always reachable.
- Spacing tokens, at XXXL only, in dp: insideRow 8, rows 16/16, headingToContent 12, betweenGroups 24, betweenSections 32, page 16, pageBottom 24, footer 12/16. Refine them if your design needs it, and justify any change.
- D2's files: `/Users/zambamon/Work/finance-tracker-v2/reports/xxl-2026-10-24/D2/` (`audit.md`, `recommendation.md`, the real-phone **captures** at 1.3, 1.5 and 2.0, `coordinator-comparison-grid.png`). D2's page: `/Users/zambamon/Work/finance-tracker-v2/design/xxl-density/index.html`. Reuse its real content.

## Bring back: the character to preserve (study these first)
- **Today's real screens:** D2's "before" captures, and T0's phone screenshots in `reports/xxl-2026-10-24/T0/` (`before-*.png`, `xxxl-components-*.png`).
- **The approved XXXL design system, which already had character at XXXL:** `/Users/zambamon/Work/finance-tracker-v2/design/xxxl-system/xxxl-system.html` (sections 03, 04, 06; for example the violet "Needs you" tint card, the emoji category pill, the green "COP 80.000", MoneyHero), `prototype.html` and `XXXL-DESIGN.md`. Serve the folder with `python3 -m http.server` and use Chrome.
- **Brand:** `apps/mobile/assets/brand/` (SVG symbol, wordmark, lockup) and `/Users/zambamon/Work/finance-tracker-v2/design/connecting/connecting.html` (the chosen splash look).
- **Tokens and components:** `apps/mobile/src/ui/tokens.ts` and `typography.ts`, and the T0 API `/Users/zambamon/Work/finance-tracker-v2/reports/xxl-2026-10-24/T0/api.md`. Geist 400/500/600/800.

## User decisions you must respect
- **XXXL only** (fontScale ≥ 1.3). The default tier stays pixel-identical.
- At most **2 items per group**, money on its own line, labels above values, **56-pt targets** (primary 68, secondary 60, input 64), nothing clipped, body text never capped.
- **The main amount keeps the original hero size.** The currency sits on its own line above it, so the number is as big as or bigger than today. Only an amount too long for one line shrinks, minimally, never below today's size. **Never render it at row-money size.** Use the real balance, COP 56.526.163,06, at 320 dp.
- **Home keeps the brand header, the logo and the bell and profile buttons.** The coordinator recommends it; confirm with the user in your hand-in if you deviate.
- The word **"left"** ("over" when negative). Dark violet text is `#c4b5fd` (`primaryText`).
- Pills and sheets: tall forms become pages with a pinned footer, and pickers stay sheets (ADR-0090). The context pill (camera island, or peek-then-dock) shows on the category page and Entry details; leave room for it.

## Deliverable
1. **One self-contained HTML page** at `/Users/zambamon/Work/finance-tracker-v2/design/xxl-visual/index.html`. This folder is gitignored. It's one page, not an app scaffold. Inline the fonts and brand assets with a small `build.py`, like `design/xxxl-system/build.py`.
   - Phone frames at **320 dp**, at **1.3 and 2.0**, in **light and dark**.
   - **Today (the real capture) next to your proposal** for **Home, History, Post** (single with the keyboard open, and batch), **Overview**, **Entry details** and **Category look**.
   - Show the scroll length (screen-heights) for each proposal, measured in the page and labelled as an HTML estimate.
   - Add a `window.audit()` that checks overflow, clipping, items per group, targets ≥ 56 and AA contrast in light and dark.
2. **Character checklist per screen:** where the accent is and why, the hierarchy (the 1st, 2nd and 3rd things the eye hits), the brand moment, and the life (icons, emoji, colour in the money). Ground the choices in laws-of-ux, using it as hypotheses, not proof.
3. **Primitive proposal for the T0 follow-up:** the visual building blocks the screens need (for example a tinted hero card, an emoji or icon tile, a coloured money tone, date section headers, a chip set that wraps two per row, a pinned action bar), plus D2's structural ones, and the `MoneyHero` long-value rule above. Give props and the default-tier guarantee.
4. Screenshots of the page, and a short `D3/notes.md`, in `/Users/zambamon/Work/finance-tracker-v2/reports/xxl-2026-10-24/D3/`.

## Rules
- No app code changes and no commits. Nothing from `design/`, `docs/`, `reports/` or `.verification/` goes into git.
- **No devices**: don't touch emulators or the S21 FE (the user's dad's phone). D2's captures are enough. If you truly need a new capture, ask the coordinator.
- No new dependencies anywhere. Never print credentials or tokens.

## Hand-in (`t3_thread_send` to the coordinator, short)
- the page path, plus 3–4 screenshot paths;
- one line per screen on what changed visually;
- the primitive proposal;
- anything you'd like the user to decide.
