# Native access and first Expense ownership

Routes call the access controller and consume its current discriminated state.
They never open the input database, sign a challenge, or subtract a balance.
The expense owner freezes the confirmed request in an encrypted Draft before
submission. A retry signs a new challenge over the same facts and Draft ID.

## Grounded paths

Provider observation is `clerkProvider.checkSession`. Device and Workspace
admission follows `admitForeground`, which checks status, proves heartbeat,
and proves `localInputAuthority`. Only Workspace-ready admission opens input.
Financial mutations independently pass the existing Owner/device wrapper and
current accounting permission. Actor comes only from verified server identity.

Setup composes canonical Personal bootstrap, C02 category creation and
`setupFinancialAccount` in one Convex transaction. Setup calls profile creation
and `recordOpeningPosition`; positive openings reach shared Posting and zero
creates no entry. Expense reaches `recordCashActivity` and shared Posting.
Balances and recent entries read actual Posted Journal Lines through the shared
Posted owner. A Workspace-ready response alone does not mean setup is complete.

## Sketch

- Native custody owns the installation P-256 key, separate enrollment sentinel,
  SQLCipher database keys, native monotonic lock window, generation and wipe marker.
- The access controller owns provider-first network sequencing, enrollment,
  recovery, an asynchronous epoch, and current Workspace publication.
- Manual Draft and Candidate owners have separate encrypted namespaces and
  distinct record types. Neither owns an offline financial read or posting queue.
- Onboarding owns four-answer preview and confirmation. Its protected adapter
  uses canonical cores and an exact completion receipt for lost-response replay.
- The Posted owner has memory-only current online results and discards them at
  every access epoch, including re-admission of the same Workspace.
- Expo Router owns navigation; F02 tokens and components own presentation.

Native operations require the current generation. Store operations additionally
require the admitted Workspace. Background, lock and wipe revoke generations
without waiting for JavaScript. The controller checks its epoch after every
await and before every submission or publication. Native generation is a local
process guard, never a server authority claim.

The native biometric window and active signing admission are separate. Closing
input disables signing immediately while retaining only the permitted biometric
window. An explicit foreground admission may reactivate that window after native
enrollment checks; it still performs the provider and Workspace sequence. Cold
launch and explicit lock clear both. Production validates the hardware protection
of existing keys as well as newly created keys.

Wipe blocks first, persists its marker, erases native input and keys, completes
official Clerk sign-out, then removes the marker. A crash or failure leaves the
marker dominant over unlock, admission and submission. Input expiry never
extends on edit/retry and clock uncertainty fails closed.

## Design comparison

Two independent read-only candidates traced the frozen source. One proposed a
single native custody manager plus TypeScript epoch; the other proposed several
opaque native permits plus separate orchestration. The first has fewer public
methods and one owner for signing/storage/wipe. It is the base. The second's
native generation checks and separate contact versus Workspace capability are
retained. Multiple permit classes add no additional authority in this process.

The first candidate proposed an atomic onboarding adapter and status receipt.
The second proposed sequential resumable calls. The atomic adapter avoids a
partially completed four-answer setup and keeps exact replay facts on the server,
while reusing all existing category/profile/Posting policy. There is no server
Draft or duplicated accounting logic.

Simulator keys and controlled provider transports must be explicitly labelled.
Production Secure Enclave absence fails closed. Physical/hardware proof and live
provider/deployment observations remain separate from local fixture evidence.

## SQLCipher continuation

Two local designs were compared against SEN-45 and the native handoff: Expo
JavaScript SQLite with a passed database key, and native SQLCipher connections
behind the existing custody boundary. Native connections preserve ownership of
keys and admission in one place; no decrypted page cache survives an operation.
iOS uses the pinned ExpoSQLite SQLCipher C interface, Android the pinned official
Zetetic native database interface. The installation signing key stays separate.

Draft and Candidate databases include an encrypted owner/Workspace identity,
transactional records and original expiry tombstones. The iOS database key stays
in device-only Keychain. Android wraps a random database key with the existing
non-exportable AndroidKeyStore AES key. Database passwords never enter JS.
Legacy AES-GCM files migrate transactionally with unchanged IDs and times, and
are deleted only after commit. Retry after an interrupted migration imports only
missing IDs. Every connection closes and enables SQLCipher memory wiping.

Clock regression blocks access and preserves encrypted input. A new admission
must obtain current server contact; cached provider state cannot establish the
retention clock. The persisted high-water mark and native elapsed time prevent
clock rollback or a process restart from extending an existing expiry.
