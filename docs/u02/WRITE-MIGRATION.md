# Protected write migration inventory

This migration starts at U02 commit `d58ca5d` and consumes tested G01 commit `f4e66c5d8da9f6d24465c92fe32399a5e0a9e9f2`. G01 owns the security helpers and schema. U02 owns accounting adapters, their internal handlers and tests, and the native write callers. U01 owns native admission and local entry.

All nine public write names are now actions. Eight call `verifyCurrentSession(ctx.auth)`, then their corresponding internal mutation in `accountingWrites.ts`. Each internal mutation validates `session: liveSession` and checks current authority before invoking the unchanged core command. Raw `createPersonalWorkspace` verifies the live admitted Owner and always returns `workspace_creation_disabled`. There are no public mutation exports in the current checkout.

| Public endpoint | Write effect | Authorization scope | Native caller |
| --- | --- | --- | --- |
| `createPersonalWorkspace` | Workspace, Owner membership, initial accounts and period | Publicly denied. Self-service workspace creation is forbidden. | None |
| `ensurePersonalDefaults` | Canonical workspace, membership, categories, My money, opening entry | `requirePersonalSetup`: registered sole-Owner bootstrap, then `workspace:admin` on existing canonical setup. Categories and opening posting stay inside this transaction. | `Setup.tsx` |
| `createFinancialAccountProfile` | Profile and its posting account | Current workspace membership and `workspace:admin` | None |
| `lockAccountingPeriod` | Period lock and decision record | Current workspace membership and `period:lock` | None |
| `recordCashExpense` | Posted expense and lines | Current workspace membership and `accounting:post` | `app/post.tsx` |
| `recordCashIncome` | Posted income and lines | Current workspace membership and `accounting:post` | None |
| `reversePostedEntry` | Appended reversal entry and lines | Current workspace membership and `accounting:correct` | None |
| `createUserCategory` | Category record, or account-door response without writes | Current workspace membership and `category:manage` | `useCategoryPicker.ts` |
| `restyleUserCategory` | Category style | Current workspace membership and `category:manage` | `useCategoryPicker.ts` |

The existing reactive read functions stay queries with their local current guards. The migration adds no challenge or attestation API. Category identity stays in the saved expense payload, and retry uses the same accounting idempotency key.

G01 security helpers and schema are unchanged by this migration. Shared business argument validators live in `accountingValues.ts`; public arguments never accept a session observation, actor, `sid`, or device credential. Only internal arguments include the server-produced observation. All native write callers use `useAction` with the same business payloads.

## Negative and retry evidence

The action boundary rejects anonymous or unadmitted identities, missing signed `sid`, inactive or mismatched Clerk sessions, and failed live-session verification before any write. Internal mutation tests independently reject stale or mismatched session observations. The action tests exercise missing or revoked devices and missing current membership. A revoke or membership removal between live verification and the mutation prevents the write. The schema admits only Owner memberships. Real-handler spies retain the real guards and verify each operation's exact permission; G01's role-policy tests deny every other role for all six permissions.

Bootstrap tests distinguish first setup from an existing canonical setup retry. Membership removal denies the retry and cannot create a second workspace. Raw workspace creation is denied even for a registered live Owner.

The expense tests preserve category ID and idempotency key through an uncertain response, a subsequent security rejection, and a successful retry. A guard rejection does not prove that a prior timed-out request failed to post. An exact replay still returns the original entry, and a changed category under the same key still returns `idempotency_key_conflict`.

The inventory test enumerates actual exported accounting actions and internal handlers, then inspects every loaded Convex module and fails if any public mutation reappears. Tests for category classification, fallback routing, setup atomicity, and Posted/Done behavior remain regression evidence alongside the security tests.


## Normal public API flow

The app retains its Clerk SDK and Convex provider integration. U01 owns strong local unlock, named-device admission, and privacy cleanup. These calls describe the normal contract, not a live acceptance receipt.

