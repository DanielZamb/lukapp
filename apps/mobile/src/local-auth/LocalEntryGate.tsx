import { useAuth, useClerk } from "@clerk/expo";
import { usePathname } from "expo-router";
import {
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ActivityIndicator, AppState, Platform, Text, View } from "react-native";
import { LocalEnrollment } from "./enrollment";
import { LocalInstallation } from "./installation";
import { DeviceAccessFailure, requiresLocalWipe, movedAccessLabel } from "./accessFailure";
import { LocalInput } from "./localInput";
import { clearLocalInput } from "../features/clearLocalInput";
import { LocalEntryInteraction } from "./interaction";
import { EntryController } from "./entryController";
import {
  cancelBiometricPrompt,
  clearBiometricEnrollment,
  enrollBiometry,
  hideFinancialScreen,
  initializeScreenPrivacy,
  readInstallMarker,
  revealFinancialScreen,
  unlockBiometry,
  writeInstallMarker,
} from "./nativeEntry";
import { Header, PrimaryButton, SecondaryButton, Screen, useUi } from "../ui/core";

export function LocalEntryGate({
  children,
  renderSignIn,
}: {
  children: ReactNode;
  renderSignIn: (onSessionCreated: (sessionId: string) => void) => ReactNode;
}) {
  const ui = useUi();
  const { isLoaded, userId, sessionId } = useAuth();
  const clerk = useClerk();
  const clerkRef = useRef(clerk);
  clerkRef.current = clerk;
  const [controller] = useState(
    () =>
      new EntryController({
        now: Date.now,
        readMarker: readInstallMarker,
        writeMarker: writeInstallMarker,
        unlock: unlockBiometry,
        enroll: enrollBiometry,
        signOut: () => clerkRef.current.signOut(),
        initializePrivacy: initializeScreenPrivacy,
        hide: hideFinancialScreen,
        reveal: revealFinancialScreen,
        cancelPrompt: cancelBiometricPrompt,
        clearInput: clearLocalInput,
        clearEnrollment: clearBiometricEnrollment,
      }),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const path = usePathname();
  useEffect(() => {
    if (isLoaded)
      void controller.setIdentity(
        userId && sessionId ? { subject: userId, sessionId } : null,
      );
  }, [controller, isLoaded, userId, sessionId]);
  useLayoutEffect(() => controller.setPath(path), [controller, path]);
  useEffect(() => {
    let state = AppState.currentState;
    let focused = true;
    const update = () =>
      controller.setPresence(
        state === "active",
        focused,
        state === "background",
      );
    update();
    const changes = AppState.addEventListener("change", (next) => {
      state = next;
      update();
    });
    const blur = Platform.OS === "android" ? AppState.addEventListener("blur", () => {
      focused = false;
      update();
    }) : null;
    const focus = Platform.OS === "android" ? AppState.addEventListener("focus", () => {
      focused = true;
      update();
    }) : null;
    const timer = setInterval(controller.tick, 1000);
    return () => {
      clearInterval(timer);
      changes.remove();
      blur?.remove();
      focus?.remove();
      controller.dispose();
    };
  }, [controller]);
  const { state, obscured } = snapshot;
  const lease = controller.unlockedInputLease();
  const report = useCallback((error: unknown) => {
    if (!requiresLocalWipe(error)) return false;
    if (lease) void controller.denyAccessFor(lease, movedAccessLabel(error));
    else if (userId && sessionId) void controller.denyIdentityFor({ subject: userId, sessionId }, movedAccessLabel(error));
    return true;
  }, [controller, lease, userId, sessionId]);
  if (state.kind === "sign-in")
    return <>{state.movedTo && <Text style={ui.body}>Access moved to {state.movedTo}</Text>}{renderSignIn(controller.approveSignIn)}</>;
  if (
    state.kind === "open" &&
    (!controller.isOpenFor(
      userId && sessionId ? { subject: userId, sessionId } : null,
    ) ||
      controller.needsPathUnlock(path))
  )
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  if (state.kind === "open" || state.kind === "admission" || state.kind === "enrolling")
    return (
      <View
        style={{ flex: 1 }}
        onTouchStart={controller.interaction}
        onTouchMove={controller.interaction}
      >
        <View
          style={{ flex: 1, opacity: obscured ? 0 : 1 }}
          pointerEvents={obscured ? "none" : "auto"}
          importantForAccessibility={obscured ? "no-hide-descendants" : "auto"}
          accessibilityElementsHidden={obscured}
        >
          <LocalEntryInteraction.Provider value={controller.interaction}>
            <LocalInstallation.Provider value={controller.admissionInstallId()}>
              <LocalInput.Provider value={lease}>
                <DeviceAccessFailure.Provider value={report}>
                  <LocalEnrollment.Provider value={{ ready: state.kind === "open", ensure: controller.ensureEnrollment }}>
                    {children}
                  </LocalEnrollment.Provider>
                </DeviceAccessFailure.Provider>
              </LocalInput.Provider>
            </LocalInstallation.Provider>
          </LocalEntryInteraction.Provider>
        </View>
        {obscured && (
          <View
            style={[
              ui.screen,
              { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
            ]}
          />
        )}
      </View>
    );
  return (
    <Screen>
      <Header
        title={
          state.kind === "revocation"
            ? state.movedTo ? `Access moved to ${state.movedTo}` : "Device access ended"
            : state.kind === "reauthentication"
            ? "Sign in again"
            : state.kind === "unavailable"
              ? "Local protection unavailable"
              : "Lukapp is locked"
        }
      />
      {state.kind === "revocation" && (
        <>
          <Text style={ui.body}>
            {state.cleanup === "running"
              ? "Removing local input and signing out…"
              : "Local cleanup could not finish. Your information stays locked."}
          </Text>
          {state.cleanup === "running" ? <ActivityIndicator /> : (
            <PrimaryButton label="Retry cleanup" onPress={() => void controller.retryCleanup()} />
          )}
        </>
      )}
      {state.kind === "locked" && (
        <>
          <Text style={ui.body}>
            Use strong biometrics to open your financial information.
          </Text>
          <PrimaryButton
            label="Unlock Lukapp"
            onPress={() => void controller.unlock()}
          />
          <SecondaryButton
            label="Sign in instead"
            onPress={() => void controller.reauthenticate()}
          />
        </>
      )}
      {state.kind === "reauthentication" && (
        <>
          <Text style={ui.body}>
            Complete Clerk sign-in, then set up strong biometric re-entry.
            Device PIN and weak biometrics cannot unlock Lukapp.
          </Text>
          <PrimaryButton
            label="Sign in again"
            onPress={() => void controller.reauthenticate()}
          />
        </>
      )}
      {state.kind === "unavailable" && (
        <Text style={ui.body}>
          Your information stays locked. Close and reopen the app after checking
          device security and storage.
        </Text>
      )}
      {(state.kind === "checking" || state.kind === "authenticating") && (
        <>
          <ActivityIndicator />
          <Text style={ui.body}>
            {state.kind === "authenticating"
              ? "Confirming biometrics…"
              : "Checking local protection…"}
          </Text>
        </>
      )}
    </Screen>
  );
}
