# G02 signed Clerk session reconciliation

G02 implements the narrow signed webhook receiver for SEN-11 and SEN-68 on the tested G01 signed-`sid` boundary. It preserves G01's public APIs and schema. Native behavior belongs to U01, accounting adapters to U02, and deployment and stored-denial migration to the coordinator.

## Endpoint and configuration

The target development backend is `https://compassionate-opossum-63.convex.cloud`. Its HTTP action endpoint is exactly:

```text
POST https://compassionate-opossum-63.convex.site/clerk/session-events
```

`convex/http.ts` registers only that path and method. Clerk calls the `.convex.site` URL. Normal authenticated Convex SDK calls use `.convex.cloud`. This source has not been deployed or compared with deployed source. The old development handler must remain until the coordinator completes replacement and migration checks.

The receiver requires server environment variable `CLERK_WEBHOOK_SIGNING_SECRET`, containing the endpoint's signing secret from the same Clerk instance as normal admission. It calls the official `verifyWebhook` from pinned `@clerk/backend@3.23.2`. The SDK verifies the untouched request body and `svix-id`, `svix-timestamp`, and `svix-signature`, including its timestamp tolerance. G02 does not implement its own production signature algorithm or disable timestamp verification.

Normal G01 admission still requires `LUKAPP_OWNER_CLERK_SUBJECT`, `CLERK_JWT_ISSUER_DOMAIN`, and server-only `CLERK_SECRET_KEY`. The webhook does not need the Backend API key and never calls Clerk's session API. No caller-provided `sid` replaces a signed identity claim in ordinary public APIs.

## Supported event contracts

Only these verified events change local state:

- `session.revoked` with `data.object: "session"`, nonempty whitespace-free string `data.id` and `data.user_id`, and `data.status: "revoked"`.
- `session.ended` with the same identity fields and `data.status: "ended"`.

Additional provider fields are ignored. The receiver parses verified values as unknown data rather than trusting the SDK's static event type. A nonempty string `type` is required even for unrelated events. Verified unrelated events, including `session.created`, `session.removed`, and user events, return 204 without writes, grants, session listing, revocation scheduling, or recovery actions.

The signed provider `data.id` is the Clerk session ID, and `data.user_id` is its owner. Existing device and denial rows must agree with that owner. A mismatch fails atomically and leaves existing state intact. The configured endpoint secret authenticates the provider instance. This route grants no access and performs no recovery-factor verification.

## Normal webhook flow

1. Clerk ends or revokes a session outside Lukapp and delivers its signed terminal event to the exact endpoint above.
2. `clerkWebhooks.sessionEvents` verifies the raw request with the configured signing secret, then validates the relevant payload.
3. The HTTP action awaits the internal-only `clerkWebhooks.reconcileTerminalSession` mutation with just the verified session ID and owner.
4. `recordClerkTerminalSession` uses the shared G01 `denySession` helper. The transaction marks a matching `mobileDevices` row's `revokedAt` once and creates a completed `clerkRevocations` tombstone. An event arriving before registration still creates that tombstone. It blocks later enrollment of that same `sid`.
5. An existing pending local revocation keeps its original request time and attempt count and gains `completedAt`. An existing completed denial remains unchanged. Already-scheduled G01 workers observe completion and exit. A worker already in flight may finish its prior provider request; denial never clears.
6. The HTTP action returns 204 only after the transaction succeeds. G01's existing reactive status and protected-query guards read those same rows. Status returns `{ status: "revoked", wipeLocalInput: true }`; protected guards reject with `device_revoked`. Submission with a previously obtained live observation also fails after denial commits.

Duplicate, concurrent, and out-of-order terminal events converge on one permanent denial per `sid`. Event timestamps do not order grants because this handler never grants access. Another session of the same user remains unaffected. No event receipts, recovery intents, session epochs, new authority, or schema tables are added.

Missing or blank signing configuration returns 503. Missing headers, bad signatures, tampered requests, stale or future delivery timestamps, invalid JSON, and malformed relevant payloads return 400 without writes. Reconciliation errors, including ownership conflicts, return 503 for provider retry. Responses contain static text only. Application code does not log credentials, tokens, request bodies, identities, or verifier exceptions.

Webhook delivery remains asynchronous. Before delivery, G01's short-lived JWT behavior and live-provider checks remain unchanged. This receiver cannot notify an offline phone or itself prove native deletion of local input.

## Local regression evidence

`convex/clerkWebhooks.test.ts` exercises the exact HTTP route with locally HMAC-signed raw fixtures and the real Clerk SDK verifier, without mocking verification. Normal public G01 registration uses the existing controlled Clerk session HTTP transport. Test-only query and submission adapters call G01's actual guards. They are absent from the deployable API.

The 34 webhook tests cover both terminal events, protected denial, unaffected sessions, enrollment tombstones, replay and concurrent delivery, pending worker completion, unrelated events, invalid signatures and timestamps, malformed payloads, static private diagnostics, ownership conflicts, and exact route matching. The fixture transport deliberately continues to report an active provider session after delivery, proving local denial rather than provider-response denial.

