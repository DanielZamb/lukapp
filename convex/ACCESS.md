# Owner access and Workspace provisioning

A02 and A03 extend this A01 design record with mandatory registered-device possession on every accounting call, including bootstrap. The current API, errors and native responsibilities are in [the device handoff](../src/access/NATIVE-HANDOFF.md). The A01 identity and permission rules below still apply; its original argument descriptions now also require `access`.

The actor's stable key is Convex `UserIdentity.tokenIdentifier`. Membership `userId`, ledger `postedBy`, and period decision `decidedBy` store this server-derived key. Device arguments never supply an actor. Existing synthetic membership IDs grant no access and require an explicit future migration.

The `personalWorkspaceOwners` table stores only tokenIdentifier, Clerk issuer, Clerk subject, and Personal Workspace ID. A `by_identity` index makes the bootstrap read and insert participate in Convex's serializable mutation transaction. No email, session token, device ID, or profile claims are needed.

`ownerQuery` and `ownerMutation` use convex-helpers customQuery/customMutation with customCtx. They authenticate through ctx.auth and require both the configured issuer and pre-provisioned Owner subject. Missing configuration fails closed. Their context adds actor and the verified identity facts. Accounting errors map to stable ConvexError codes.

The versioned `workspace-roles@1` policy defines these permissions:

| Role | View | Prepare | Post | Correct | Manage periods | Administer membership |
| --- | --- | --- | --- | --- | --- | --- |
| Owner | yes | yes | yes | yes | yes | yes |
| Accountant | yes | yes | yes | yes | yes | no |
| Preparer | yes | yes | no | no | no | no |
| Viewer | yes | no | no | no | no | no |

Only Personal bootstrap and deliberate Household creation grant a membership, always Owner. See [the Workspace API contract](./WORKSPACES.md) for Household retry and discovery behavior. Other role presets are modeled for enforcement and deterministic tests; there is no public role-grant API. Core membership checks enforce permissions. Shared Posting enforces Post even when called internally. Reversal requires Correct and reaches Posting. Profile creation requires Prepare; period locking requires Manage periods.

`accounting.createPersonalWorkspace` takes explicit functionalCurrency, optional chartOfAccountsTemplate, and the existing now clock argument. The first call provisions one Workspace, Owner membership, sparse chart, and initial period, then records the identity link. Retries return the same Workspace. A changed currency/template yields personal_workspace_configuration_conflict. Removed membership is denied and never repaired by login.

`accounting.personalWorkspace` takes now and discovers the Workspace from server identity. It returns `{status: "provisioning-required"}` before bootstrap, or `{status: "ready", workspace}` after checking current Owner membership. The client never needs to trust a saved workspace claim. Existing accounting calls retain their other arguments and return types but drop userId.

Access error codes are authentication_required, owner_configuration_required, owner_not_allowed, workspace_membership_required, workspace_permission_required, and personal_workspace_configuration_conflict. Ordinary accounting validation errors remain unchanged.

Current API references checked against primary sources on 2026-10-13:
- https://docs.convex.dev/auth/functions-auth
- https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts

Local convex-test identity integration proves the boundary; it does not establish deployed Clerk or accounting access. Native UI and provider session-setting verification remain outside this authenticated accounting pilot. A02 adds the local device boundary described in the linked handoff. A03 adds durable provider revocation/recovery and signed terminal-session reconciliation. Its `checkSession` action supplies a current provider observation before foreground device/Workspace admission; financial mutations retain the shared A02 and accounting checks. Controlled official-SDK transports establish local behavior, while deployment secrets, webhook wiring, live claims, Native API and Clerk lifetime settings remain unobserved.

The next planning adapters must use View for Savings Recovery and Budget reads and Prepare for their draft input. Recovery Plan activation, cancellation, and correction require a separate Recovery Plan Authority, which the first cutover grants only to Owner. Budget configuration also requires Owner in this cutover. Notification Intake confirmation requires Post and invokes the same Posting controls. Later shared-Workspace grants must extend the explicit policy rather than infer authority from preparation or Posting.
