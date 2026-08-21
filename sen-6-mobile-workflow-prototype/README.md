# SEN-6 first-cutover mobile workflow prototype

> **PROTOTYPE — throwaway code, in-memory state, not production architecture.**

This prototype answers the SEN-6 question: what navigation and interaction
model lets one Owner complete the first Personal or Household mobile cutover
without exposing unnecessary accounting terminology?

## Verdict

**Variant E — Essential-first** is the selected home. It keeps the current
month and four destinations in view, then progressively discloses the detail
needed to finish a task.

The primary tile is state-driven:

```text
Drafts remain  -> Drafts
Drafts cleared -> Complete month
Month locked   -> August complete
```

Plans contains both Budgets and Savings Recovery. Overview contains balances,
activity, and Financial Account Profiles. Appearance lives on the user page.

See [DESIGN-PRINCIPLES.md](./DESIGN-PRINCIPLES.md) for the Laws-of-UX-informed
design contract and the operational definition of the 5–8 element guardrail.
See [NAVIGATION-REVIEW.md](./NAVIGATION-REVIEW.md) for the accepted flows,
container rule, and remaining navigation work.

## Run it

```bash
npm install
npm start
```

Open with Expo Go, an iOS/Android simulator, or the web target. The prototype
variant is shareable as `/?variant=E`. A development-only switcher preserves
the earlier A–D alternatives as primary-source evidence.

## Walking skeleton

```text
Home (E)
├── User & Workspace
│   ├── Theme
│   └── First-time setup preview
│       └── Workspace kind -> currency -> first account
├── Drafts
│   └── Review -> Post -> confirmation
│       └── when queue is empty -> Month Close
├── Alerts
│   └── routes into Drafts, Savings Recovery, or Plans
├── Plans
│   ├── Budget
│   └── Savings Recovery
│       ├── Move money -> post transfer -> progress confirmation
│       └── Eligible expense -> Draft plan -> Activate plan
└── Overview
    ├── Financial Account Profile -> balance and activity
    └── Add Financial Account Profile
```

Month Close reviews Drafts, Financial Accounts, and Savings Recovery before
locking the month. The close itself does not create activity or change a
balance. A Savings Recovery contribution updates progress only after the
prototype posts a real account-to-account transfer.

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
