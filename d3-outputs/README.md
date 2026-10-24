# D3–D5 XXXL design outputs

Design outputs from the XXXL visual pass on `xxl/d3-visual`, committed at the user's request. Repository paths are preserved under `d3-outputs/`, as in `d3-inputs/`. Design only: no app code changed, no devices touched, and the default tier is untouched.

## Pages

Self-contained HTML (fonts, icons, brand and D2 captures inlined). Open directly.

- `design/xxl-visual/index.html` — D3: the seven core screens at XXXL (Home, History, Post, Batch, Overview, Entry, Category look).
- `design/xxl-flows/index.html` — D4: every other flow (intake, notification intake, alerts, plans, budgets, recovery, month close, places, settings, categories, setup, access, filters).
- `design/xxl-states/index.html` — D5: the remaining sheets and the error, empty and loading states.

## Notes and evidence

`reports/xxl-2026-10-24/D3/`, `D4/` and `D5/` each hold `notes.md` (rounds, user decisions, primitives for T0), screenshots at fontScale 2.0 (and 1.3 for D3), `audit.json` and scroll measurements. All checks are on the HTML in a local browser. Nothing here is device, Convex or Clerk evidence; every length is an estimate until measured on the phone.

## Source

`design/xxl-visual/build.py` builds all three pages from `src/` (engine, screens, flows, states, CSS and page shells) and `vendor/` (Geist fonts, OFL-1.1, see `vendor/geist/LICENSE_FONT`; Ionicons SVGs, MIT, see `vendor/ionicons/LICENSE`). It resolves the brand assets and D2 captures from the repository root, then from `d3-inputs/`, so run it from a copy at `design/xxl-visual/` in the repository root: `python3 design/xxl-visual/build.py`. Pillow is needed for the captures.

## Publication review

Text files and the built pages were scanned for credential patterns (Clerk and Convex keys, JWTs, private keys, GitHub, Slack and AWS tokens), email addresses and deployment URLs. None were found. The pages and screenshots contain real balances, transaction descriptions and category and place names from the D2 captures. This repository is public.