1. After real Clerk sign-in and local unlock, call reactive `deviceAccess.status({})`. If unregistered, call `deviceAccess.register({ platform, installId, label, appVersion })` with the existing nonsecret install marker. The backend reads the signed `sid` itself.
2. Read `accounting.personalDefaults({})`. A registered admitted Owner without defaults receives `null`.
3. Call `accounting.ensurePersonalDefaults({ functionalCurrency, startingMinorUnits, categories })` as an action. Its internal mutation calls `requirePersonalSetup` once and preserves atomic setup. Once defaults exist, the same guard also requires current membership and `workspace:admin`.
4. Query `listCategoryPresets`, `suggestCategoryNature`, and `listUserCategories` as before. Static reference queries require a registered device; workspace data queries require `workspace:read`.
5. Create or restyle a category with `client.action(api.accounting.createUserCategory, { workspaceId, selection })` or `client.action(api.accounting.restyleUserCategory, { workspaceId, categoryId, style })`.
6. Save the expense's unchanged business payload, including optional `userCategoryId` and its stable `idempotencyKey`. Submit with `client.action(api.accounting.recordCashExpense, payload)`. No security fields enter local storage or public arguments.
7. After acknowledgement, show **Posted** on the same page. **Done** dismisses only the banner. Read category names and balances through the existing reactive `postedActivity` query.

Every action first verifies the current signed Clerk session against the provider. The internal transaction binds that observation to signed identity and provider client, then checks local revocation, registration, membership, and the named permission. Local query guards do not call the provider. A Clerk-external revocation retains the documented short JWT propagation window. A local revocation is checked against current Convex state.

## Error classification and privacy handoff

`accountingErrors.run` marks only caught core `AccountingError` values with `data.kind: "accounting"`, retaining the existing `code` and `message`. Guards run before core calls. Their errors pass through without the accounting marker. Setup's explicit setup-conflict errors also retain their existing code.

The editor clears uncertainty only after an acknowledgement or an explicitly marked accounting rejection. All G01 security codes, unknown future guard codes, framework validation failures, and transport failures retain the exact saved expense payload and key. This avoids a replacement submission when a previous timed-out action may already have posted. Domain rejection still allows an ordinary correction and resubmission under the existing policy.

U01 is supplying tested `useDeviceAccessFailure`, `useLocalInputLease`, and `runLocalInputWrite` helpers separately. Their hookup is a follow-on commit if that tested helper is pending when this API migration commits. No substitute cleanup or lease implementation is added here.

| Case | Evidence at this API migration |
| --- | --- |
| Security or provider rejection after an uncertain expense | Covered for all 15 G01 codes plus an unknown future code. Payload, category ID, and key stay fixed until acknowledgement. |
| Deterministic accounting rejection | Covered. Only the accounting marker permits clearing pending storage and returning to editing. |
| Confirmed `wipeLocalInput: true` | U01 cleanup-hook wiring remains pending here. The API emits the original flags. This commit alone does not establish lock, deletion, or sign-out behavior. |
| Failed privacy deletion | Pending U01 helper and integration tests. Admission must stay locked while deletion cannot complete. No claim of successful privacy cleanup is made. |
| Save already in flight at revocation | Pending U01 lease helper and follow-on wiring. Cleanup must invalidate the old lease synchronously, drain old writes, then delete. |
| Old successful post response after new admission | Pending lease-fenced `clear` as well as `save`. An old response must not clear a new admission's pending expense. U01 was notified of this requirement. |
| Thrown protected-read errors | Guarded query responses are covered locally; U01 owns ErrorBoundary privacy handling. |

## Local receipt and open acceptance

`node scripts/verify-u02.mjs` passes all 207 tests in 18 files, backend and mobile typechecks, and `git diff --check`. The new accounting boundary suite has 17 focused tests. G01's 18 focused tests also remain green. Existing accounting/category regression tests now exercise the normal registered signed-session public actions. Trusted provisioning is limited to kernel fixtures for multi-workspace and COA-template tests; it is not a deployable function.

No deployment, provider configuration, actual Clerk session write, device interaction, push, or root-checkout edit occurred. G01's tested dependency and U01's tested local-entry commits were merged locally. The adapter commit is separate from IME commit `d1b23f368f0819d3796ae31f69580e2caa68c7b1` and from the pending U01 privacy-hook wiring.

Current-source exports have no public mutation bypass. The coordinator still owns the separate inventory of previously deployed functions and compatibility review before deployment. Real Clerk signed `sid` exposure, normally authenticated APIs on the named development deployment, live negative/retry/revocation behavior, native cleanup/lease integration, and physical local-entry acceptance remain open. Category reclassification, account setup, and SEN-27 multi-category policy remain the earlier explicit product gaps.
