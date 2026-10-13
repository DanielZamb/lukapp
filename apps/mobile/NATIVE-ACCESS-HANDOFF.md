# F03 native access handoff

The app uses Clerk's official Expo provider and token cache. Convex derives Actor
from verified identity. `AccessController` calls `clerkProvider.checkSession`
before device status, possession heartbeat and Workspace authority. The native
input store opens only after that admitted Workspace is ready. Lock, background,
session change, disconnect, Workspace change and wipe invalidate generations and
discard Posted and decrypted input memory.

Live financial RPCs use a new authenticated Convex HTTP client for each request.
They retain no reactive query cache and clear its auth state afterward. Clerk's
official SDK supplies the token using the installed Convex adapter's audience or
legacy-template selection. The controller rechecks its mode/epoch/generation
after token retrieval before HTTP dispatch. The WebSocket client supplies only
connection/authentication state, with no financial subscriptions.

`modules/lukapp-custody` owns the installation P-256 private key, biometric
enrollment sentinel, AES-GCM input encryption key, monotonic lock window and
durable wipe markers. JavaScript receives only public keys and signatures. It
cannot export the private signing key. Native signing and input methods check the
generation, foreground admission, current enrollment and pending wipe.
Initialization also checks its starting generation, so a delayed old runtime
cannot change the native namespace after disposal.

Production iOS uses Security and Secure Enclave with device-only Keychain items.
Production Android uses AndroidKeyStore and requires TEE or StrongBox protection.
Android custody currently requires API 33 or newer and fails closed below that
floor. Strong biometric prompts have no app PIN or device-credential fallback.
Cold launch locks. Ordinary foreground inactivity and background windows are two
minutes; Month Close's configured foreground window is ten minutes. Security
entry and actions request fresh platform authentication.

## Virtual evidence and skipped hardware checks

Preference 21, supplied by the user on 2026-10-13, applies to both assigned virtual
devices. These checks are explicitly skipped:

| Check | Reason |
| --- | --- |
| Actual Face ID or fingerprint sensing and matching on either platform | A simulator or emulator supplies a simulated response and has no physical sensor proof. |
| Actual iOS Secure Enclave custody guarantees | The iOS Simulator cannot establish Secure Enclave hardware protection. |
| Android TEE, StrongBox or hardware attestation guarantees | The Android Emulator cannot establish these physical protection guarantees. |
| Unsupported simulator biometric enrollment-change fidelity | A simulated enrollment signal cannot establish physical enrollment invalidation behavior. |
| Physical-device journeys | Physical devices are outside the assigned scope. |

Debug simulator custody uses a labelled native software key and still keeps its
private key inside native code. iOS requires both DEBUG and the simulator target
for that adapter. Android requires its debug-only compile flag and a virtual
device. Release builds cannot select the synthetic namespace or software fallback.
Production still requires hardware and strong biometry and fails closed when
unavailable. Earlier progress described as strong biometric unlock means a
simulated platform authentication response, not actual sensing or hardware proof.

Observable virtual evidence must be labelled separately: platform prompts and
simulated responses, native software custody/signing, real public-handler
signature verification, locks/generation/refusal, encrypted storage/wipe,
retries, UI and software-keyboard input. Fixtures cannot close live provider or
physical/hardware gaps. Reviewers must not demand unsupported physical proof as
a local completion gate or call simulated responses physical evidence.

## Local input and retry custody

Drafts and Candidates have separate native encrypted files and ownership gates.
The files are AES-GCM encrypted device-only storage, not an offline ledger or a
financial read cache. There is no capture/parser, sync, transfer, backup or
automatic posting queue. Encryption keys remain in native device-only storage.
Retention uses an admitted server heartbeat time plus native monotonic elapsed
time. A persisted high-water mark rejects clock rollback; cold launch requires a
new online admission. Editing, retry and cached provider state cannot renew the
original fifteen-day expiry. Expired/deleted IDs retain tombstones.

A confirmed Expense freezes its command facts and stable Draft ID before online
submission. A lost response retains that encrypted Draft. Deliberate retry gets
a new possession proof over the same command facts and idempotency key. Only
known success removes the Draft. Account balance and entry detail read actual
Posted Journal Lines through the shared backend projections.

Wipe persists a blocking marker before deleting encrypted files, attachments,
input encryption key, installation key, sentinel and saved Workspace binding.
It clears query/decrypted memory and completes provider sign-out before removing
the marker. An interrupted wipe resumes on launch. A recovery intent marker is
nonsecret routing state; only the server-created intent and a different,
provider-created fresh Session can complete recovery.

Live and fixture keys, input paths, markers and bindings use separate native
namespaces. Switching mode cold-locks custody and replaces the controller and
Posted owner. Async results from the previous epoch cannot publish into the new
mode. The controlled loopback transport uses synthetic claims, real Convex public
handlers and the official Clerk backend SDK with an isolated provider transport.
Its platform scenarios are independent test databases, not live financial data.

## Live prerequisites still unobserved

Public app configuration is supplied. Public issuer metadata and Google account
entry are observable without completing authentication. They do not establish
authenticated issuer/Owner claims, `sid`, active `sts`, `aud`, backend
authorization, Native API settings, Clerk's actual 30/90 settings or deployed
webhook configuration. The live deployment does not expose the added public
readiness function at the observed endpoint. Parent integration/deployment and
normal interactive Owner sign-in are separate prerequisites. No provider-admin
change, real revocation/recovery, deployment or purchase is authorized here.

## User-requested device closure

The user requested both virtual devices be shut down while using the machine.
Both were closed with `device_close(shutdown:true)` on 2026-10-13. No subsequent
device interaction is authorized. Observable virtual journeys left incomplete
are deferred because of that closure, separately from the hardware skips above.
The full native execution gate is incomplete and this checkpoint is not ready
for integration. Latest native mode metadata/build changes and the request-scoped
live transport have source checks but no subsequent installed-device journey.

Remaining observable virtual work includes the final-source installed journeys;
short-background signing refusal after the fix; fifteen-day expiry, expired ID
renewal and clock rollback/restart; explicit offline Draft and lost-response
retry; crash-resumed wipe and attachment deletion; marker/reinstall/key-loss
recovery; fresh security action/re-enrollment; held admission/Workspace/session
races; and UI denial for permission, revocation and expired device contact.
Controller and public-handler tests cover several of these rules, but those
tests do not replace the deferred native journeys. The final report names the
earlier actual device receipts and later unexercised source changes separately.

The F03 report and receipts record exact source/build identities, observable
journeys, failures and corrections, review results and remaining live gaps.
