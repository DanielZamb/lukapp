import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { InstallMarker } from "./installMarker";
import type { AppStateStatus } from "react-native";

type DeviceStatus = Pick<import("convex/server").FunctionReturnType<typeof import("../features/api").api.deviceAccess.status>, "status" | "wipeLocalInput"> & {
  deviceId?: string;
  movedTo?: string;
  occupier?: { deviceId: string; sessionId: string; label: string; lastSeenAt: number };
};

const sdk = vi.hoisted(() => ({
  identity: ((): { userId: string | null; sessionId: string | null; isLoaded: boolean } => ({ userId: "owner", sessionId: "session", isLoaded: true }))(),
  marker: ((): InstallMarker => ({ version: 1, installId: "497af871-e049-4102-b496-4cd529cf60b6", kind: "enrolled", subject: "owner", sessionId: "session" }))(),
  status: ((): DeviceStatus => ({ status: "unregistered", wipeLocalInput: false }))(),
  register: vi.fn(async (_args: unknown) => "registered-id"),
  replace: vi.fn(async (_args: unknown) => "replacement-id"),
  clearInput: vi.fn(async (_subject: string) => {}),
  signOut: vi.fn(async () => {}),
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
  useClerk: () => ({ signOut: sdk.signOut }),
}));
vi.mock("convex/react", () => ({
  useQuery_experimental: () => ({ status: "success", data: sdk.status }),
  useAction: (action: typeof api.deviceAccess.register | typeof api.deviceAccess.replace) =>
    getFunctionName(action) === "deviceAccess:replace" ? sdk.replace : sdk.register,
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
  clearBiometricEnrollment: async () => {},
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
import { api } from "../features/api";
import { LocalEntryGate } from "./LocalEntryGate";
import { ThemeProvider, useThemeContext } from "../ui/themeContext";

let root: ReactTestRenderer | undefined;
function FinancialScreen() { return createElement("div"); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  sdk.platform = "ios";
  sdk.identity = { userId: "owner", sessionId: "session", isLoaded: true };
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

function SignInStub({ onApprove }: { onApprove: (id: string) => void }) {
  return createElement("div", { onClick: () => onApprove("fresh-session") });
}

function AdmittedApp() {
  return createElement(LocalEntryGate, {
    children: createElement(DeviceAdmissionGate, { children: createElement(FinancialScreen) }),
    renderSignIn: (onApprove: (id: string) => void) => createElement(SignInStub, { onApprove }),
  });
}
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
    root?.root.findByType(SignInStub).props.onApprove("fresh-session");
    sdk.identity = { userId: "owner", sessionId: "fresh-session", isLoaded: true };
    root?.update(createElement(AdmittedApp));
  });
}

test("fresh Clerk sign-in shows the occupied screen before any enrollment; Keep only signs this phone out", async () => {
  await freshOccupiedSignIn();
  expect(root?.root.findAllByType(FinancialScreen)).toHaveLength(0);
  expect(sdk.enroll).not.toHaveBeenCalled();
  expect(sdk.unlock).not.toHaveBeenCalled();
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
