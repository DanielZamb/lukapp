# Navigation review

Reviewed on 2026-08-20. Variant E remains the starting point for the SEN-6
navigation model.

## Accepted

- The home navigation and overall UX rules are a good base.
- User and workspace uses a clear order: back action, page title, then content.
- My finances and Financial Accounts are correctly placed.
- Overview and the Financial Account detail flow are good starting points.
- First-time setup has the right sequence and interaction model.
- Alerts works as a routing destination. It needs visual refinement later, but
  its navigation role is accepted.

## Applied now

- Appearance is an open section. It does not use an outer card because spacing
  and type hierarchy already communicate the relationship.
- Passive balance amounts in Overview and Financial Account detail do not use
  cards. Cards remain available where they communicate a decision, state, or
  bounded action.
- A principal component carries no more than three information elements.
- Overview Recent activity shows four entries.
- Financial Account Recent activity shows at most three entries.

The screen-level density rule and the component-level rule are separate. A
normal screen should contain five to eight meaningful groups. Each group should
contain no more than three information elements before it opens a detail view.

## Follow-up decisions

- Drafts is out of scope for this review because its UX is being decided in a
  separate thread.
- Plans routing needs a focused prototype pass.
- Overview needs deeper drill-down paths.
- Alerts needs refinement after its routing responsibilities settle.

## Container rule

Use a card only when a visible boundary helps explain interaction, state, or a
meaningful content unit. Do not wrap content in a card when proximity, spacing,
and type hierarchy already make the relationship clear. Nested cards need a
specific interaction or state reason.