On the original G01 base `808865b` plus G02:

- `pnpm exec vitest run convex/clerkWebhooks.test.ts convex/deviceBoundary.test.ts`: 52 tests pass.
- `pnpm test`: 206 tests pass in 18 files.
- `pnpm typecheck`: root and mobile pass.
- An esbuild browser-platform bundle of `convex/http.ts` passes without a Node runtime.
- `git diff --check` passes.

G02 implementation commit is `7d9557cdbf10d0938a0f6e69ace21d3aaa093e35`. After that commit, the parent's tested U02 integration `b40017f` was merged locally as `eff254c47669363d9a82e760551dca8acf991f1c`, without conflicts or adapter edits. On that combined source:

- `pnpm exec vitest run convex/clerkWebhooks.test.ts convex/deviceBoundary.test.ts convex/accountingBoundary.test.ts`: 69 tests pass.
- `pnpm test`: 241 tests pass in 19 files.
- `pnpm typecheck`: root and mobile pass.
- `git diff --check` passes.

The final handoff commit changes this document only. Existing Vitest configuration and React test-renderer deprecation warnings remain non-failing.

The first broad checks encountered missing mobile dependencies. `pnpm install --frozen-lockfile` installed the workspace dependencies, and the checks above then passed. API module entries were generated with offline `convex codegen --system-udfs --typecheck disable`; existing generated declarations and components exports were preserved to avoid unrelated generator-format changes. No deployment analysis or provider connection was used.

These are local regression results only. No deployment, provider configuration or session write, data migration or reset, device use, push, root-checkout edit, or PR5 restoration occurred.

## Remaining real-provider checks

The coordinator must record exact source SHA, deployment URL, deployed-source match, actual Clerk sign-in, and observed results before runtime acceptance:

1. Preserve existing denials while migrating the deployed old device schema into G01's schema. The parent's live inventory and private backup are separate evidence; G02 does not migrate old `deviceSessionDenials` or restore old webhook receipts.
2. Integrate U02's guarded adapters and U01's registration, reactive status, lock, and wipe behavior. Audit the deployed function inventory for bypasses before replacement.
3. After explicit deployment authorization, deploy the reviewed combined source. Configure the same Clerk instance's endpoint signing secret and subscribe the exact `.convex.site` URL to `session.revoked` and `session.ended`.
4. Use normal Clerk sign-in and Convex authentication to register an isolated named device through `deviceAccess.register`. Confirm a real signed `sid` reaches Convex. Open `deviceAccess.status` and a normal protected accounting query as subscriptions, and perform an ordinary guarded public write.
5. End an isolated session through normal Clerk sign-out, and separately revoke another isolated session through Clerk's supported controls. Record actual Clerk event type, required field presence, delivery status, and time to local denial without copying event bodies, identity values, or credentials into logs or receipts. Confirm the HTTP result is 204 and the transaction precedes acknowledgement.
6. Observe status becoming revoked and the existing protected subscription losing access during the remaining valid JWT window. Verify a normal public write and re-registration fail, while another active device retains its access. If the SDK loses authentication before status is observable, record that distinction and verify U01's authentication-loss handling separately.
7. Redeliver each terminal event through Clerk's normal retry controls. Confirm one durable denial, stable revocation time, no webhook-origin provider revoke loop, and no access restoration after an unrelated event. Test a bad signature and malformed relevant request against the deployed path and confirm non-success with no state change. Confirm public clients cannot invoke the internal mutation directly, since convex-test does not enforce that transport restriction.
8. With authorized isolated sessions, exercise a Lukapp-local revoke followed by the signed provider event and retry delivery. Confirm pending work completes and denial survives any provider outage. Record real delivery delay, JWT expiry, and SDK refresh behavior. Local fixtures do not prove these provider effects.
9. Keep physical iOS and Android lock and local-input deletion, offline next-contact behavior, full recovery UI and provider acceptance, and production plan, session lifetime, and cutover checks open with U01 and the coordinator. G02 adds no recovery protocol.

Clerk Dashboard synthetic sends alone do not prove an actual end-user session transition. No item above has been executed in G02.

## References

- [G01 fixed signed-sid contract](../g01/HANDOFF.md)
- [SEN-11](https://linear.app/sennkai-labs/issue/SEN-11/define-personal-mobile-access-and-device-loss-controls) and [SEN-68](https://linear.app/sennkai-labs/issue/SEN-68/decide-how-device-registration-and-revocation-reach-convex), read on 2026-10-17.
- Root checkout ADR-0080 and `docs/research/mobile-access-device-loss-controls.md`, read without edits.
- [Clerk official verification API](https://clerk.com/docs/reference/backend/verify-webhook) and [verification implementation](https://github.com/clerk/javascript/blob/main/packages/backend/src/webhooks.ts).
- [Clerk session webhook JSON fields](https://github.com/clerk/javascript/blob/main/packages/backend/src/api/resources/JSON.ts) and [Clerk terminal event examples](https://clerk.com/blog/webhooks-getting-started).
- [Convex HTTP actions and endpoint host](https://docs.convex.dev/functions/http-actions).
