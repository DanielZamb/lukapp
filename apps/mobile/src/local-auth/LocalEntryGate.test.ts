import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { InstallMarker } from "./installMarker";
import type { AppStateStatus } from "react-native";

const sdk = vi.hoisted(() => ({
  identity: { userId: "owner", sessionId: "session", isLoaded: true },
  signOut: vi.fn(async () => {}),
  unlock: vi.fn(async () => {}),
  enroll: vi.fn(async () => {}),
  writeMarker: vi.fn(async (_marker: InstallMarker) => {}),
  platform: "ios",
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
vi.mock("expo-router", () => ({ usePathname: () => "/" }));
vi.mock("react-native", () => ({
  ActivityIndicator: "spinner", Text: "text", View: "view",
  Platform: { get OS() { return sdk.platform; } },
  AppState: { currentState: "active", addEventListener: sdk.addEventListener },
}));
vi.mock("./nativeEntry", () => ({
  readInstallMarker: async () => ({
    version: 1, installId: "497af871-e049-4102-b496-4cd529cf60b6",
    kind: "enrolled", subject: "owner", sessionId: "session",
  }),
  writeInstallMarker: sdk.writeMarker,
  unlockBiometry: sdk.unlock,
  enrollBiometry: sdk.enroll,
  clearBiometricEnrollment: async () => {},
  cancelBiometricPrompt: sdk.cancelPrompt,
  initializeScreenPrivacy: async () => {},
  hideFinancialScreen: async () => {},
  revealFinancialScreen: async () => {},
}));
vi.mock("../features/clearLocalInput", () => ({ clearLocalInput: async () => {} }));
vi.mock("../ui/core", () => ({
  Header: "header", Screen: "screen", PrimaryButton: "button", SecondaryButton: "button", useUi: () => ({}),
}));
import { LocalEntryGate } from "./LocalEntryGate";

let root: ReactTestRenderer | undefined;
function FinancialScreen() { return createElement("div"); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  sdk.platform = "ios";
  sdk.listeners.clear();
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
