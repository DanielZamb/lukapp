# SEN-6 first-cutover mobile workflow prototype

> **PROTOTYPE — throwaway code, in-memory state, not production architecture.**

This prototype answers the SEN-6 question: what navigation and interaction
model lets one Owner complete the first Personal or Household mobile cutover
without exposing unnecessary accounting terminology?

Launch opens the level 0 home. D, One sheet, is the settled first-run and
stays available from the user page. C, Look then ask, is the settled level 1
door. A and B stay on the switcher. Personal Workspace and "My money" are
created silently.

## Verdict

**Variant E — Essential-first** is the home. **Variant D — Priority,
simplified** is the Drafts destination. Losing variants and the intake router
are gone. Keep prototyping from this locked pair.

Level 0 home is the balance, Drafts, and Overview. Alerts and Plans appear
only after level 1 unlocks. Plans opens two destinations: August budget and
Savings recovery. The Drafts tile does not become Complete month.
Appearance lives on the user page.

Drafts opens the D inbox. Confirming a Ready Candidate posts a record and
deletes the local suggestion.

See [DESIGN-PRINCIPLES.md](./DESIGN-PRINCIPLES.md) for the Laws-of-UX-informed
design contract and the operational definition of the 5–8 element guardrail.
See [NAVIGATION-REVIEW.md](./NAVIGATION-REVIEW.md) for the accepted flows,
container rule, and remaining navigation work.

## Run it

```bash
npm install
npm start
```

Open with Expo Go, an iOS/Android simulator, or the web target. Home is `/`.
Default door is C. Use `?variant=A` or `?variant=B` to compare. First-time
setup is D, from the user page. Drafts is the D inbox.

Plans budget view, SEN-17, three variants on the same `/` route via `?plans=`.
`/?plans=A` opens the August budget destination. `/?plans=C` is the same jars
with Post a purchase as the dominant action.

A and B compare how the month lands. C walks posting and editing on those
jars, not a lab of isolated rules.

| Key | Name | What it tests |
| --- | --- | --- |
| A | Remaining jars | Month named. Board of what is left. One next action above the jars. |
| B | One next action | The next action is the page. The other August limits wait below. |
| C | Post and edit | Post a 1-tag purchase, then a 3-tag one. Open a jar to change August. |

Try C in this order:

1. Post a purchase, Curso de tenis (Tenis only). Tenis would go over. Continue anyway. The Tenis jar is over when you return.
2. Post a purchase, Boletas Reykon (three tags, net of Cami and Vargas). Lumpy Discretionary moves. No warning unless a jar newly crosses.
3. Open Tenis. Change the August limit. July's 2.82M stays in the note. Add categories until a fourth is blocked.

The three-tag cap and the July note live on the limit sheet in A, B, and C.
The over-budget prompt only appears when posting.

Door variants stay on `?variant=`. C is the default. A asks first. B opens the form.

## Walking skeleton

```text
Home (level 0)
├── What you have now -> account door
├── Drafts (D inbox)
└── Overview
    ├── Out / In
    ├── Go to tx history
    └── List or bars of categories -> budget door

Level 1 home adds Alerts and Plans
Plans
├── August budget (A / B / C via ?plans=)
└── Savings recovery
```

## Prototype boundaries

- State is intentionally memory-only and resets on reload.
- Actions simulate backend outcomes; there is no authentication, database, or
  accounting service.
- The design is intentionally low-flair. Motion, illustration, and final brand
  expression are follow-up work.
- The production implementation should rewrite the validated interaction model
  with tests, real navigation, server validation, permissions, and accessible
  error handling.

## Validation

```bash
npm run lint
npx tsc --noEmit
```
