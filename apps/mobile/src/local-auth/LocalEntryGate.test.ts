import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { InstallMarker } from "./installMarker";

const sdk = vi.hoisted(() => ({
  identity: { userId: "owner", sessionId: "session", isLoaded: true },
  signOut: vi.fn(async () => {}),
  unlock: vi.fn(async () => {}),
  enroll: vi.fn(async () => {}),
  writeMarker: vi.fn(async (_marker: InstallMarker) => {}),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => sdk.identity,
  useClerk: () => ({ signOut: sdk.signOut }),
}));
vi.mock("expo-router", () => ({ usePathname: () => "/" }));
vi.mock("react-native", () => ({
  ActivityIndicator: "spinner", Text: "text", View: "view",
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
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
  cancelBiometricPrompt: async () => {},
  initializeScreenPrivacy: async () => {},
  hideFinancialScreen: async () => {},
  revealFinancialScreen: async () => {},
}));
vi.mock("../features/clearLocalInput", () => ({ clearLocalInput: async () => {} }));
vi.mock("../ui/core", () => ({
  Header: "header", Screen: "screen", PrimaryButton: "button", SecondaryButton: "button", ui: {},
}));
import { LocalEntryGate } from "./LocalEntryGate";

let root: ReactTestRenderer | undefined;
function FinancialScreen() { return createElement("div"); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
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
