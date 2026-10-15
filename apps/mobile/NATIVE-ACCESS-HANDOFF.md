# F03 native access handoff

The app uses Clerk's official Expo provider and token cache. Convex derives Actor
from verified identity. A saved recovery intent completes through the protected
server API before ordinary admission. `AccessController` then calls
`clerkProvider.checkSession` before device status, possession heartbeat and
Workspace authority. The native
input store opens only after that admitted Workspace is ready. Lock, background,
session change, disconnect, Workspace change and wipe invalidate generations and
discard Posted and decrypted input memory.

Live financial RPCs use a new authenticated Convex HTTP client for each request.
They retain no reactive query cache and clear its auth state afterward. Clerk's
official SDK supplies the token using the installed Convex adapter's audience or
legacy-template selection. The controller rechecks its mode/epoch/generation
after token retrieval before HTTP dispatch. The WebSocket client supplies only
connection/authentication state, with no financial subscriptions. Official SDK
callback updates keep the same RPC and controller owner. Actual Session loss
reaches that owner and starts durable wipe.

`modules/lukapp-custody` owns the installation P-256 private key, biometric
enrollment sentinel, SQLCipher database key, monotonic lock window and
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
| Physical iOS journey | The user deferred further iOS verification. No physical iOS device is assigned. |

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

Drafts and Candidates have separate native SQLCipher databases and ownership
gates, including an encrypted owner/Workspace identity. These device-only input
databases hold neither an offline ledger nor a financial read cache. There is no capture/parser, sync, transfer, backup or
automatic posting queue. Database keys remain native: device-only Keychain on iOS, a random database key
wrapped by non-exportable AndroidKeyStore AES on Android. Signing key custody is
separate. Connections close after each operation, with cipher_memory_security,
in-memory temporary storage and secure_delete enabled. Earlier AES-GCM files
migrate in a transaction, preserving IDs, expiry and deletion tombstones; only
a successful import removes the old encrypted file. Wipe covers databases and
all journals, wrapped keys and legacy files.
Retention uses an admitted server heartbeat time plus native monotonic elapsed
time. A persisted high-water mark rejects clock rollback; cold launch requires a
new online admission. Editing, retry and cached provider state cannot renew the
original fifteen-day expiry. Expired/deleted IDs retain tombstones.

A confirmed Expense freezes its command facts and stable Draft ID before online
submission. A lost response retains that encrypted Draft. Deliberate retry gets
a new possession proof over the same command facts and idempotency key. Only
known success removes the Draft. Later account and Household setup also persist
immutable confirmed facts in the encrypted Draft owner before their first
request. Saved setup keeps its original request time and command keys through
lock, restart and lost responses. Expense readers keep setup records separate.
The existing Drafts screen offers explicit setup retry. Account balance and entry detail read actual
Posted Journal Lines through the shared backend projections.

Wipe persists a blocking marker before deleting encrypted files, attachments,
input encryption key, installation key, sentinel and saved Workspace binding.
It clears query/decrypted memory and completes provider sign-out before removing
the marker. An interrupted wipe resumes on launch. A recovery intent marker is
nonsecret routing state; only the server-created intent and a different,
provider-created fresh Session can complete recovery. Recovery work IDs are also
nonsecret native routing metadata. Intent and work IDs remain in their original
namespace through wipe so the protocol can resume. They grant no local-input or
financial authority. Actual provider work status comes from the guarded public
API. Pending cleanup remains visible, and its ID clears only after observed
success. Work-ID writes require the current unlocked native generation.

Live and fixture keys, input paths, markers and bindings use separate native
namespaces. Switching mode cold-locks custody and replaces the controller and
Posted owner. Async results from the previous epoch cannot publish into the new
mode. The controlled loopback transport uses synthetic claims, real Convex public
handlers and the official Clerk backend SDK with an isolated provider transport.
Its platform scenarios are independent test databases, not live financial data.

## Current source and device evidence

Round-one source review identified eight accepted fixes. SDK callback churn now
preserves controller ownership. Saved recovery completes before ordinary
registration-barrier rejection, then follows normal admission. Setup retries
read immutable encrypted facts. Security freshness clears when the route leaves
Security, while admission-induced remounts retain the current visit. Android
prompt cleanup uses the originating key alias and attempt owner. A late callback
cannot delete a newer attempt's or another mode's key.

Known command-domain rejections are caught only around a normal public financial
request after proof creation, inside guarded work. They retain admission and
confirmed facts. Native, transport, proof, Session, membership and permission
failures retain blocking or wipe behavior. `phoneSummary` receives an explicit
proved `now`, matching other Workspace reads. Convex freezes time per invocation;
the change addresses query-cache and time-input consistency.

The user authorized Xiaomi 23113RKC6G, Android 16, serial `4f7bc0f7`, for a
physical biometric check while deferring iOS. Installation preserved phone data.
The user reports Google sign-in success on the phone and both simulators.
A read-only public native-state trace observed physical native unlock, followed
approximately 1.76 seconds later by app invalidation. The signing key remained
absent. This proves native unlock completed; it does not prove controller churn
was the sole cause or establish TEE/StrongBox signing custody.

Phone UI is paused for source work. Its app was force-stopped without data
reset, its T3 automation panel closed without phone shutdown, and owned Metro
PID 11591 stopped after checking its command, checkout and port. Both assigned
simulators remain off. The corrected binaries and JavaScript exports have local
build checks, but no corrected installed-device journey yet. The full native
execution gate remains incomplete.

## Live readiness and remaining runtime checks

The coordinator retains separate Chrome Owner/session and configuration
receipts. Those receipts do not prove authenticated native admission. The last
retained deployment evidence identifies `9fbf2ea`, before the F03 functions.
The worker has not observed a newer deployment. Integration, deployment and
fresh source reviews remain coordinator-owned. Native API and Clerk's actual
30/90 settings remain unobserved here. No live recovery, provider administration
or Chrome-session revocation was exercised by this worker.

Preference 21 still separates simulated prompts and native software signing from
actual sensing and hardware guarantees on both virtual devices. The physical
phone trace does not close TEE/StrongBox or attestation checks. iOS hardware
checks remain skipped, and further iOS runtime verification is user-deferred.

Remaining observable execution includes admitted real-provider first-run and
first Expense; current SQLCipher storage and migration; fifteen-day expiry,
clock rollback and restart; offline Draft and lost-response retry; crash-resumed
wipe and attachment deletion; marker/reinstall/key-loss handling; fresh security
entry and action prompts; held admission, Workspace and Session races; and
permission, revocation and expired-contact denials. Controlled provider fixtures
cover destructive recovery and revocation cases. Source tests and earlier
virtual fixture journeys do not replace these final installed-device checks.

The F03 report and receipts retain exact source, build and export identities,
all prior review findings and responses, corrected checks and open runtime limits.
