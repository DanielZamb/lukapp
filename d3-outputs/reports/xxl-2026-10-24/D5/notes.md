# D5: remaining sheets and states (XXXL)

Design only. No app code changes, no devices. Default tier untouched. Outputs are committed under `d3-outputs/` at the user's request.

## Source

- Page: `design/xxl-states/index.html` (built by `design/xxl-visual/build.py`)
- New sources: `design/xxl-visual/src/states.js`, `design/xxl-visual/src/states.html`; D5 additions at the end of `src/app.css`
- Reuses D3's engine and screens and D4's building blocks (`flows.js`). D3 and D4 pages rebuilt unchanged.

## What's covered (36 states, 6 groups)

1. Home: What do you want to do? sheet, over-limit amber dot on the bell, loading.
2. Post money: place picker, date picker (Today / Yesterday / Pick a date opens the native calendar), Add to batch, can't post yet (disabled Post, reason pinned above it), couldn't post (saved for retry), candidate is gone.
3. Categories while posting: three is the most, primary, one that covers them (island), add your own (island, the four-answer nature question as full-width options), delete.
4. Setup sheets: currency, time zone, restyle (island), basic setup is saved (deferred place), setup couldn't be confirmed.
5. This phone: checking this phone, locked (biometrics), sign in again, access moved, cleanup failed, protection unavailable, build can't register.
6. States in screens already drawn: Overview Bars, History nothing matches / nothing posted / load more, reversed entry, recovery suspended, no savings place, months don't match, couldn't lock June.

Not drawn: Android's native date picker, sign-in (Clerk's, not touched), iOS notification intake (waiting for iOS screens).

## New primitives

ActionSheet, AlertDot, InlineNotice (short coloured title, uncapped meta explanation), Skeleton, CenteredMoment soft tone, SearchPicker.

## Review fixes in this round

- Error and warning lines ran to four lines of red body text at 2.0. They're now notices: a short title with an icon, then a smaller explanation.
- The disabled Post's reason moved next to the pinned button, so it's visible without scrolling.
- History no matches pinned only Clear filters; Load more moved inline.
- Shortened labels that wrapped: Open Drafts, Load more, Pick another.

## Checks (HTML, local only)

- `window.audit()`: pass on 76 frames, 0 issues (overflow, clipping, truncation, items per group, targets, contrast, hero, icon). See `audit.json`.
- Scroll lengths: `measurements.txt`. Overview Bars 1.75 screen-heights vs 7.66 for today's List capture.
- Screenshots: `NN-<group>-2.0-light/dark.png`, `00-page-top.png`.
- No device or real-provider checks: this is a design pass. Every length is an estimate until checked on the phone.

## Round 2 (user decisions)

1. Over-limit alerts stay behind the bell: Home gets an amber dot on the bell, no card. Done.
2. Today / Yesterday / Pick a date: approved.
3. Copy changes: approved.
4. Post disabled until there's a description: approved.
5. New users go straight to setup: the Home-before-setup state is removed.
6. The category question ("What happens to the money?") keeps its four answers from `NatureQuestion.tsx`: I spend it, I receive it, It is still mine, I pay a debt. Full-width options, one per row.
7. Sign-in isn't touched: Clerk draws it. The sign-in and sign-in-error frames are removed.
