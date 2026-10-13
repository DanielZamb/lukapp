# A02 device access handoff to F03

This is the implemented backend and typed native contract for ADR-0080 and SEN-62/63/68/69. It adds device possession to A01's authenticated Owner boundary. It does not implement native screens, a native signing module, deployed authentication, Clerk configuration changes or physical-device verification.

## What the server grants

Clerk remains the authentication, session issuance and recovery provider. Convex admits only the configured issuer and pre-provisioned Owner subject. A financial call additionally needs an active Lukapp device binding for the verified Clerk `sid`, possession of its registered signing key, a fresh request proof, current Workspace Membership and the command's existing permission. Every accounting export, including Personal Workspace provisioning and discovery, uses that boundary. No client argument supplies an actor.

`mobileDevices` stores the issuer-qualified actor key, verified `sid`, public signing key, device name, claimed platform, server registration/contact times and a terminal revocation state. It permits one active `ios` registration and one active `android` registration. These platform labels are unverified metadata. There is no hardware identity or platform attestation claim. A signed-in Owner using a hostile client can claim either label; the server enforces registration slots, not a census of physical phones.

The installation private key supplements Clerk authentication. Lukapp issues no access token, refresh token or independent login session. Copying a device ID, name, public key or already-registered session JWT cannot satisfy a new request signature. A captured signed mutation cannot be replayed. A captured read proof can repeat the same read within its 60-second challenge window. It grants no other operation or arguments. A compromised unlocked process can invoke its native signing key; this contract does not claim to prevent that or to attest biometry to Convex.

Initial enrollment trusts the verified Owner session and the new key's possession proof. It cannot prove the physical custody of that session before its first enrollment. After enrollment, a copied JWT with that `sid` cannot change the key or silently create a replacement binding.

## Public functions

Use references from `convex/_generated/api`, also exported as `deviceFunctions` and `financialFunctions` from `src/access/client.ts`. `FunctionArgs` and `FunctionReturnType` are authoritative. That module exports `PrepareRequest`, `PreparedRequest`, `RegisterDevice`, `RegisteredDevice`, `DeviceStatus`, `FinancialArgs<Name>` and `FinancialResult<Name>`.

`DeviceSummary` is `{id, name, platform, createdAt, lastSeenAt, state}`. `state` is `{kind: "active"}` or `{kind: "revoked", at, reason: "owner" | "recovery" | "provider"}`. Times are milliseconds. The public summary contains neither JWTs nor Clerk session IDs nor private keys.

| Function reference | Arguments | Return |
| --- | --- | --- |
| `api.authConnection.connection` | `{}` | A01's signed-out, not-owner or owner diagnostic. It grants no device or Workspace authority. |
| `api.devices.status` | `{deviceId?}` | `{kind: "denied", code, directive}` or `{kind: "registered", device, policy}`. Registered describes the registry, not financial permission or key possession. |
| `api.devices.list` | `{}` | `DeviceSummary[]`, including revoked history. Metadata only. |
| `api.devices.prepare` | `{operation, payloadHash, deviceId? , publicKey?}` | `{challengeId, expiresAt, message}`. Use `deviceId` for a registered session, or `publicKey` for first enrollment or an unregistered Owner's safety revocation. |
| `api.devices.register` | `{name, platform, publicKey, access}` | `DeviceSummary`. Name is nonblank and at most 80 characters. Exact retries converge; changing the binding's metadata/key conflicts. |
| `api.devices.heartbeat` | `{access}` | Current `DeviceSummary` and a renewed successful-contact time. Requires the registered key. |
| `api.devices.revoke` | `{deviceId, access}` | `{kind: "revoked", providerRevocation: "pending-integration"}`. Lukapp financial denial commits immediately. This does not report Clerk revocation. |
| `api.devices.approveRegistration` | `{sid, access}` | `null`. A proved registered device can approve a never-bound session for registration after recovery. The target still authenticates as Owner and proves its own new key. Known revoked/ended sessions remain denied. |
| Every `api.accounting.*` function | Existing A01 arguments plus `access` | Existing A01 result. Current membership and command permission still apply. |

Safe contact functions reveal only connection/registry information and permit first enrollment or safety revocation when a new Owner session has no device. They never return a Workspace, balances, ledger records, Local Entry Drafts or Candidates. Recovery-restricted unknown sessions cannot use enrollment, list or revocation to regain financial access. Revoked sessions can contact `status` to receive their wipe directive.

