# G01 session and named-device boundary

This is the tested local boundary for U01, based on U02 commit `d58ca5d`. It adds no frontend destination. The accounting adapters still need U02 wiring before any deployment. The named deployment remains `https://compassionate-opossum-63.convex.cloud`, with its existing Owner allowlist. Nothing in this commit authorizes deployment or cutover.

## Authority and limits

Clerk remains the only session and recovery authority. `ctx.auth.getUserIdentity()` supplies the signed subject, issuer, and `sid`. The configured `LUKAPP_OWNER_CLERK_SUBJECT` admits the sole Owner. `CLERK_JWT_ISSUER_DOMAIN` must exactly match the verified identity issuer. There is no caller-supplied session ID, app credential, session epoch, device signature, challenge, or attestation API.

`mobileDevices` stores named-device metadata keyed by `clerkSessionId`. Registration and submission call Clerk `GET /v1/sessions/{sid}` and require the same session ID and user, active status, unexpired maximum lifetime, and unexpired inactivity lifetime. Registration stores the provider's `client_id`. Platform, install marker, and label are metadata declared by the admitted user. They are not attested hardware identity and cannot independently authorize a call. Copying those identifiers or putting a `sid` in request arguments grants no authority. Theft of a still-valid Clerk bearer token remains within Clerk's session threat model.

Reactive protected queries use the validated Clerk token, the registered non-revoked signed `sid`, current membership, and a specific permission. They do not call Clerk's Backend API. External revocation therefore has the policy's current short JWT lifetime window, normally about 60 seconds. Lukapp revocation denies the marked `sid` transactionally without waiting for token expiry. Existing Convex subscriptions must be tested against real token expiry and SDK refresh before runtime acceptance.

This follows the root checkout's [mobile access policy](/Users/zambamon/Work/finance-tracker-v2/docs/research/mobile-access-device-loss-controls.md) and [ADR-0080](/Users/zambamon/Work/finance-tracker-v2/docs/adr/0080-personal-mobile-access-uses-clerk-and-local-input.md). Remote attestation and fresh proof consumption for every read were provisional design choices and are excluded from this contract.

