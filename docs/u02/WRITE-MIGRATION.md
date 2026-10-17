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

The API migration committed separately at `a36130ecd2fdc4fe03d4509124f0b300b8ac3b2f`. This follow-on merges U01's tested helper commit `8ddaba0cd03331c5851ab8103d9de1e7fa6bf923` and uses its unchanged `useDeviceAccessFailure`, `useLocalInputLease`, and `runLocalInputWrite` exports. No cleanup, lease, local-entry, or security-helper implementation is copied or modified.

| Case | Local evidence after the cleanup caller wiring |
| --- | --- |
| Security or provider rejection after an uncertain expense | Covered for all 15 G01 codes plus an unknown future code without a confirmed wipe flag. Payload, category ID, and key stay fixed until acknowledgement. |
| Deterministic accounting rejection | Covered. Only the accounting marker permits clearing pending storage and returning to editing. |
| Confirmed `wipeLocalInput: true` | Setup/category catches and the posting transport report through U01's context. The editor returns immediately when reporting takes ownership. Three flagged-denial tests prove there is no editor-owned delete or sign-out. U01's controller tests cover obscuring, deletion, and official Clerk sign-out. |
| Failed privacy deletion | U01 controller tests cover durable denial, failed deletion, retry, cold-entry cleanup, and failed sign-out without new enrollment. An editor test also preserves its exact key when acknowledgement cleanup fails, then safely retries. Actual SecureStore deletion and process-kill behavior remain runtime acceptance. |
| Save already in flight at revocation | The actual U01 lease fences the posting save. U01 tests drain an active save before wiping and reject later old-lease saves. The editor integration test confirms a denied transport cannot save or start another submission. |
| Old successful post response after new admission | The posting clear also uses the captured lease. The editor integration test resolves an old delayed post after a new lease has saved a new entry; the old clear rejects, the new entry survives, and the old editor shows no Posted banner. U01 tests also reject stale reports against a new admission. |
| Thrown protected-read errors | Guarded queries still throw normally. U01's tested `ProtectedReadBoundary` is inside the admission/local-entry contexts and reports confirmed wipe flags. Router's outer ErrorBoundary is not relied on for privacy cleanup. |

The route captures the exact lease and report callback in its memoized transport. It passes `reportFailure` to `useExpenseEditor`; save and clear call `runLocalInputWrite` with that captured lease. The controller checks reporting before any normal error handling. Setup and category action catches do the same. Restoration and provider updates do not count as user interaction. `PostingForm` and `CategorySheet` remain prop-driven.

These checks use real React hooks, the actual U01 lease implementation, controlled storage callbacks, and controlled provider responses. They establish local behavior, not physical deletion or a real Clerk session transition. No native API or provider call is mocked into a runtime acceptance claim.

## Local receipt and open acceptance

`a36130e` passed 207 tests in 18 files, backend and mobile typechecks, and `git diff --check`. After merging U01's helper and wiring callers, `node scripts/verify-u02.mjs` passes all 230 tests in 20 files and both typechecks. The new accounting boundary suite has 17 focused tests. G01's 18 focused tests also remain green. Existing accounting/category regression tests now exercise the normal registered signed-session public actions. Trusted provisioning is limited to kernel fixtures for multi-workspace and COA-template tests; it is not a deployable function.

No deployment, provider configuration, actual Clerk session write, device interaction, push, or root-checkout edit occurred. G01's tested dependency and U01's tested local-entry commits were merged locally. The adapter commit is separate from IME commit `d1b23f368f0819d3796ae31f69580e2caa68c7b1` and from this separate U01 privacy-hook caller commit.

Current-source exports have no public mutation bypass. The coordinator still owns the separate inventory of previously deployed functions and compatibility review before deployment. Real Clerk signed `sid` exposure, normally authenticated APIs on the named development deployment, live negative/retry/revocation behavior, end-to-end cleanup on actual native storage, and physical local-entry acceptance remain open. Category reclassification, account setup, and SEN-27 multi-category policy remain the earlier explicit product gaps.

## F01 same-admission remount correction

The editor now invalidates pending callbacks synchronously on unmount and checks that lifetime before clearing saved input. The admission lease remains the save/delete fence for confirmed access loss. The additional editor fence covers inactivity lock/unlock and ordinary navigation remounts that reuse a lease. If A is still in flight, a reopened editor can retry A, submit B, lose B's response, and retain B's exact payload and key when A's original acknowledgement arrives. Reopening still restores B for an exact retry.

The [F01 entry-race receipt](../u01/DEVICE_ADMISSION.md#f01-entry-race-corrections-on-ff059e5) records failing-before reproduction, 275 passing tests, both typechecks, and both native exports. Controller cleanup also covers cold identity mismatch and pending enrollment writes. Provider and physical acceptance remain open. The prototype UI, accounting payload, official Clerk cache, and strong biometric policy are unchanged.
