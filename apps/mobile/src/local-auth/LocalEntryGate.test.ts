import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { InstallMarker } from "./installMarker";
import type { AppStateStatus } from "react-native";

type DeviceStatus = Pick<import("convex/server").FunctionReturnType<typeof import("../features/api").api.deviceAccess.status>, "status" | "wipeLocalInput"> & {
  deviceId?: string;
  existingLabel?: string;
  movedTo?: string;
  occupier?: { deviceId: string; sessionId: string; label: string; lastSeenAt: number };
};

const sdk = vi.hoisted(() => ({
  identity: ((): { userId: string | null; sessionId: string | null; isLoaded: boolean } => ({ userId: "owner", sessionId: "session", isLoaded: true }))(),
  session: ((): { id: string; status: string; currentTask: null } | null => null)(),
  nativeFlow: { isLoaded: true, isAuthFlowComplete: false },
  marker: ((): InstallMarker => ({ version: 1, installId: "497af871-e049-4102-b496-4cd529cf60b6", kind: "enrolled", subject: "owner", sessionId: "session" }))(),
  status: ((): DeviceStatus => ({ status: "unregistered", wipeLocalInput: false }))(),
  register: vi.fn(async (_args: unknown) => "registered-id"),
  replace: vi.fn(async (_args: unknown) => "replacement-id"),
  clearInput: vi.fn(async (_subject: string) => {}),
  clearEnrollment: vi.fn(async () => {}),
  recordActivity: vi.fn(async (_args: unknown) => null),
  signOut: vi.fn(async () => {}),
  setActive: vi.fn(async (_args: { session: string }) => {}),
  unlock: vi.fn(async () => {}),
  enroll: vi.fn(async () => {}),
  writeMarker: vi.fn(async (_marker: InstallMarker) => {}),
  platform: "ios",
  path: "/",
  listeners: new Map<string, (state: AppStateStatus) => void>(),
  addEventListener: vi.fn((event: string, listener: (state: AppStateStatus) => void) => {
    sdk.listeners.set(event, listener);
    return { remove: () => sdk.listeners.delete(event) };
  }),
  cancelPrompt: vi.fn(async () => {}),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => sdk.identity,
  useSession: () => ({ session: sdk.session }),
  useClerk: () => ({ signOut: sdk.signOut, setActive: sdk.setActive }),
}));
vi.mock("@clerk/expo/native-components", () => ({
  useAuthViewState: () => sdk.nativeFlow,
  AuthView: () => createElement("div", { className: "native-auth" }),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("convex/react", () => ({
  useQuery_experimental: () => ({ status: "success", data: sdk.status }),
  useAction: (action: typeof api.deviceAccess.register | typeof api.deviceAccess.replace | typeof api.deviceAccess.recordActivity) => {
    const name = getFunctionName(action);
    return name === "deviceAccess:recordActivity" ? sdk.recordActivity : name === "deviceAccess:replace" ? sdk.replace : sdk.register;
  },
}));
vi.mock("expo-constants", () => ({ default: { nativeAppVersion: "0.1.0" } }));
vi.mock("expo-router", () => ({ usePathname: () => sdk.path }));
vi.mock("react-native", () => ({
  ActivityIndicator: "spinner", Text: "text", View: "view", TextInput: "input",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  Platform: { get OS() { return sdk.platform; } },
  AppState: { currentState: "active", addEventListener: sdk.addEventListener },
}));
vi.mock("./nativeEntry", () => ({
  readInstallMarker: async () => sdk.marker,
  writeInstallMarker: sdk.writeMarker,
  unlockBiometry: sdk.unlock,
  enrollBiometry: sdk.enroll,
  clearBiometricEnrollment: sdk.clearEnrollment,
  cancelBiometricPrompt: sdk.cancelPrompt,
  initializeScreenPrivacy: async () => {},
  hideFinancialScreen: async () => {},
  revealFinancialScreen: async () => {},
}));
vi.mock("../features/clearLocalInput", () => ({ clearLocalInput: sdk.clearInput }));
vi.mock("../ui/core", async () => ({
  Header: "header", Screen: "screen", PrimaryButton: "button", SecondaryButton: "button",
  useUi: (await import("../ui/themeContext")).useUi,
  useTheme: () => ({ mutedForeground: "#666" }),
}));
import { DeviceAdmissionGate } from "../device-admission/DeviceAdmissionGate";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "../features/api";
import { LocalEntryGate } from "./LocalEntryGate";
import { PrebuiltSignIn } from "./PrebuiltSignIn";
import { ThemeProvider, useThemeContext } from "../ui/themeContext";

let root: ReactTestRenderer | undefined;
function FinancialScreen() { return createElement("div"); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  sdk.setActive.mockReset().mockResolvedValue(undefined);
  sdk.platform = "ios";
  sdk.identity = { userId: "owner", sessionId: "session", isLoaded: true };
  sdk.session = null;
  sdk.nativeFlow = { isLoaded: true, isAuthFlowComplete: false };
  sdk.marker = { version: 1, installId: "497af871-e049-4102-b496-4cd529cf60b6", kind: "enrolled", subject: "owner", sessionId: "session" };
  sdk.status = { status: "unregistered", wipeLocalInput: false };
  sdk.path = "/";
  sdk.listeners.clear();
});

test.each(["ios", "android"])("%s keeps the session unlocked through profile navigation and live theme changes", async platform => {
  sdk.platform = platform;
  function ProfileRoute() {
    const { mode, setMode } = useThemeContext();
    return createElement("div", {
      path: sdk.path,
      mode,
      onDark: () => setMode("dark"),
      onLight: () => setMode("light"),
    });
  }
  function App() {
    return createElement(ThemeProvider, null, createElement(LocalEntryGate, {
      children: createElement(ProfileRoute),
      renderSignIn: () => createElement("sign-in"),
    }));
  }
  await act(async () => { root = create(createElement(App)); });
  if (!root) throw new Error("Gate not mounted");
  await act(async () => root?.root.findByProps({ label: "Unlock Lukapp" }).props.onPress());
  expect(root.root.findByType("div").props.path).toBe("/");
  await act(async () => {
    sdk.path = "/settings";
    root?.update(createElement(App));
  });
  expect(root.root.findByType("div").props.path).toBe("/settings");
  await act(async () => root?.root.findByType("div").props.onDark());
  expect(root.root.findByType("div").props.mode).toBe("dark");
  await act(async () => root?.root.findByType("div").props.onLight());
  expect(root.root.findByType("div").props.mode).toBe("light");
  await act(async () => {
    sdk.path = "/";
    root?.update(createElement(App));
  });
  expect(root.root.findByType("div").props.path).toBe("/");
  expect(sdk.unlock).toHaveBeenCalledOnce();
  expect(sdk.enroll).not.toHaveBeenCalled();
  expect(sdk.signOut).not.toHaveBeenCalled();
  expect(sdk.cancelPrompt).not.toHaveBeenCalled();
});

test.each(["ios", "android"])("%s registers only supported AppState events and removes them on unmount", async platform => {
  sdk.platform = platform;
  await act(async () => {
    root = create(createElement(LocalEntryGate, {
      children: createElement(FinancialScreen),
      renderSignIn: () => createElement("sign-in"),
    }));
  });
  expect(sdk.addEventListener.mock.calls.map(([event]) => event)).toEqual(
    platform === "android" ? ["change", "blur", "focus"] : ["change"],
  );
  await act(async () => root?.unmount());
  root = undefined;
  expect(sdk.listeners.size).toBe(0);
});

test.each(["ios", "android"])("%s backgrounding during unlock cancels the prompt and rejects late success", async platform => {
  sdk.platform = platform;
  let finishUnlock = () => {};
  sdk.unlock.mockImplementationOnce(() => new Promise<void>(resolve => { finishUnlock = resolve; }));
  await act(async () => {
    root = create(createElement(LocalEntryGate, {
      children: createElement(FinancialScreen),
      renderSignIn: () => createElement("sign-in"),
    }));
  });
  if (!root) throw new Error("Gate not mounted");
  await act(async () => { void root?.root.findByProps({ label: "Unlock Lukapp" }).props.onPress(); });
  expect(sdk.unlock).toHaveBeenCalledOnce();
  await act(async () => {
    sdk.listeners.get("change")?.("inactive");
    if (platform === "android") {
      sdk.listeners.get("blur")?.("inactive");
      sdk.listeners.get("focus")?.("inactive");
    }
  });
  expect(sdk.cancelPrompt).not.toHaveBeenCalled();
  await act(async () => sdk.listeners.get("change")?.("background"));
  expect(sdk.cancelPrompt).toHaveBeenCalledOnce();
  expect(root.root.findAllByType(FinancialScreen)).toHaveLength(0);
  await act(async () => {
    sdk.listeners.get("change")?.("active");
    finishUnlock();
  });
  expect(root.root.findAllByType(FinancialScreen)).toHaveLength(0);
  expect(root.root.findAllByProps({ label: "Sign in again" })).toHaveLength(1);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

test("the locked screen offers Sign in instead beside Unlock Lukapp and invokes Clerk reauthentication", async () => {
  await act(async () => {
    root = create(createElement(LocalEntryGate, {
      children: createElement(FinancialScreen),
      renderSignIn: () => createElement("sign-in"),
    }));
  });
  if (!root) throw new Error("Gate not mounted");
  expect(root.root.findAllByType(FinancialScreen)).toHaveLength(0);
  expect(root.root.findAllByProps({ label: "Unlock Lukapp" })).toHaveLength(1);
  const signIn = root.root.findByProps({ label: "Sign in instead" });
  await act(async () => signIn.props.onPress());
  expect(sdk.signOut).toHaveBeenCalledOnce();
  expect(sdk.writeMarker).toHaveBeenCalledExactlyOnceWith({
    version: 1, installId: "497af871-e049-4102-b496-4cd529cf60b6", kind: "sign-in-required",
  });
  expect(sdk.unlock).not.toHaveBeenCalled();
  expect(sdk.enroll).not.toHaveBeenCalled();
});

function SignInStub({ onApprove }: { onApprove: (id: string, signal: AbortSignal) => Promise<void> }) {
  return createElement("div", { onClick: () => onApprove("fresh-session", new AbortController().signal) });
}

test("native session sync cannot unmount sign-in or enter admission before the explicit activation finishes", async () => {
  sdk.marker = { version: 1, installId: "497af871-e049-4102-b496-4cd529cf60b6", kind: "sign-in-required" };
  sdk.identity = { userId: null, sessionId: null, isLoaded: true };
  let finishActivation = () => {};
  sdk.setActive.mockImplementationOnce(() => new Promise<void>(resolve => { finishActivation = resolve; }));
  await act(async () => { root = create(createElement(AdmittedApp)); });
  sdk.identity = { userId: "owner", sessionId: "fresh-session", isLoaded: true };
  await act(async () => root?.update(createElement(AdmittedApp)));
  expect(root?.root.findAllByType(SignInStub)).toHaveLength(1);
  expect(sdk.signOut).not.toHaveBeenCalled();
  expect(sdk.enroll).not.toHaveBeenCalled();
  expect(sdk.register).not.toHaveBeenCalled();
  await act(async () => { void root?.root.findByType(SignInStub).props.onApprove("fresh-session", new AbortController().signal); });
  expect(sdk.setActive).toHaveBeenCalledExactlyOnceWith({ session: "fresh-session" });
  expect(root?.root.findAllByType(SignInStub)).toHaveLength(1);
  expect(sdk.enroll).not.toHaveBeenCalled();
  await act(async () => finishActivation());
  expect(root?.root.findAllByType(SignInStub)).toHaveLength(0);
  expect(sdk.enroll).not.toHaveBeenCalled();
  expect(sdk.register).not.toHaveBeenCalled();
  await act(async () => root?.root.findByProps({ accessibilityLabel: "Device name" }).props.onChangeText("New phone"));
  await act(async () => root?.root.findByProps({ label: "Register device" }).props.onPress());
  sdk.status = { status: "registered", deviceId: "registered-id", wipeLocalInput: false };
  await act(async () => root?.update(createElement(AdmittedApp)));
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(1);
  expect(sdk.enroll).toHaveBeenCalledOnce();
  expect(sdk.register).toHaveBeenCalledOnce();
  expect(sdk.signOut).not.toHaveBeenCalled();
});

test("a rejected activation keeps the synced native identity out of local admission", async () => {
  sdk.marker = { version: 1, installId: "497af871-e049-4102-b496-4cd529cf60b6", kind: "sign-in-required" };
  sdk.identity = { userId: null, sessionId: null, isLoaded: true };
  sdk.setActive.mockRejectedValueOnce(new Error("offline"));
  await act(async () => { root = create(createElement(AdmittedApp)); });
  await act(async () => {
    await expect(root?.root.findByType(SignInStub).props.onApprove("fresh-session", new AbortController().signal)).rejects.toThrow("offline");
  });
  sdk.identity = { userId: "owner", sessionId: "fresh-session", isLoaded: true };
  await act(async () => root?.update(createElement(AdmittedApp)));
  expect(root?.root.findAllByType(SignInStub)).toHaveLength(1);
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
  expect(sdk.enroll).not.toHaveBeenCalled();
  expect(sdk.register).not.toHaveBeenCalled();
  expect(sdk.replace).not.toHaveBeenCalled();
});

function AdmittedApp() {
  return createElement(LocalEntryGate, {
    children: createElement(DeviceAdmissionGate, { children: createElement(FinancialScreen) }),
    renderSignIn: onApprove => createElement(SignInStub, { onApprove }),
  });
}

function NativeAuthApp() {
  return createElement(LocalEntryGate, {
    children: createElement("div", { className: "admission" }),
    renderSignIn: onSessionCreated => createElement(PrebuiltSignIn, { onSessionCreated }),
  });
}

async function renderNativeAuth(sessionId: string | null, complete: boolean) {
  sdk.identity = { userId: sessionId ? "owner" : null, sessionId, isLoaded: true };
  sdk.session = sessionId ? { id: sessionId, status: "active", currentTask: null } : null;
  sdk.nativeFlow.isAuthFlowComplete = complete;
  await act(async () => {
    if (root) root.update(createElement(NativeAuthApp));
    else root = create(createElement(NativeAuthApp));
  });
}

test("readiness loss invalidates deferred activation and the same session can recover and retry", async () => {
  sdk.marker = { version: 1, installId: "497af871-e049-4102-b496-4cd529cf60b6", kind: "sign-in-required" };
  let finishStale = () => {};
  let finishRetry = () => {};
  sdk.setActive
    .mockImplementationOnce(() => new Promise<void>(resolve => { finishStale = resolve; }))
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementationOnce(() => new Promise<void>(resolve => { finishRetry = resolve; }));
  await renderNativeAuth(null, false);
  await renderNativeAuth("A", true);
  await renderNativeAuth("A", false);
  await act(async () => finishStale());
  expect(root?.root.findAllByProps({ className: "native-auth" })).toHaveLength(1);
  expect(root?.root.findAllByProps({ className: "admission" })).toHaveLength(0);
  expect(sdk.enroll).not.toHaveBeenCalled();
  await renderNativeAuth("A", true);
  expect(root?.root.findAllByProps({ label: "Try again" })).toHaveLength(1);
  await act(async () => root?.root.findByProps({ label: "Try again" }).props.onPress());
  expect(root?.root.findAllByProps({ className: "admission" })).toHaveLength(0);
  await act(async () => finishRetry());
  expect(root?.root.findAllByProps({ className: "admission" })).toHaveLength(1);
  expect(root?.root.findAllByProps({ className: "native-auth" })).toHaveLength(0);
  expect(sdk.setActive.mock.calls).toEqual([[{ session: "A" }], [{ session: "A" }], [{ session: "A" }]]);
  expect(sdk.signOut).not.toHaveBeenCalled();
});

test("after A signs out, resolving B followed by stale A cannot overwrite B's completed approval", async () => {
  sdk.marker = { version: 1, installId: "497af871-e049-4102-b496-4cd529cf60b6", kind: "sign-in-required" };
  let finishA = () => {};
  let finishB = () => {};
  sdk.setActive
    .mockImplementationOnce(() => new Promise<void>(resolve => { finishA = resolve; }))
    .mockImplementationOnce(() => new Promise<void>(resolve => { finishB = resolve; }));
  await renderNativeAuth(null, false);
  await renderNativeAuth("A", true);
  await renderNativeAuth(null, false);
  await renderNativeAuth("B", true);
  await act(async () => { finishB(); finishA(); });
  expect(root?.root.findAllByProps({ className: "admission" })).toHaveLength(1);
  expect(root?.root.findAllByProps({ className: "native-auth" })).toHaveLength(0);
  await renderNativeAuth("B", true);
  expect(root?.root.findAllByProps({ className: "admission" })).toHaveLength(1);
  expect(sdk.setActive.mock.calls).toEqual([[{ session: "A" }], [{ session: "B" }]]);
  expect(sdk.signOut).not.toHaveBeenCalled();
});
async function freshOccupiedSignIn() {
  sdk.platform = "android";
  sdk.marker = { version: 1, installId: "497af871-e049-4102-b496-4cd529cf60b6", kind: "sign-in-required" };
  sdk.identity = { userId: null, sessionId: null, isLoaded: true };
  sdk.status = { status: "unregistered", wipeLocalInput: false, occupier: {
    deviceId: "old-phone",
    sessionId: "old-session", label: "Old Android", lastSeenAt: 1_792_238_400_000,
  } };
  await act(async () => { root = create(createElement(AdmittedApp)); });
  await act(async () => {
    root?.root.findByType(SignInStub).props.onApprove("fresh-session", new AbortController().signal);
    sdk.identity = { userId: "owner", sessionId: "fresh-session", isLoaded: true };
    root?.update(createElement(AdmittedApp));
  });
}

test("fresh Clerk sign-in shows the occupied screen before any enrollment; Keep only signs this phone out", async () => {
  await freshOccupiedSignIn();
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
  expect(sdk.enroll).not.toHaveBeenCalled();
  expect(sdk.unlock).not.toHaveBeenCalled();
  expect(sdk.recordActivity).not.toHaveBeenCalled();
  await act(async () => root?.root.findByProps({ label: "Keep using Old Android" }).props.onPress());
  expect(sdk.signOut).toHaveBeenCalledOnce();
  expect(sdk.enroll).not.toHaveBeenCalled();
  expect(sdk.replace).not.toHaveBeenCalled();
  expect(sdk.register).not.toHaveBeenCalled();
});

test("Use enrolls once, replaces after success and mounts Home without a second enrollment or unlock", async () => {
  await freshOccupiedSignIn();
  let finish = () => {};
  sdk.enroll.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await act(async () => { void root?.root.findByProps({ label: "Use this phone instead" }).props.onPress(); });
  expect(sdk.enroll).toHaveBeenCalledOnce();
  expect(sdk.replace).not.toHaveBeenCalled();
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
  await act(async () => finish());
  expect(sdk.replace).toHaveBeenCalledOnce();
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
  sdk.status = { status: "registered", deviceId: "replacement", wipeLocalInput: false };
  await act(async () => root?.update(createElement(AdmittedApp)));
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(1);
  expect(sdk.enroll).toHaveBeenCalledOnce();
  expect(sdk.unlock).not.toHaveBeenCalled();
});

test.each(["cancel", "background"])("%s during replacement enrollment cannot register or revoke", async interruption => {
  await freshOccupiedSignIn();
  let finish = () => {};
  sdk.enroll.mockImplementationOnce(() => interruption === "cancel"
    ? Promise.reject(new Error("Cancelled")) : new Promise<void>(resolve => { finish = resolve; }));
  await act(async () => { void root?.root.findByProps({ label: "Use this phone instead" }).props.onPress(); });
  if (interruption === "background") {
    await act(async () => sdk.listeners.get("change")?.("background"));
    await act(async () => finish());
    expect(sdk.cancelPrompt).toHaveBeenCalledOnce();
  }
  expect(sdk.replace).not.toHaveBeenCalled();
  expect(sdk.register).not.toHaveBeenCalled();
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
});

test("device_revoked with a replacement label clears local drafts and retains the moved-access notice at sign-in", async () => {
  sdk.status = { status: "revoked", wipeLocalInput: true, movedTo: "New Android" };
  await act(async () => { root = create(createElement(AdmittedApp)); });
  await act(async () => root?.root.findByProps({ label: "Unlock Lukapp" }).props.onPress());
  expect(sdk.clearInput).toHaveBeenCalledExactlyOnceWith("owner");
  expect(sdk.signOut).toHaveBeenCalledOnce();
  sdk.identity = { userId: null, sessionId: null, isLoaded: true };
  await act(async () => root?.update(createElement(AdmittedApp)));
  expect(JSON.stringify(root?.toJSON())).toContain("Access moved to");
  expect(JSON.stringify(root?.toJSON())).toContain("New Android");
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
});

test("an unoccupied fresh sign-in still enrolls once before ordinary registration", async () => {
  await freshOccupiedSignIn();
  sdk.status = { status: "unregistered", wipeLocalInput: false };
  await act(async () => root?.update(createElement(AdmittedApp)));
  expect(sdk.enroll).not.toHaveBeenCalled();
  await act(async () => root?.root.findByProps({ accessibilityLabel: "Device name" }).props.onChangeText("New phone"));
  await act(async () => root?.root.findByProps({ label: "Register device" }).props.onPress());
  expect(sdk.enroll).toHaveBeenCalledOnce();
  expect(sdk.register).toHaveBeenCalledExactlyOnceWith({
    installId: "497af871-e049-4102-b496-4cd529cf60b6", label: "New phone", platform: "android", appVersion: "0.1.0",
  });
  expect(sdk.replace).not.toHaveBeenCalled();
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
  sdk.status = { status: "registered", deviceId: "registered-id", wipeLocalInput: false };
  await act(async () => root?.update(createElement(AdmittedApp)));
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(1);
  expect(sdk.enroll).toHaveBeenCalledOnce();
});

test("a pre-enrollment failure callback still clears input, enrollment and session after replacement is denied", async () => {
  await freshOccupiedSignIn();
  let deny = (_error: Error) => {};
  sdk.replace.mockImplementationOnce(() => new Promise<string>((_resolve, reject) => { deny = reject; }));
  await act(async () => { void root?.root.findByProps({ label: "Use this phone instead" }).props.onPress(); });
  expect(sdk.enroll).toHaveBeenCalledOnce();
  expect(sdk.replace).toHaveBeenCalledOnce();
  expect(sdk.clearInput).toHaveBeenCalledTimes(1);
  expect(sdk.writeMarker).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "enrolled" }));
  await act(async () => deny(new ConvexError({ code: "session_inactive", wipeLocalInput: true })));
  expect(sdk.clearInput).toHaveBeenCalledTimes(2);
  expect(sdk.clearInput).toHaveBeenLastCalledWith("owner");
  expect(sdk.clearEnrollment).toHaveBeenCalledOnce();
  expect(sdk.signOut).toHaveBeenCalledOnce();
  expect(sdk.writeMarker).toHaveBeenLastCalledWith({ version: 1, installId: sdk.marker.installId, kind: "sign-in-required" });
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
  expect(root?.root.findAllByProps({ label: "Use this phone instead" })).toHaveLength(0);
});

test("Sign in instead on the same install enrolls once and uses verified reclaim without a replacement choice", async () => {
  sdk.platform = "android";
  await act(async () => { root = create(createElement(AdmittedApp)); });
  await act(async () => root?.root.findByProps({ label: "Sign in instead" }).props.onPress());
  sdk.identity = { userId: null, sessionId: null, isLoaded: true };
  await act(async () => root?.update(createElement(AdmittedApp)));
  sdk.status = {
    status: "unregistered", wipeLocalInput: false, existingLabel: "This Android",
    occupier: { deviceId: "same-phone", sessionId: "session", label: "This Android", lastSeenAt: 1_792_238_400_000 },
  };
  await act(async () => {
    root?.root.findByType(SignInStub).props.onApprove("fresh-session", new AbortController().signal);
    sdk.identity = { userId: "owner", sessionId: "fresh-session", isLoaded: true };
    root?.update(createElement(AdmittedApp));
  });
  expect(root?.root.findAllByProps({ label: "Use this phone instead" })).toHaveLength(0);
  expect(sdk.enroll).toHaveBeenCalledOnce();
  expect(sdk.register).toHaveBeenCalledExactlyOnceWith({
    installId: sdk.marker.installId, label: "This Android", platform: "android", appVersion: "0.1.0",
  });
  expect(sdk.replace).not.toHaveBeenCalled();
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
  sdk.status = { status: "registered", deviceId: "same-phone", wipeLocalInput: false };
  await act(async () => root?.update(createElement(AdmittedApp)));
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(1);
  expect(sdk.enroll).toHaveBeenCalledOnce();
  expect(sdk.unlock).not.toHaveBeenCalled();
});
