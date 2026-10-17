# Native admission and local-input cleanup

This is an L1 implementation receipt for SEN-11/SEN-68. G01's tested commit `f4e66c5d8da9f6d24465c92fe32399a5e0a9e9f2` was merged before wiring. The source SHA is the commit containing this receipt. No deployment, provider/configuration write, device interaction, Metro restart, or push was performed.

## UI and normal API path

1. Complete real Clerk Google sign-in through `startSSOFlow`, then deliberately unlock with strong native biometrics. The official `@clerk/expo/token-cache` is unchanged. Cold entry, inactivity, background privacy, and fresh security-route unlock remain enforced by `LocalEntryGate`.
2. The normal `ConvexProviderWithClerk` validates authentication. The nonfinancial `authConnection.connection({})` checks Owner admission. It cannot open financial routes by itself.
3. `DeviceAdmissionGate` subscribes to `deviceAccess.status({})`. Pending, query errors, unregistered, and revoked states do not mount the financial Stack, its sheets, setup, or financial queries. The existing unlocked install marker supplies `installId`.
4. An unregistered session shows **Name this device**. Enter a name and tap **Register device**. The action receives exactly:

   ```ts
   await client.action(api.deviceAccess.register, {
     installId, // existing local marker, not an authority or credential
     label: name.trim(), // 1..80 characters
     platform: "android", // actual Platform.OS, ios or android
     appVersion, // native app version, Expo version only if absent
   });
   ```

   No caller subject, sid, provider client ID, challenge, epoch, credential, or attestation is sent. Identity comes from the signed Clerk token through the normal SDK.
5. Action acknowledgement alone does not admit the UI. The app waits for reactive `{status:"registered",deviceId,wipeLocalInput:false}`. Only then does the financial Stack mount. U02's guarded setup/post/read actions remain the server authority.
6. Provider/transport failures preserve the name and allow retry. An occupied slot displays an explicit denial and requires deliberate revocation before retry. This UI never invokes `revoke` or `revokeOtherSessions`; it never replaces another device. A separate device-management/recovery UI is still required. G01 documents the normal owner-authenticated `list`, `revoke`, and `revokeOtherSessions` APIs in [its handoff](../g01/HANDOFF.md).

The naming form is presentational and independently renderable. It uses existing semantic tokens, shared controls, and an 80-character input limit. No prototype tokens or contrast values changed. U02 owns setup/post/category presentation and controllers.

## Cleanup contract for U02

```ts
const report = useDeviceAccessFailure();
const lease = useLocalInputLease(); // capture in the mounted transport

save: payload => runLocalInputWrite(lease, () => savePendingExpense(subject, payload));
clear: () => runLocalInputWrite(lease, () => clearPendingExpense(subject));
reportFailure: error => report(error);
```

`report(error): boolean` returns true only for a real `ConvexError` carrying `data.code` and `wipeLocalInput: true`. Callers return immediately when true. The local controller synchronously fences that admission's writes and publishes the obscured revocation state before its first await, unmounting the protected tree. A callback retained by an older admission cannot wipe a newer one. Transient/provider errors, uncertain delivery, permission errors without a wipe flag, unknown errors, and missing-sid errors do not themselves authorize deletion.

Both saves and clears must use the captured lease. Operations are serialized per subject. Cleanup drains writes already in flight before deleting input; denied leases reject later operations. An old successful post response therefore cannot clear a new admission's entry, and a late save cannot recreate wiped input. This is an in-memory write fence around the existing store, not a new storage system or server credential.

The cleanup sequence persists `wipe-required` in the existing install marker, drains writes, deletes the subject's existing pending-expense SecureStore item, deletes the app-only biometric sentinel, calls official Clerk `signOut()`, then resets the marker to require sign-in. Failure remains denied with **Retry cleanup**. A persisted pending cleanup resumes on cold entry before sign-in or financial UI. Clerk identity loss also enters cleanup. New enrollment deletes any owner input surviving reinstall before provisioning the new sentinel; deletion failure cannot open the app.

Reactive device revocation and status errors report through this same path. `ProtectedReadBoundary` sits inside the local-entry context and catches financial read errors. Router's root boundary wraps providers, so it is not relied upon to perform cleanup. U02 must report caught setup/category/posting errors and fence its save and clear callbacks. This helper commit intentionally leaves those owned files untouched.

## Local evidence

At this source, `pnpm test` passes 189 tests in 19 files; `pnpm typecheck` passes root and mobile. Focused controller/native/gate/server-boundary tests cover admission only after reactive status, metadata-only registration, no automatic revocation, retry, query denial, thrown financial read errors, confirmed wipe signals, immediate obscuring, durable deletion failure/restart, Clerk identity loss, strong-only options, reinstall deletion failure, draining an active save, stale save/clear rejection, and stale reports after a new admission. Native APIs and provider responses use controlled fixtures; these are regression checks, not runtime acceptance.

Logs: `/tmp/u01-device-all-tests.log`, `/tmp/u01-device-focused.log`, `/tmp/u01-device-types.log`. Both native Hermes bundles export with:

```sh
pnpm --filter @lukapp/mobile exec expo export --platform ios --platform android --output-dir /tmp/u01-device-export
```

Export log: `/tmp/u01-device-export.log`. No native dependencies/configuration changed in this slice. The existing development APK remains the version-code-2 build recorded in [LOCAL_ENTRY.md](LOCAL_ENTRY.md), source `2e2b38b`, SHA-256 `baccab157c8c2256cad08c92c35ed80fb9f0feb056e8cb69234664999a216fce`. It must load the integrated JavaScript through the parent-owned Metro. This receipt does not claim a newly built APK or physical acceptance.

## Integration and acceptance still required

U02's separately tested adapter migration is `a36130e`, integrated by the parent at `b40017f`. It is not part of this worktree's merge. The parent must combine it with this helper and U02's follow-on caller wiring before the first real expense. Without the caller fence, the old `post.tsx` directly writes/clears SecureStore and does not satisfy the late-write guarantee. Without the adapter migration, UI gating does not secure the public financial APIs. G01's complete protected-endpoint/deployed-function inventory remains a deployment prerequisite.

Token readiness is a parent-owned provider gate. Installed Convex 1.46's `ConvexProviderWithClerk` uses ordinary session `getToken` when `sessionClaims.aud === "convex"`, otherwise its legacy template branch. Clerk documents that template JWTs cannot carry `sid`; the native Convex integration must be activated for the signed-session policy. There is no custom token or client-sid fallback. Check actual admission, signed sid exposure, and normal calls on the named development deployment without printing tokens or changing its existing Owner allowlist. See [Convex's Clerk integration](https://docs.convex.dev/auth/clerk) and [Clerk JWT templates](https://clerk.com/docs/guides/sessions/jwt-templates).

Real Clerk admission and negative paths, exact integrated/deployed source identity, reactive local and external revocation behavior, the bearer JWT revocation window, end-to-end deletion on real storage, process-kill/reinstall behavior, hardware biometrics, snapshots/accessibility privacy, and physical-device checks remain open. SQLCipher storage, retention, full recovery/device management, webhook reconciliation, and the deployed 79-function compatibility audit remain separately owned. Categories follow U02's receipt; Intake and other deferred controls are unchanged. No synthetic identity or bundle result establishes these acceptance checks.