The `access` argument is `{challengeId: Id<"deviceChallenges">, signature: string}`. Its validator is optional only so absence yields `device_proof_required`. Absence does not grant access. `operation` is the exact enum in `src/access/protocol.ts`, such as `accounting.recordCashExpense`; it is not an arbitrary function name.

## Request proof and retry contract

1. After successful Clerk authentication and local unlock, obtain the device ID from `status`, or create a new native signing key before first enrollment.
2. Build the exact function argument object excluding `access`. Use `proveDeviceRequest` to hash its canonical encoding, call `prepare`, sign the returned `message`, and attach `access`. Do not mutate the request afterward.
3. Submit that object to the corresponding function reference. A financial mutation validates its session/binding, signature, operation and argument hash before invoking the accounting handler. Challenge consumption, successful-contact renewal and the accounting command commit together. An argument mismatch, permission error or domain failure rolls the entire mutation back.
4. After a lost financial response, obtain a new proof and retry the original financial `idempotencyKey`. A consumed challenge returns `device_challenge_replayed`; a new proof lets ordinary accounting idempotency return the Posted entry's replay result. After a lost registration response, call `status` and retry the exact registration with a new proof and the same native key. Parallel identical registrations converge.
5. Replacement needs explicit revocation first, a new Clerk `sid` and a new signing key. Neither an expired nor a revoked binding can reset its lifetime by registering again. A key previously used by another binding cannot register under a different session. This slice deliberately requires re-enrollment across full sign-in; it does not silently move a binding to another `sid`.

`prepare` reads current registry state in a fresh mutation. Challenges expire after 60 seconds of trusted server time and include a 256-bit server nonce. Their signed message binds the protocol version, challenge ID, actor key, verified `sid`, exact operation, payload hash and server expiry. Mutation challenges are single-use. Expired challenges are removed on the same session's next preparation; an already-removed proof is invalid. Revocation does not need to wait for challenge/JWT expiry.

`canonicalJson` produces a stable typed JSON encoding. It sorts object keys, omits undefined object fields, preserves array order and distinguishes strings, numbers, negative zero, Infinity and NaN. Native callers use the supplied TypeScript helper. They must not substitute ordinary `JSON.stringify`, which collapses some Convex numeric inputs. The hashing port receives this encoding as UTF-8 and returns lowercase SHA-256 hex.

A native adapter supplies these ports to `proveDeviceRequest`:

```ts
const hash: NativeRequestHash = {
  sha256Utf8: (message) => Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    message,
    { encoding: Crypto.CryptoEncoding.HEX },
  ),
};
const transport: DeviceChallengeTransport = {
  prepare: (args) => convex.mutation(api.devices.prepare, args),
};
const request: FinancialArgs<"recordCashExpense"> = confirmedExpenseArgs;
const signed = await proveDeviceRequest({
  transport,
  hash,
  key: nativeDeviceKey,
  deviceId,
  operation: "accounting.recordCashExpense",
  request,
});
await convex.mutation(api.accounting.recordCashExpense, signed);
```

The `Crypto` import is `expo-crypto`. It exposes native string hashing on both platforms. The backend's `requestHash` uses WebCrypto; F03 must use the hashing port because Hermes does not need to supply WebCrypto. The port contract is exercised with real public Convex APIs and cryptographic fixture signatures. That is backend/client-protocol proof, not native execution. [Expo Crypto](https://docs.expo.dev/versions/latest/sdk/crypto/), [Convex runtime APIs](https://docs.convex.dev/functions/runtimes).

## Native key custody

Implement the `NativeDeviceKey` interface in a small Expo native module included in the development build. Stock SecureStore stores values; it is not the installation signing API. Never serialize a private key into JavaScript, AsyncStorage, SQLCipher, a backup or a server argument.