Primary provider references support the mechanism: [Clerk session-token claims](https://clerk.com/docs/guides/sessions/session-tokens), [custom JWT limitations](https://clerk.com/docs/guides/sessions/jwt-templates), [session lookup](https://clerk.com/docs/reference/backend/sessions/get-session), [session properties](https://clerk.com/docs/reference/backend/types/backend-session), [provider pagination implementation](https://github.com/clerk/javascript/blob/main/packages/backend/src/api/endpoints/SessionApi.ts), [Convex identity claims](https://docs.convex.dev/auth/functions-auth), and [Convex actions](https://docs.convex.dev/functions/actions). These describe provider behavior, not physical-device acceptance.

## Native public API

All calls use the normal Clerk SDK and Convex authentication integration. Types use `Id<"mobileDevices">` from `convex/_generated/dataModel`.

```ts
// Action. No userId, sid, clientId, device credential, or security observation in args.
deviceAccess.register({
	installId: string, // Existing nonsecret per-install marker, 16..128 characters.
	label: string, // Trimmed, 1..80 characters.
	platform: "ios" | "android",
	appVersion: string, // 1..40 characters.
}): Promise<Id<"mobileDevices">>

// Reactive query. Metadata only, never financial admission by itself.
deviceAccess.status({}):
	| { status: "unregistered"; wipeLocalInput: false }
	| { status: "registered"; deviceId: Id<"mobileDevices">; wipeLocalInput: false }
	| { status: "revoked"; wipeLocalInput: true }

// Action. Allows an admitted, live, unregistered phone to manage occupied slots.
deviceAccess.list({}): Promise<Array<{
	deviceId: Id<"mobileDevices">;
	label: string;
	platform: "ios" | "android";
	current: boolean;
	revoked: boolean;
	clerkActive: boolean;
}>>

// Action. Checks the target belongs to this user, commits local denial,
// then schedules provider revocation. Repeating the request is safe.
deviceAccess.revoke({ deviceId: Id<"mobileDevices"> }): Promise<{
	status: "revoked"; clerkRevocation: "queued";
}>

// Action. Called after Clerk-owned recovery, before registration or financial UI.
deviceAccess.revokeOtherSessions({}): Promise<{
	status: "revoked"; clerkRevocation: "queued";
}>
```

`status` and the actions can throw the security errors below. A removed membership produces `membership_required` with `wipeLocalInput: true`, including on `status` when defaults exist. A local revocation produces the explicit `revoked` status. Authentication loss or `session_inactive` also requires the native owner to lock and delete Clerk state and local input. A temporary `provider_unavailable` locks admission but does not establish revocation or authorize deleting an uncertain posting key.

Registration is usable without a hardware credential. The native sequence is Clerk sign-in, local biometric unlock, status, named registration, then defaults/setup. Exactly one non-revoked iOS row and one Android row are allowed per admitted subject. Retrying the same `sid` and install marker returns the same ID. Changing its platform, client, or install marker returns `device_conflict`. A new `sid` must revoke an occupied slot before registration, including after reinstall or re-sign-in. The install marker cannot transfer admission. A revoked `sid` can never re-register.

A new authenticated phone with an occupied slot can list and revoke devices without receiving Workspace data. A locally revoked phone cannot use those security controls. Strong biometric enforcement belongs to the native flow and remains a physical acceptance gate.

`revokeOtherSessions` is a user-authorized revoke-all-other-sessions control. It does not claim to verify a recovery factor. Clerk owns that verification. The action lists every provider page before changing local state, invalidates all known other registrations plus fetched other active sessions, and queues their Clerk revocation. It preserves the current signed session. An unregistered older session receives a revocation tombstone so it cannot enroll later. Recovery UI invocation, provider-list concurrency, and Clerk-external recovery reconciliation need real acceptance tests. No global session cutoff or epoch is introduced.

## Exact adapter helpers

`convex/lib/session.ts` exports these helpers.

```ts
requireSession(auth: Auth): Promise<{ userId: string; clerkSessionId: string }>
verifyCurrentSession(auth: Auth): Promise<LiveSession>
requireLiveObservation(auth: Auth, session: LiveSession):
	Promise<{ userId: string; clerkSessionId: string }>

type LiveSession = {
	userId: string;
	clerkSessionId: string;
	clerkClientId: string;
	verifiedAt: number;
	expiresAt: number;
	abandonsAt: number;
};
```

`liveSession` in `convex/lib/securityValues.ts` is the Convex validator for internal mutation arguments. An observation is an action-to-internal-mutation value, never a public argument, return value, persisted credential, or reusable permit. Internal checks bind it back to signed identity, compare the registered provider client, and reject observations older than five seconds. That bound is an implementation choice to prevent stale internal handoffs. Clerk revocation between its response and the transaction is not a distributed atomic operation.

`convex/lib/deviceAuthorization.ts` exports these helpers.

```ts
type WorkspacePermission =
	| "workspace:read" | "workspace:admin" | "accounting:post"
	| "accounting:correct" | "period:lock" | "category:manage";

requireDevice(ctx: Pick<QueryCtx, "auth" | "db">):
	Promise<{ actor: { userId: string }; device: Doc<"mobileDevices"> }>
requireWorkspacePermission(ctx: Pick<QueryCtx, "auth" | "db">, args: {
	workspaceId: string; permission: WorkspacePermission;
}): Promise<{ userId: string }>
requireSubmission(ctx: MutationCtx, args: {
	session: LiveSession; workspaceId: string; permission: WorkspacePermission;
}): Promise<{ userId: string }>
requirePersonalSetup(ctx: MutationCtx, session: LiveSession): Promise<{ userId: string }>
requirePersonalRead(ctx: Pick<QueryCtx, "auth" | "db">): Promise<{ userId: string }>
requireRolePermission(role: string, permission: WorkspacePermission): void
```

The fixed Owner preset grants all six named permissions. Every other role is denied for this Owner-only cutover. Membership remains a current row in `workspaceMemberships`, not a JWT claim or device property.

An ordinary public action calls `verifyCurrentSession(ctx.auth)`, then `ctx.runMutation(internal.adapter.command, { ...businessArgs, session })`. Its internal mutation validates `session` and calls `requireSubmission` before the existing core command, within the same transaction. The actor comes from that guard. Core membership checks remain intact. Mobile callers keep business-only argument objects and use `useAction` instead of `useMutation`.

For bootstrap, `LUKAPP_OWNER_CLERK_SUBJECT` is the out-of-band pre-provisioned sole Owner admission. `requirePersonalSetup` requires that subject, signed `sid`, current live Clerk verification, and a registered non-revoked device before the first membership exists. Only the explicit atomic `ensurePersonalDefaults` transaction may then create the canonical workspace, Owner membership, My money profile, categories, and opening entry. Existing defaults additionally require their current membership and `workspace:admin`. `requirePersonalRead` returns an actor before defaults exist so the query can return `null`, and checks current membership plus `workspace:read` once defaults exist. Raw public `createPersonalWorkspace` is denied, preventing self-service and duplicate bootstrap routes.

## Complete protected endpoint migration

These are deployment prerequisites owned by U02, not changes made to its adapters by G01. Every public protected write must become a guarded action/internal mutation pair, or an explicitly denied public action. No old public mutation may remain callable.

| Public accounting write | Required handling |
| --- | --- |
| `createPersonalWorkspace` | Explicitly deny publicly. Keep core regression coverage through trusted guarded setup or internal fixtures. |
| `ensurePersonalDefaults` | Live session action, then `requirePersonalSetup`. Atomic categories and opening are covered by `workspace:admin`. |
| `createFinancialAccountProfile` | Live session action, then `requireSubmission`, `workspace:admin`. |
| `lockAccountingPeriod` | Live session action, then `requireSubmission`, `period:lock`. |
| `recordCashExpense` | Live session action, then `requireSubmission`, `accounting:post`. |
| `recordCashIncome` | Live session action, then `requireSubmission`, `accounting:post`, or deny if unused. |
| `reversePostedEntry` | Live session action, then `requireSubmission`, `accounting:correct`, or deny if unused. |
| `createUserCategory` | Live session action, then `requireSubmission`, `category:manage`. |
| `restyleUserCategory` | Live session action, then `requireSubmission`, `category:manage`. |

The reactive workspace reads `openWorkspace`, `listFinancialAccountProfiles`, `listLedgerAccounts`, `listCatalogAccounts`, `listJournalEntries`, `balances`, `trialBalance`, `postedActivity`, and `listUserCategories` require `requireWorkspacePermission(..., "workspace:read")`. `personalDefaults` uses `requirePersonalRead`. `listCategoryPresets` and `suggestCategoryNature` are static reference computations without workspace input. They still require `requireDevice`, and must never load financial rows through that exception. `authConnection.connection` remains a nonfinancial identity/allowlist indicator and must not open financial routes by itself.

Migration cost is bounded to the nine listed public writes, their internal handlers and regression tests, query guard wiring, and mobile `useAction` callers. Public business payloads stay unchanged. G01 adds `deviceAccess.ts`, `deviceAccessInternal.ts`, five security helpers under `convex/lib`, two schema tables, the Zod dependency, generated API types, and focused tests. U02 category tables and optional journal/default fields are preserved.

The deployed pre-U01 inventory contains 79 functions. A normal deployment can remove omitted functions. The coordinator must account for every deployed protected write in `deployed-functions-before-u01.json`, including intake, recovery, and older functions absent from this checkout. Preserve, replace with the guarded boundary, or explicitly deny each before deploying. Presence in that inventory does not prove correct implementation. Do not restore excluded PR5 source or treat this commit as compatibility with that deployment's existing device tables.

## Security errors and uncertain expense retries

All application errors are `ConvexError` with `data.code`. Framework authentication or argument-validation errors can lack that shape. Neither kind proves that a previous timed-out expense did not post.

| Code | Meaning |
| --- | --- |
| `authentication_required` | No authenticated identity. |
| `owner_required` | Subject is not the configured sole Owner, or the Owner config is absent. |
| `session_required` | Missing signed `sid`, wrong or missing issuer config, or non-active token session claim. |
| `session_inactive` | Clerk session absent, foreign, mismatched, non-active, expired, or abandoned. Includes `wipeLocalInput: true`. |
| `provider_unavailable` | Missing server key, network timeout/error, rate limit, non-success response, malformed JSON/schema, or incomplete provider listing. |
| `session_verification_required` | Internal observation mismatches signed identity, is stale/future, or has expired. |
| `device_registration_required` | Signed `sid` lacks a matching registration or provider client binding. |
| `device_revoked` | Local revocation/tombstone. Includes `wipeLocalInput: true`. |
| `membership_required` | Current workspace membership absent or workspace ID invalid. Includes `wipeLocalInput: true`. |
| `permission_denied` | Role does not grant the specific operation permission. |
| `device_slot_occupied` | Platform, install marker, or provider client already occupies a non-revoked registration. |
| `device_conflict` | Existing signed-session registration has different install/platform/client metadata. |
| `device_metadata_invalid` | Invalid registration metadata lengths or platform. |
| `device_not_found` | Revocation target is absent or belongs to another subject. |
| `session_owner_mismatch` | Provider target and expected subject/session do not match. |

Preserve the exact uncertain expense payload and idempotency key for every code above and for transport failures. A guard rejection occurs before ledger idempotency lookup. Clear uncertainty only after an acknowledgement or a specifically classified deterministic accounting rejection under the editor's existing policy. Revocation-driven local deletion is a separate privacy requirement and must not create an automatic replacement submission.

## Local checks and remaining acceptance

`pnpm exec vitest run convex/deviceBoundary.test.ts` passes 18 focused tests. `pnpm test` passes all 147 tests in 15 files. `pnpm typecheck` passes the root and mobile checks. Tests use normal public registration and representative guarded setup/posting adapters loaded only inside the test, with a controlled Clerk HTTP transport. Those adapters are not deployable functions. Their recipe is executable in `convex/deviceBoundary.test.ts`.

Fixture recipe: stub the Owner, issuer, and fixture-only server key. Use `t.withIdentity({ subject: owner, issuer, sid, sts: "active" })`. Mock Clerk session JSON with matching `id`, `user_id`, and `client_id`, active status, and future `expire_at`/`abandon_at`. Call `api.deviceAccess.register` through its action. Call guarded setup to create the real membership and defaults. Then use the same authenticated accessor for public guarded actions and queries. Do not add public actor/session overrides or skip guards in regression adapters.

`clerkRevocations` persists local denials and retry intent. The worker rechecks provider ownership, handles already-ended/absent sessions idempotently, retries failures with capped backoff, and never re-enables a device. Completed rows remain tombstones. No push association exists in this slice. Any later push registration must honor those same revocation rows.

No deployment, Clerk configuration/session writes, data reset, device interaction, or physical acceptance was performed. `convex codegen` generated local bindings and contacted the named deployment for analysis. Its CLI prints an upload step but does not finish a deployment. Local checks establish regression behavior only.

Open gates: U02 adapter wiring and bypass audit, U01 registration/status/wipe UI wiring, compatibility review of deployed schema/functions, real Clerk signed `sid` exposure, normal authenticated APIs on the named development deployment, live negative/retry/revocation tests, external webhook reconciliation, recovery invocation/concurrency, physical biometric/reinstall/local-input deletion, and production plan/lifetime/cutover acceptance. Missing signed `sid` fails closed; no client-session-ID fallback is implemented. Physical tests and real-provider acceptance remain open.
