# Personal and Household Workspaces

## Core and storage design

`WorkspaceKind` contains `Personal | Household`. Each stored Workspace owns its
Functional Currency, Chart of Accounts, memberships, periods, profiles, receipts,
and General Ledger. Both kinds use the same Posting and query implementations.

`provisionWorkspace(store, clock, { actor, kind, functionalCurrency,
chartOfAccountsTemplate? })` owns initial Workspace, Owner membership, sparse COA,
and period provisioning. The existing Personal bootstrap retains its canonical
identity link. `createHouseholdWorkspace` owns creation retries through a receipt
keyed by authenticated actor and command key. `listOwnedWorkspaces` reads current
Owner memberships and opens each Workspace through the ordinary core query.

The Convex transaction atomically commits or rolls back provisioning and the
Household receipt. A `by_owner_key` index makes concurrent creation retries
participate in Convex conflict detection. A membership `by_user_role` index supports
discovery without trusting a client identity or repairing a missing membership.

`co-puc-personal@1` and `us-gaap-personal@1` both apply to Personal and Household.
Their existing accounts, defaults, language, and IDs remain unchanged. These are
application COA templates, not a claim of regulatory compliance. Business,
invitations, and additional users remain deferred.

## UI handoff

The Owner wrappers derive the actor from Clerk. None of these calls accepts
`actor`, `userId`, or a Workspace kind supplied by the client.

- `api.accounting.createPersonalWorkspace({ functionalCurrency,
  chartOfAccountsTemplate?, now }) -> Workspace` keeps the canonical first-run
  bootstrap. Currency is explicit. A changed configuration fails with
  `personal_workspace_configuration_conflict`.
- `api.accounting.personalWorkspace({ now }) -> { status: "provisioning-required" }
  | { status: "ready", workspace: Workspace }` keeps existing first-run discovery.
- `api.accounting.createHouseholdWorkspace({ functionalCurrency,
  chartOfAccountsTemplate?, idempotencyKey, now }) -> Workspace` is deliberate later
  setup. Persist one nonblank key for that creation attempt and reuse it after an
  uncertain result. A fresh key deliberately creates another Household. There is
  no Household singleton. The default template is `co-puc-personal@1`.
- `api.accounting.listOwnedWorkspaces({ now }) -> Workspace[]` discovers only
  existing Workspaces with a current Owner membership, in membership creation
  order. Use `Workspace.id` for subsequent selection and commands.

`Workspace` is `{ id, kind: "Personal" | "Household", functionalCurrency,
chartOfAccountsTemplate, currentAccountingPeriod: { year, month,
status: "open" | "locked" | "not_opened" } }`.

A Household retry key is exact and scoped to the server actor and Household
creation command. Its immutable facts are the currency and resolved template.
Changed facts fail with `idempotency_key_conflict`. `now` is a validated clock,
not a creation fact; a retry returns the same Workspace at the requested current
period without opening a new period. Removing or downgrading the membership
denies retries and financial operations. Discovery never repairs membership.
Creation keys are separate from Workspace-scoped account setup, opening, and
Posting keys, so the same string may be used in those separate namespaces.

Every existing accounting endpoint accepts either Workspace kind and enforces
its existing scoped membership and permissions. Profiles, accounts, entries,
and transfer sides must all belong to the selected Workspace. No cross-Workspace
transfer or shared ledger is introduced. Native selection and setup screens are
outside this backend unit; first-run still silently creates Personal and My money.
