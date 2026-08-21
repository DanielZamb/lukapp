# First-cutover mobile design principles

These principles are the design contract answered by the SEN-6 prototype. They
apply to the basic Personal and Household experience; they do not replace the
accounting domain rules behind it.

## 1. One surface, one immediate job

Every screen names one job and gives it one visually dominant action. Secondary
actions remain available, but they do not compete for attention. This applies
[Hick's Law](https://lawsofux.com/hicks-law/), choice-overload guidance, and the
Von Restorff effect without hiding necessary complexity.

## 2. Keep 5–8 meaningful groups in view

A **UX element** is a user-perceived group or decision target: a page header, a
hero value, a disclosure, an action tile, a list group, or a primary action.
Supporting labels inside one group do not count as separate elements.

Each principal component may carry one to three information elements. A title,
value, state, timestamp, or supporting fact each count as one. If the component
needs more than three, keep only what supports the immediate decision and make
the component open a detail screen for the rest.

Aim for five to eight visible groups on a normal decision surface. This is a
working density guardrail—not a literal reading of the “magical number seven.”
When a workflow needs more, chunk it into steps instead of shrinking or hiding
controls. See [Miller's Law](https://lawsofux.com/millers-law/) and
[cognitive load](https://lawsofux.com/cognitive-load/).

## 3. Reveal secondary detail on demand

The first view carries only what helps the next decision. Explanations,
legends, accounting provenance, and projections appear through a tap or a
drill-down. The home spending bar therefore reveals its pace and day legend
only when pressed.

Progressive disclosure must not hide required actions. Month Close becomes an
explicit primary destination when Draft review is complete; it is never a
long-press secret.

## 4. Space communicates relationships

Use the 4-point token scale consistently. Related labels and values sit close;
separate decisions receive at least `spacing.xl`; major screen zones receive
`spacing.section`. This applies the
[Law of Proximity](https://lawsofux.com/law-of-proximity/) so grouping does not
depend on borders or color alone.

A card must represent one of the screen's five to eight principal groups. Use
one when its contents need to be perceived and acted on together, such as a
candidate list. Do not wrap a lone summary, title, or value for decoration when
type and spacing already establish the relationship.

## 5. Important actions are easy to acquire

Interactive targets are at least 48 points high, have breathing room, and sit
near the content they affect. Icon-only controls receive an accessible label
and expanded hit area. This follows [Fitts's Law](https://lawsofux.com/fittss-law/).

## 6. Use familiar mobile patterns and plain financial language

Navigation uses a home hub, standard back affordances, rows for drill-down, and
full-width primary actions. Basic mode says “Draft,” “Post,” “Account,” “Move
money,” and “Complete month”; it does not expose Journal Entries, Ledger
Accounts, period locks, or posting authority unless the user deliberately asks
for advanced detail.

## 7. Make the end of consequential actions unmistakable

Posting, completing a month, onboarding, and making a recovery contribution
end on a calm confirmation surface that says what changed and what happens
next. This applies the [Peak-End Rule](https://lawsofux.com/peak-end-rule/)
without celebratory clutter.

## Navigation decision

Variant E, **Essential-first**, is the selected home model:

- The primary tile is **Drafts** while review work remains, then becomes
  **Complete month** when the queue reaches zero.
- **Alerts** is the attention queue.
- **Plans** contains Budgets and Savings Recovery.
- **Overview** contains balances, activity, and Financial Account Profiles.
- The user icon opens the user/workspace page, where appearance settings and
  first-time setup preview live.

## Notification Intake decision

Variant D, **Priority, simplified**, is the selected review model:

- Priority Candidates sit above the ones that can wait.
- Ready Candidates can be confirmed in one action.
- Candidate lists use the same grey grouped cards as the rest of the prototype.
- The reconciliation warning is a centered control, not a banner.
