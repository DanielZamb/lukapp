# U01 local handoff

This slice targets L1 on `frontend/u01-first-expense-20261017`, based on `fcb3065858de587734829d34ca4a6b4cb8d28d9e`. The source identifier is the commit containing this file, obtained with `git rev-parse HEAD`. App identity is `com.lukapp.u01.dev`, version `0.1.0`, iOS build `1`, Android version code `1`. Expo SDK 55 and React Native 0.83.10 are pinned in the lockfile.

Local checks passed: `pnpm test` with 111 tests, `pnpm typecheck` for backend and mobile, and native Hermes exports for iOS and Android. These are local regression and bundle evidence. The original L1 checkpoint had no native binary. The correction now has an Android debug APK, recorded below. Installation, actual Clerk admission, deployed source match, and UI acceptance remain open. CocoaPods was absent. Installing it through Homebrew failed with `undefined method '[]' for nil` in `Utils::Bottles.load_tab`. Native prebuild completed without installing pods. No simulator was opened or driven.

The coordinator owns integration and development deployment. No production work, deployment, push, environment update, or device interaction occurred here. `convex codegen` generated local bindings using its documented read-only analysis operation. Its progress text includes “Uploading functions”; the CLI codegen implementation explicitly sets a dry run and does not deploy source.

## Build the development app

From this checkout, run:

```sh
pnpm install --frozen-lockfile
node scripts/mobile-env.mjs /Users/zambamon/Work/finance-tracker-v2/.env.local
pnpm test
pnpm typecheck
pnpm --filter @lukapp/mobile exec expo export --platform ios --platform android --output-dir dist
```

The environment script reads only the public Clerk publishable key and writes that key with the named development Convex URL into the ignored mobile `.env.local`. It never copies the local owner allowlist, server keys, or deployment credentials. Preserve the deployed `LUKAPP_OWNER_CLERK_SUBJECT`; the parent reported that it differs from root local configuration.

With Xcode and CocoaPods installed, build an iOS development client:

```sh
pnpm --filter @lukapp/mobile exec expo prebuild --platform ios --no-install
cd apps/mobile/ios
pod install
cd ../../..
pnpm --filter @lukapp/mobile ios
```

Alternatively, with the Android SDK and JDK configured, run `pnpm --filter @lukapp/mobile android`. These run commands build and launch a development client. The coordinator must authorize and handle device interaction under the current restrictions. For an existing development client, `pnpm mobile` starts Metro. Google sign-in uses `lukapp-u01://oauth-callback`; permit this redirect for the development Clerk application. Enable Google and the Clerk Convex integration with JWT application ID `convex`. No secret key belongs in the mobile app.

## Exercise the real flow after integration

The coordinator first records the integrated SHA, deployed source identifier, development URL `https://compassionate-opossum-63.convex.cloud`, native build identifier, OS, and device. The deployment contains additional device/provider functions absent from main. Reconcile that scope before deploying this checkout, preserving the existing protections and allowlist.

1. Start the development client with the public environment above. Tap **Continue with Google** and complete real Clerk sign-in. The app waits for Convex token validation, then calls `authConnection.connection({})`. Record the observed `owner` result. A fabricated token or CLI identity override does not qualify.
2. For an owner without a canonical defaults record, the first-run native sheet presents four answers. Categories is fixed at **Start without categories**, purchase alerts at **Not now**. Choose COP, leave the starting amount at zero, and tap **Start tracking**. Personal and My money are created silently in one mutation. A positive starting amount posts an opening entry atomically instead. Existing canonical setup bypasses this sheet.
3. On Home, tap the spending amount, then **Post money**. Enter `-1.500,00`, a description such as `U01 groceries`, and the date cash moved. My money is the place; Category is **No category**. Tap **Post**.
4. Observe the compact **Posted** banner and **Done** on Post money. The acknowledged amount and description clear, and the editor stays open. **Done** dismisses the banner without navigation. Go back, tap the Home amount, then **My money**. From a zero starting balance, expect `−COP 1.500,00`. The new row shows the description, date, Expense, and `−COP 1.500,00`. Reload or relaunch, open Overview and My money, and verify the same balance and row. Home month spend increases by 150,000 minor units if the date is in the current month.
5. Record expected and observed values and the actual admitted subject privately. Repeat with an existing opening balance and compare against that baseline rather than assuming zero.

All values come from Posted Journal Lines. Home, Overview, and My money consume the same reactive `accounting.postedActivity` API. The adapter calls the existing ledger balances and journal queries within one Convex read snapshot. No local balance increment or optimistic entry supplies financial truth.

## Normal public requests and replay checks

Use the ordinary authenticated Convex client from the real Clerk session. `ConvexProviderWithClerk` requests the Clerk Convex token. No accounting endpoint accepts an actor or server-clock override.

```ts
const admission = await client.query(api.authConnection.connection, {});
const existing = await client.query(api.accounting.personalDefaults, {});
const defaults = existing ?? await client.mutation(api.accounting.ensurePersonalDefaults, {
  functionalCurrency: "COP", startingMinorUnits: 0,
});
const payload = {
  workspaceId: defaults.workspace.id,
  financialAccountProfileId: defaults.financialAccountProfile.id,
  amount: { currency: "COP", minorUnits: 150000 },
  accountingDate: "2026-10-17", // Use the actual cash-movement date.
  description: "U01 groceries",
  idempotencyKey: "u01-real-session-unique-run-id",
};
const posted = await client.mutation(api.accounting.recordCashExpense, payload);
const replay = await client.mutation(api.accounting.recordCashExpense, payload);
const activity = await client.query(api.accounting.postedActivity, {
  workspaceId: defaults.workspace.id, month: "2026-10",
});
const balance = await client.query(api.accounting.balances, {
  workspaceId: defaults.workspace.id,
});
```

