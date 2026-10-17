# U01 local entry protection

The original ADR-0080 and `docs/research/mobile-access-device-loss-controls.md` govern this change. Clerk remains the authentication, session, and recovery authority. The app keeps the official `@clerk/expo/token-cache` unchanged. Local biometric success opens the mobile UI; it does not grant server access or register a device.

## Implemented behavior

`LocalEntryGate` sits inside Clerk and outside `ConvexProviderWithClerk`. Protected providers, queries, native sheets, and routes mount only after local entry succeeds. Cold entry always starts locked. Ordinary foreground inactivity and background time each have a two-minute limit. `/month-close` has a ten-minute foreground window and the same two-minute background limit. Leaving focus hides financial content immediately. Short background visits preserve the remaining foreground inactivity allowance. Entering `/settings` requires another unlock; the same local route rule covers future `/devices`, `/sessions`, `/security`, and `/export` destinations.

The root records touches and scrolling. `useLocalEntryInteraction()` returns a callback for input owners to call on keyboard edits, which do not bubble through root touches. U02 owns that wiring in setup, posting, and category handlers. Independent presentation fixtures can render outside the gate.

A strong native biometric prompt precedes reading an app-only SecureStore enrollment sentinel. Android explicitly requests Class 3 biometry. Device passcode fallback is disabled; the iOS fallback button is hidden. The sentinel uses `requireAuthentication: true`, a dedicated keychain service, and `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Ordinary unlock only reads it. A missing or invalidated value, cancellation, lockout, unavailable hardware, or unavailable strong enrollment requires full Clerk sign-in. The gate stays closed if strong biometry remains unavailable after sign-in.

A successful explicit Clerk sign-in flow identifies the newly created session before activation. The gate then requires a deliberate **Unlock Lukapp** action to provision a new biometric-bound sentinel. It never silently replaces an invalidated sentinel during ordinary unlock. Enrollment failure does not delete financial input.

The nonsecret install marker lives in the app's cache container, which is excluded from backup. It contains a random install ID and either a sign-in-required state or the enrolled Clerk subject and session ID. A missing, malformed, or unsupported marker requires sign-in. If Clerk rehydrates a surviving Keychain session on such an install, the gate blocks access and calls the official Clerk sign-out method before accepting new sign-in. If that fails, the app remains locked. Cache eviction conservatively behaves like reinstall. The marker and sentinel contain no Clerk token, provider secret, or independent bearer credential.

The controller rejects late biometric completions after background interruption, identity change, or teardown. Clock rollback also locks access. Security-route and identity guards hide children during render before their effects can run.

## Screen privacy and native configuration

Android starts with `FLAG_SECURE`. The checked-in config plugin adds native `onPause` and window-focus protection before the JavaScript lifecycle notification. While locked or away, the JavaScript gate hides the content and requests capture prevention. After active unlock it allows deliberate screenshots. Android application backup is disabled.

On iOS, Expo's native app-switcher privacy overlay is enabled before financial content mounts. Unlocked screenshots remain available. The generated iOS Info.plist contains the Face ID purpose string. Version `0.1.0` now has Android version code `2` and iOS build number `2`, distinguishing the new native modules from the earlier client.

The native dependencies are Expo SDK 55's `expo-local-authentication`, `expo-screen-capture`, and `expo-file-system`. The official Clerk config plugin is included. Both platforms pass native prebuild without installation. The Expo-generated `.expo/types/**/*.ts` include and generated ignore file are retained.

## Local checks

`pnpm test` passes 136 tests, including 25 focused controller/native-adapter tests. `pnpm typecheck` passes for backend and mobile. Hermes exports pass for iOS and Android. Tests exercise install-marker parsing and reset, cold entry, precise lock deadlines, foreground interaction, Month Close timing, background privacy, fresh security-route entry, sentinel invalidation, full sign-in and reprovision, strong-only options, cancellation, unavailable hardware, stale completions, and privacy failures. Native calls use fixtures in those tests. They provide no hardware or real-Clerk acceptance evidence.

Native prebuild logs are `/tmp/u01-entry-prebuild.log` and `/tmp/u01-entry-ios-prebuild.log`. Other logs are `/tmp/u01-entry-tests.log`, `/tmp/u01-entry-types.log`, and `/tmp/u01-entry-export.log`.

## Remaining checks and ownership

No device was driven or installed, no Metro process was restarted, and no deployment or provider configuration was changed. Real strong-biometry admission, enrollment-set changes, OS lockout, app-switcher snapshot timing, unlocked screenshots, reinstall with surviving iOS Keychain data, accessibility privacy, and physical-device behavior remain unverified. iOS native compilation remains open.

G01 owns thin verified-Clerk-sid registration, revocation checks, and the exact server helpers. Those helpers are not guessed or wired here. Revocation-driven input deletion, SQLCipher input storage, backup/transfer evidence for that store, input retention, email recovery, older-session revocation, and remote-device behavior remain outside this local gate. U02 owns input activity integration. Those open items must be checked in the integrated real-provider/device flow before ticket acceptance.

## Primary implementation references

- [Expo SDK 55 LocalAuthentication](https://docs.expo.dev/versions/v55.0.0/sdk/local-authentication/)
- [Expo SDK 55 SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/)
- [Expo SDK 55 ScreenCapture](https://docs.expo.dev/versions/v55.0.0/sdk/screen-capture/)
- [Expo SDK 55 FileSystem](https://docs.expo.dev/versions/v55.0.0/sdk/filesystem/)
- [Clerk Expo quickstart and official cache](https://clerk.com/docs/expo/getting-started/quickstart)
- [Android sensitive activity protection](https://developer.android.com/security/fraud-prevention/activities)
