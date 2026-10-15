# Development public scenario contract

`lukapp-live-public-scenario@1` extends the existing development verification
route. Production cannot execute it. Fixture mode cannot execute it. A real
Clerk Session and current native, device and Workspace admission are required.
Each financial step uses `AccessController.execute`, a fresh exact-operation
proof from the installation key, and the same request-scoped authenticated
Convex client as the normal app. The driver has no provider transport seam.

The coordinator supplies approved manifests and independent source/build and
deployment receipts. `coordinatorAssertion.deployedSha` and
`coordinatorAssertion.deploymentReceipt` are assertions carried into the app
receipt. `deploymentIndependentlyVerifiedByDriver` always remains false. A
manifest cannot prove its own deployment. `coordinatorAssertion.appEvidence`
links the exact app source SHA/tree, native artifact SHA-256, independent build
receipt and JS/Metro source receipt. `appBuildIndependentlyVerifiedByDriver` is
also always false. The coordinator must match both evidence sets separately. The configured public URL is fixed
by the normal app configuration. Owner subject is read from the real public
`authConnection.connection` response after admission, without inspecting tokens.

## Closed request structure

The manifest has exactly `contract`, `scenarioId`, `platform`,
`coordinatorAssertion` and `steps`. A step has exactly `id`, `operation`, `args`
and `expect`. Platform must match the current device. Step IDs are unique.
There are at most 100 steps, at most 24 nested input levels and at most one
megabyte of manifest JSON. Validation covers the entire manifest before any
request. An invalid later step cannot permit earlier effects.

`public-contract.json` contains only current registered financial argument
validators and RPC kinds. It excludes device administration, provider lifecycle
and recovery, actions, internal functions and direct table writes. No supplied
Actor, userId, Session ID, access proof or biometric assertion can pass its
argument validators. Signing proof is added only by the controller. The app
imports generated public API references, types and this JSON. It never imports
server handler implementations. The development-only generator reads handler
registration metadata outside the app bundle and never invokes handlers.

Run `pnpm --filter @lukapp/mobile exec vitest run --config dev/export.config.ts`
to detect contract drift. After an approved public API change, regenerate with
`F03_UPDATE_PUBLIC_CONTRACT=1` before that same command, then review its diff.
Keep the mobile TypeScript compiler strict.

An argument may contain `{ "$ref": { "stepId": "earlier", "field": "profileId" } }`.
Only earlier, declared public result fields are available:

| Field | Public source | Allowed argument destination |
| --- | --- | --- |
| workspaceId | Workspace creation/opening or canonical Personal discovery | workspaceId |
| profileId | Profile creation or account setup/opening | financialAccountProfileId, transfer source/destination profile, destinationProfileId, liquidProfileIds |
| journalEntryId | Opening/setup or Expense/Income/Transfer/reversal | entryId, journalEntryId, transferEntryId |
| categoryId | Confirmed category creation | categoryId, userCategoryId, targetCategoryId |
| budgetId | Budget command result | budgetId |
| planId | Draft save or replacement result ID | planId |
| contributionId | Contribution result ID | contributionId |
| proposalId | Allocation proposal result ID | proposalId |
| revisionToken | Public reclassification preview revisionToken only | confirmCategoryReclassification.revisionToken only |

There are no arbitrary paths, array-index references, expressions or code
evaluation. Literal revisions, dates, keys and other command facts remain
coordinator supplied. References never alter a stable idempotency key.

`expect.result` recursively compares literal primitive values and named object
fields. Object expectations are subsets; arrays require exact length/order and
matching values. `expect.returnedId` supports only whole-result Plan,
Contribution or Proposal IDs returned by their corresponding operations.
`expect.errorCode` accepts only the closed domain rejection list in
`expectedDomainErrors`. An exact actual public domain rejection passes that step
and continues. Its catch runs inside the already guarded controller work, after
proof generation and normal RPC, and rechecks admission before returning the
recorded domain outcome. It never catches a proof, native or local failure as an
expected error. Permission, provider, device, Session and membership denials are
excluded; they retain the controller's ordinary blocking/wipe behavior. Transport
failure and local invalidation always stop with assertionPassed false. A failed
assertion, missing result reference, changed access epoch, native mode/generation,
Workspace, disconnect or pending wipe stops all later steps. Re-running a
manifest obtains fresh proofs and preserves its original facts and command keys.
An unknown lost response is retained as a stopped request; it is not success.

## Loopback custody and receipts

The explicit operator tap captures one controller action before loading the
manifest. Component unmount or admission invalidation cancels it irreversibly.
The same guard runs through proof creation and after token acquisition, immediately
before public dispatch. A later ready admission cannot revive an earlier tap.
Cancellation never retries or recalls an already-dispatched request.

The explicit operator button loads the current platform's manifest from
`127.0.0.1:8114` and starts the approved steps once. The loopback service only
serves manifests and records app-reported public outcomes. It does not proxy
Clerk/Convex, run backend handlers or fabricate ledger/effect records.

Start `node apps/mobile/dev/live-scenario-host.mjs IOS_MANIFEST ANDROID_MANIFEST
F03_RECEIPT_DIRECTORY` from the exclusive checkout, supplying exact approved
manifest paths and the existing own F03 receipt directory. Bind Android reverse
8114 only for this explicit session. Preserve own process/argv and source/build
identity separately. The service writes new dated receipts without overwriting
earlier runs. Stop it after verification. Keep simulators off during builds,
source checks and reviews; obtain fresh T3 bindings for concrete UI sessions.

Receipts carry scenario, platform, native protection label, public URL, admitted
Owner subject, Workspace, coordinator assertions, resolved public facts, literal
results, assertion booleans and safe error codes. They contain no SDK token,
private signing key, database key or raw capture. They are runtime evidence
requiring independent source/build/deployment binding, never source approval or
a hardware claim. UI tap journeys remain separate.