Expect the replay to have the same entry ID and `replay: true`, with one entry and one balance movement. Reuse a run key only with the identical payload. A changed description or amount under that key must return `idempotency_key_conflict`. Concurrent first setup calls with identical answers must return identical IDs, one membership, one profile, and at most one opening. Changed setup answers return `setup_conflict`. No automatic setup occurs on sign-in or in presentation components.

The editor writes the complete pending payload and key to SecureStore before submitting. A network interruption keeps the payload fixed for retry, including across a relaunch. Successful posting clears it. A definitive Convex rejection clears it for correction. If confirmation succeeds but local cleanup fails, retrying the saved payload returns the same posting. Sign-out never submits a pending expense. The device's Clerk subject scopes local pending storage; it is never an API actor argument.

Check every public accounting operation signed out and with a different real Clerk user, including the new defaults and activity operations. Expect `authentication_required` or `owner_required`, and no unauthorized reads or writes. `authConnection.connection({})` remains available and returns `signed-out` or `not-owner`. Also send forged `userId` arguments to every endpoint through a raw normal public request. The validators must reject extra arguments, even when the actual caller is the owner. Verify the server clock cannot be overridden with `now`.

With a real owner, reject a nonexistent workspace, a profile from another workspace, currency mismatch, zero, negative or fractional minor units, an impossible date, and an expense in a locked period. Compare entry counts and balances before and after. Perform lock/reversal checks in isolated development records; do not lock a user's active month merely to run the pilot.

## Sources and remaining gaps

The native token file is copied byte-for-byte from the independently matched original prototype export at commit `8c1e2ea62db29398b23620a222be0ee23640d9d1`. The reviewed HTML, `sen27-post-money-one.png`, `ios-home.png`, SEN-6 Aug 28 decision, and SEN-39 shared-component resolution govern the UI. Proposed contrast fixes are not applied. No failed PR5 implementation, contracts, or acceptance claims were reused.

The only root untracked source adopted is `convex/auth.config.ts`, after inspection of its issuer/application-ID purpose. `authConnection.ts` preserves the inspected three-state contract while sharing admission logic with the new wrappers. No root edits or environment files were staged or modified.

Open runtime/security checks include real Clerk admission, deployed source identity, SEN-11/SEN-68 session/device revocation, biometric gates, physical-device behavior, and current device-closure restrictions. This slice does not replace the deployed device subsystem. Owner admission alone does not satisfy those security tickets.

Categories and category creation, Notification Intake, Drafts, Batch, Plans, purchase alerts, full history pagination/indexes, the level-one door, and device theme settings remain outside this pilot. Home preserves their visual locations with non-actionable “Coming later” content. Only COP and USD are offered in setup. The activity query currently uses the existing complete ledger reads; it is suitable for this first-expense slice, not acceptance of SEN-44's full paginated history. Final native UI fidelity remains open until the parent drives the development build. These gaps do not represent completed ticket acceptance.


## Posting correction

`PostingForm.tsx` is a presentation-only component. It imports native UI, icons, and semantic tokens, with values and callbacks supplied through `PostingFormProps`. It has no provider, router, storage, parsing, or mutation effects. `useExpenseEditor.ts` owns acknowledgement and retry state. `app/post.tsx` supplies the real provider transport and native sheets. A successful acknowledgement clears the editor and pending record, then shows Posted plus Done on the same form. Done dismisses only that banner.

The One/Batch pill track and Normal/Initial balance/Transfer chips follow the SEN-27 fixture. Batch, Initial balance, Transfer, and Category are deferred; no category module or picker is implemented here.

`PostingForm.fixtures.ts` supplies empty and acknowledged values for independent layout inspection under a UI-only host. Supply callbacks from that host; no authentication or accounting provider is required to render the form. Local correction checks cover acknowledgement reset, Done dismissal, a new entry with a new key, retry of an uncertain response, restoration, and double-submit protection.


## Android build receipt

The posting correction is committed at `dc90360b99a4e38f79320d6e6b3c64ea9dc7a9ef`. At that clean source commit, Android prebuild and native debug assembly both exited zero. The build ran with the installed Android SDK, JDK 21.0.10 from Android Studio, Gradle 9.0.0, build tools 36.0.0, compile SDK 36, and NDK 27.1.12297006.

From the repository root, reproduce the build without device interaction:

```sh
node scripts/mobile-env.mjs /Users/zambamon/Work/finance-tracker-v2/.env.local
pnpm --filter @lukapp/mobile exec expo prebuild --platform android --no-install
cd apps/mobile/android
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ANDROID_HOME='/Users/zambamon/Library/Android/sdk' ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --console=plain
```

The artifact is `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` in the U01 worktree. SHA-256 is `82fe673bb664148852874431336aa411431722bdc48e263f63d0fd4f65e6a30b`. `aapt dump badging` confirms `com.lukapp.u01.dev`, version `0.1.0`, version code `1`, debuggable, minimum SDK 24, target SDK 36, and `arm64-v8a` native code. Build log: `/tmp/u01-android-build.log`. Prebuild log: `/tmp/u01-android-prebuild.log`.

This development client loads JavaScript from Metro. Start Metro from the same source checkout with `pnpm mobile`. The matching iOS and Android Hermes exports passed, along with 111 regression tests and both typechecks. Native library compilation does not verify Clerk admission or the UI journey. No APK installation, device launch, deployment, allowlist change, or production action occurred. iOS native build, real-provider acceptance, and the previously listed security/device gaps remain open.