- iOS: generate a permanent P-256 signing key with Security's Secure Enclave APIs and an app-specific tag, protected by `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` and private-key usage. Export only its public X9.63 representation. Sign the original UTF-8 message with `SecKeyCreateSignature` and `.ecdsaSignatureMessageX962SHA256`. Do not hash the message twice. CryptoKit can convert that DER signature through `P256.Signing.ECDSASignature(derRepresentation:).rawRepresentation`. [Apple Secure Enclave keys](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave), [Apple signature API](https://developer.apple.com/documentation/security/seckeycreatesignature(_:_:_:_:)), [Apple message signature algorithm](https://developer.apple.com/documentation/security/seckeyalgorithm/ecdsasignaturemessagex962sha256).
- Android: generate an app-specific non-exportable EC key with `KeyPairGenerator` and `AndroidKeyStore`, `ECGenParameterSpec("secp256r1")`, signing purpose and SHA-256 digest. Sign the original UTF-8 message with `Signature.getInstance("SHA256withECDSA")`. Export the public curve point as `04 || x || y`, each coordinate padded to 32 bytes. Native providers commonly return DER signatures; `derSignatureToP1363` supplies a validated conversion. Keystore prevents private-key export; hardware backing varies by device and requires a separate check. [Android Keystore](https://developer.android.com/privacy-and-security/keystore).

The wire public key is 65 bytes of lowercase hex beginning `04`. The wire signature is the 64-byte IEEE P1363 `r || s`, lowercase hex. `derSignatureToP1363` is tested using actual Node DER signatures verified by WebCrypto. Server key registration verifies a valid curve point and an actual challenge signature. It does not prove non-exportable native storage, platform, hardware backing or biometric success. Secure Enclave absence in a simulator is not a physical-device failure or a grant to claim native key protection from software fixtures.

The native bridge must refuse signing while the app is locked. Local biometry controls that app state; there is no server-accepted `biometricVerified` flag. Routine signatures use the current unlocked foreground window, without prompting for every RPC. A separate biometric-enrollment sentinel detects enrollment changes. Key loss or sentinel invalidation blocks financial/local-input UI, requires full online Clerk sign-in and explicit old-binding revocation/re-enrollment.

Keep a nonsecret install marker in the app container and only the key reference/device ID in local configuration. If that marker is missing while Keychain/Clerk state survives reinstall, clear inherited app session state and re-enroll. Exclude local input and its encryption key from backup and device transfer. The Clerk SDK's official token cache remains separate; do not gate every Clerk refresh through the installation signing key.

## Locks, contact and wipe

`accessPolicy` and `lockRequired` specify cold-launch locking, a two-minute ordinary foreground inactivity threshold, a two-minute background threshold and a ten-minute foreground Month Close threshold. Security-screen entry and each security action require fresh strong biometry. Call the policy at an admission/interaction boundary; it is not a render-loop prompt. Drive elapsed time with native monotonic time. A cold launch always locks, so reboot does not extend an old foreground window.

Use `expo-local-authentication` with Android `biometricsSecurityLevel: "strong"`, `disableDeviceFallback: true` and iOS `fallbackLabel: ""`. Missing enrollment, cancellation, lockout or changed enrollment must lead to full Clerk sign-in rather than an app PIN or device-passcode bypass. A SecureStore sentinel can use `requireAuthentication: true` and iOS `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; invalidate access when it becomes unreadable. This needs a development build and configured Face ID usage text. These are F03 native responsibilities; A02's pure timing tests do not establish an actual biometric prompt. [Expo LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).

At every foreground online admission, run `status` and a proved `heartbeat` before exposing local input or fetching financial data. Repeat heartbeat only during unlocked foreground activity; queries, `status`, `list` and challenge preparation do not renew inactivity. Each submitted financial mutation also rechecks and renews successful contact. Fetch financial data online with a newly prepared proof; do not treat a cached query result or a passive subscription as a clock-driven expiry signal. If using subscriptions later, renew their proofs and handle rejection. Query execution checks time, but passage of time alone does not invalidate a reactive query. Revocation changes the actual device record read by the boundary. Maintain no offline financial read model, and remove financial query data from memory on lock, sign-out or connection loss. [Convex query caching and reactivity](https://docs.convex.dev/functions/query-functions).

For `wipe-local-input-and-sign-out`, block signing and financial UI first, then delete the Local Entry Draft/Notification Intake Candidate database, its SQLCipher key, their attachments, the installation signing key, enrollment sentinel and saved device binding. Clear query caches and decrypted memory and finish Clerk sign-out with its supported SDK. Persist a nonsecret wipe-required marker before deletion so a crash resumes deletion on launch. No submission or background synchronization may precede completion. Even if deletion or Clerk network sign-out fails, keep the app blocked and retry cleanup. Server denial already committed independently of this cleanup. Signed-out/expired Clerk state must trigger this cleanup even when no authenticated status request can reach the backend. Local drafts and Candidates remain device-only, unsynchronized and limited to 15 days.

Device errors carry `ConvexError.data = {code, directive}`; `status` returns the same denial as data. `src/access/protocol.ts` contains the exhaustive code/directive mapping. Wipe applies to revoked/expired/unverified sessions and recovery-blocked registration. Unknown/unregistered devices direct registration. Proof failures, challenge expiry/replay, mismatched requests, occupied slots and conflicts direct online unlock/retry or the security flow, not a financial bypass. A01 authentication/configuration/membership/permission error codes remain unchanged. Missing membership is never repaired by sign-in; insufficient permission does not authorize posting.

## Session lifetime and provider integration still required

The server enforces 30 days since the last successful proved contact and 90 days since the binding's first server registration, at the fresh mutation boundary. It cannot infer Clerk Session creation time from JWT `iat`, which is token issuance time. `sid` and `sts: "active"` must come from the verified native Clerk session token. Missing/invalid `sid`, absent status or a non-active status is denied. Live claim exposure on this development issuer is still unproved; a fixture does not establish it. [Clerk session-token claims](https://clerk.com/docs/guides/sessions/session-tokens), [Convex authenticated identity fields](https://docs.convex.dev/auth/functions-auth).

Configure and verify Clerk's actual 30-day inactivity and 90-day maximum lifetime separately in the development instance. They govern Clerk's session, while the implemented local contact/lifetime limits bound Lukapp device authorization. Custom settings are available in development and require a paid plan for production. No production plan decision, paid purchase or provider-setting state is claimed here. SEN-69's production purchase remains deferred. [Clerk session options](https://clerk.com/docs/guides/secure/session-options).

Two internal adapter targets are implemented. They are not public client functions:

- `internal.devices.applyClerkSessionRevocation({tokenIdentifier, issuer, subject, sid}) -> null` records a terminal denial for that verified provider session, even if it never registered, and revokes any associated local device. Repeated calls converge. An old JWT retaining active claims cannot override the recorded denial.
- `internal.devices.applyClerkRecovery({tokenIdentifier, issuer, subject, recoveredSid, eventId}) -> null` accepts a newly provider-verified recovering session that has never bound a device, revokes all old bindings and clears registration approvals. It installs a registration barrier admitting only that recovered session. A stable verified recovery event/operation ID makes retries harmless after the new device registers. Other new sessions need an explicit approval from a proved registered device. No client recovery boolean or refreshed token issuance time supplies this authority.

A future trusted Convex action/server adapter needs Clerk Backend API authorization supplied through the deployment's existing secret management, outside this task. It must obtain the current verified `sid`, call `sessions.getSession(sid)`, and verify the configured Owner user and active status. Before applying recovery it must establish fresh Clerk sign-in/recovery from a trusted flow, including provider Session creation/freshness against a server-recorded recovery intent. It must not infer recovery from an arbitrary client flag, JWT `iat`, or an assumed webhook event. After local recovery denial commits, use `sessions.getSessionList({userId, status: "active"})` with pagination and `sessions.revokeSession(id)` for every session except the newly verified recovered one, including sessions that never registered with Lukapp. Preserve an idempotent provider-work record until retries complete. [Clerk getSession](https://clerk.com/docs/reference/backend/sessions/get-session), [Clerk session list](https://clerk.com/docs/reference/backend/sessions/get-session-list), [Clerk revokeSession](https://clerk.com/docs/reference/backend/sessions/revoke-session), [Backend Session fields](https://clerk.com/docs/reference/backend/types/backend-session).

For ordinary device revocation, resolve the stored target `sid` in an internal server query, verify the fetched Clerk Session belongs to the Owner and call `revokeSession`. The existing public local mutation deliberately returns pending-integration until this adapter exists. Mirror externally initiated provider revocation/end through a signed, ownership-verified provider integration into `applyClerkSessionRevocation`. Delivery can lag, so a webhook alone cannot make Dashboard-only revocation synchronous. Neither provider network revocation nor signed webhook delivery is implemented or exercised by A02. No Secret Key was requested or read.

## F03's next implementation unit

Build the two native signing/hash adapters and locked/wipe state handling around this contract, then wire Clerk's official Expo cache and `ConvexProviderWithClerk`. Verify live `sid`/`sts` exposure without logging JWTs. Enroll before calling Personal Workspace discovery/provisioning. Exercise both named slots, occupied-slot safety revocation, explicit replacement, new-proof financial idempotency retry, expiry, provider/session loss and crash-resumable local wipe. Native key/signature interoperability, actual biometric prompts, provider settings and Clerk recovery/revocation integration remain separate proof. Physical-device evidence is explicitly skipped under standing orders.
