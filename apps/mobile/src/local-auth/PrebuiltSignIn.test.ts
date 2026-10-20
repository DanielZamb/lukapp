import * as React from "react";
import { createElement, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("../ui/Brand", () => ({ BrandLogo: "brand-logo", BrandMark: "brand-mark", BrandSplash: "brand-splash" }));

const sdk = vi.hoisted(() => ({
  session: ((): { id: string; status: string; currentTask: { key: string } | null } | null => null)(),
  sessionId: ((): string | null => null)(),
  flow: { isLoaded: true, isAuthFlowComplete: false },
  authOptions: vi.fn(),
  mounts: vi.fn(),
  unmounts: vi.fn(),
  window: { width: 320, height: 693, fontScale: 1.3, scale: 3.375 },
  complete: vi.fn(async (_id: string) => {}),
}));
vi.mock("@clerk/expo", () => ({
  useSession: () => ({ session: sdk.session }),
  useAuth: (options: unknown) => {
    sdk.authOptions(options);
    return { sessionId: sdk.sessionId };
  },
}));
vi.mock("@clerk/expo/native-components", () => ({
  useAuthViewState: () => sdk.flow,
  AuthView: (props: import("@clerk/expo/native-components").AuthViewProps) => {
    useEffect(() => {
      sdk.mounts();
      return () => { sdk.unmounts(); };
    }, []);
    return createElement("div", { ...props, className: "native-auth" });
  },
}));
vi.mock("react-native", () => ({
  Text: "text", View: "view", ScrollView: "scroll", KeyboardAvoidingView: "keyboard-viewport",
  useWindowDimensions: () => sdk.window,
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("../ui/core", () => ({
  Header: "header", SecondaryButton: "button", useUi: () => ({}),
}));
import { PrebuiltSignIn } from "./PrebuiltSignIn";

let root: ReactTestRenderer | undefined;
async function render() {
  await act(async () => {
    const element = createElement(PrebuiltSignIn, { onSessionCreated: sdk.complete });
    if (root) root.update(element);
    else root = create(element);
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  sdk.session = null;
  sdk.sessionId = null;
  sdk.flow = { isLoaded: true, isAuthFlowComplete: false };
  sdk.window.fontScale = 1.3;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

test("keeps the same combined native flow through verification, pending tasks and JS synchronization", async () => {
  await render();
  expect(root?.root.findByProps({ className: "native-auth" }).props).toMatchObject({
    mode: "signInOrUp", isDismissible: false,
  });
  expect(sdk.authOptions).toHaveBeenCalledWith({ treatPendingAsSignedOut: false });
  sdk.sessionId = "new-session";
  sdk.session = { id: "new-session", status: "pending", currentTask: { key: "choose-organization" } };
  sdk.flow.isAuthFlowComplete = true;
  await render();
  expect(sdk.complete).not.toHaveBeenCalled();
  sdk.session.status = "active";
  await render();
  expect(sdk.complete).not.toHaveBeenCalled();
  sdk.session.currentTask = null;
  sdk.flow.isAuthFlowComplete = false;
  await render();
  expect(sdk.complete).not.toHaveBeenCalled();
  sdk.flow.isAuthFlowComplete = true;
  sdk.sessionId = "stale-js-session";
  await render();
  expect(sdk.complete).not.toHaveBeenCalled();
  sdk.sessionId = "new-session";
  await render();
  expect(sdk.complete).toHaveBeenCalledExactlyOnceWith("new-session", expect.any(AbortSignal));
  await render();
  expect(sdk.complete).toHaveBeenCalledOnce();
  expect(sdk.mounts).toHaveBeenCalledOnce();
  expect(sdk.unmounts).not.toHaveBeenCalled();
});

test("changing system text size preserves the in-progress native authentication flow", async () => {
  await render();
  sdk.window.fontScale = 2;
  await render();
  expect(sdk.mounts).toHaveBeenCalledOnce();
  expect(sdk.unmounts).not.toHaveBeenCalled();
  expect(sdk.complete).not.toHaveBeenCalled();
});

test("cancellation and an incomplete challenge cannot approve a session", async () => {
  await render();
  sdk.flow.isAuthFlowComplete = true;
  await render();
  expect(sdk.complete).not.toHaveBeenCalled();
  sdk.sessionId = "pending-session";
  sdk.session = { id: "pending-session", status: "pending", currentTask: null };
  await render();
  sdk.session = null;
  sdk.sessionId = null;
  await render();
  expect(sdk.complete).not.toHaveBeenCalled();
  expect(sdk.unmounts).not.toHaveBeenCalled();
});

test("activation failure keeps Clerk mounted and retries the actual completed session", async () => {
  sdk.complete.mockRejectedValueOnce(new Error("offline"));
  sdk.sessionId = "new-session";
  sdk.session = { id: "new-session", status: "active", currentTask: null };
  sdk.flow.isAuthFlowComplete = true;
  await render();
  expect(root?.root.findByProps({ accessibilityRole: "alert" }).children.join("")).toBe(
    "Sign-in could not finish. Please try again.",
  );
  expect(sdk.unmounts).not.toHaveBeenCalled();
  await act(async () => root?.root.findByProps({ label: "Try again" }).props.onPress());
  expect(sdk.complete.mock.calls.map(([id]) => id)).toEqual(["new-session", "new-session"]);
  expect(root?.root.findAllByProps({ accessibilityRole: "alert" })).toHaveLength(0);
  expect(sdk.mounts).toHaveBeenCalledOnce();
});
