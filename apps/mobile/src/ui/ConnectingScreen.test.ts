import * as React from "react";
import { createElement, useMemo, useRef } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConnectingHandover, ConnectingProvider, ConnectingScreen, connectingCopy, connectingPhase } from "./ConnectingScreen";

const native = vi.hoisted(() => ({
  reduced: false,
  platform: "android",
  changeMotion: (_value: boolean) => {},
  frames: new Array<(frame: { timestamp: number }) => void>(),
  frameActive: vi.fn(), timing: vi.fn((value: number, _config: unknown) => value),
  announce: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: "view", Text: "text", ScrollView: "scroll", Pressable: "button", StatusBar: "status-bar",
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { get OS() { return native.platform; } },
  AccessibilityInfo: {
    announceForAccessibilityWithOptions: native.announce,
    isReduceMotionEnabled: async () => native.reduced,
    addEventListener: (_event: string, callback: (value: boolean) => void) => {
      native.changeMotion = callback;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("./Brand", () => ({ ConnectingMark: "mark", ConnectingSignature: "signature" }));
vi.mock("./core", () => ({ Text: "text", useThemeMode: () => "light", useTier: () => "default" }));
vi.mock("react-native-reanimated", () => ({
  ReduceMotion: { Never: "never" },
  default: { View: "animated-view" },
  useSharedValue: (initial: number) => useRef({ value: initial }).current,
  useAnimatedStyle: (style: () => unknown) => style(),
  useFrameCallback: (callback: (frame: { timestamp: number }) => void) => useMemo(() => {
    native.frames.push(callback);
    return { setActive: native.frameActive };
  }, []),
  withTiming: (value: number, config: unknown) => native.timing(value, config),
}));

let root: ReactTestRenderer;
const actions = { onCheckAgain: vi.fn(), onSignOut: vi.fn(), signingOut: false };
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(0);
  native.reduced = false;
  native.platform = "android";
  native.frames.length = 0;
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function tree(phase: "protection" | "session" | "account" | "data" | "device", key: string = phase) {
  return createElement(ConnectingProvider, { children: phase === "device"
    ? createElement(ConnectingScreen, { key, phase, ...actions }) : createElement(ConnectingScreen, { key, phase }) });
}
async function mount(element = tree("protection")) {
  await act(async () => { root = create(element); });
}
async function tick(ms: number) { await act(async () => { vi.advanceTimersByTime(ms); }); }
function texts() { return root.root.findAllByType("text").map(node => node.children.join("")); }
function buttons() { return root.root.findAllByType("button"); }

test.each([
  ["checking", false, "protection"], ["open", false, "session"], ["open", true, null],
  ["sign-in", false, null], ["locked", false, null], ["admission", false, null], ["enrolling", false, null],
  ["authenticating", false, null], ["reauthentication", false, null], ["revocation", false, null], ["unavailable", false, null],
] satisfies [import("../local-auth/entryController").EntryState["kind"], boolean, string | null][])(
  "local %s with session ready %s derives %s", (state, sessionReady, expected) => {
    expect(connectingPhase({ gate: "local", state, sessionReady })).toBe(expected);
  },
);

test.each([
  [false, false, false, false, "pending", "session"],
  [true, true, true, false, "pending", "session"],
  [true, false, false, false, "pending", "session"],
  [true, true, false, true, "pending", "account"],
  [true, true, false, true, "owner", null],
  [true, true, false, false, "pending", null],
  [true, true, false, true, "not-owner", null],
  [true, true, false, true, "signed-out", null],
] satisfies [boolean, boolean, boolean, boolean, "pending" | "owner" | "not-owner" | "signed-out", string | null][])(
  "admission %s/%s/%s/%s/%s derives %s", (clerkLoaded, signedIn, convexLoading, authenticated, connection, expected) => {
    expect(connectingPhase({ gate: "admission", clerkLoaded, signedIn, convexLoading, authenticated, connection })).toBe(expected);
  },
);
test.each(["interactive", "ready", "error"] satisfies ("interactive" | "ready" | "error")[])("device %s escapes", state => {
  expect(connectingPhase({ gate: "device", state })).toBe(null);
});
test("pending devices and unresolved initial balances derive their own phases", () => {
  expect(connectingPhase({ gate: "device", state: "waiting" })).toBe("device");
  expect(connectingPhase({ gate: "home", resolved: false })).toBe("data");
  expect(connectingPhase({ gate: "home", resolved: true })).toBe(null);
});
test("device slow copy and working actions appear at eight seconds", async () => {
  await mount(tree("device"));
  expect(texts()).not.toContain("Still connecting…");
  expect(buttons()).toHaveLength(0);
  await tick(7999);
  expect(buttons()).toHaveLength(0);
  await tick(1);
  expect(texts()).toContain("Still connecting…");
  expect(buttons().map(button => button.props.accessibilityLabel)).toEqual(["Check again", "Sign out"]);
  await act(async () => { buttons()[0].props.onPress(); buttons()[1].props.onPress(); });
  expect(actions.onCheckAgain).toHaveBeenCalledOnce();
  expect(actions.onSignOut).toHaveBeenCalledOnce();
});
test("retry remount preserves the deadline and the provider animation clock", async () => {
  await mount(tree("device", "attempt-1"));
  await tick(7500);
  await act(async () => { native.frames[0]({ timestamp: 2350 }); root.update(tree("device", "attempt-2")); });
  expect(native.frames).toHaveLength(1);
  expect(buttons()).toHaveLength(0);
  await tick(500);
  expect(buttons()).toHaveLength(2);
});
test("a phase change resets the slow timer and keeps the same live-region host", async () => {
  await mount();
  const live = root.root.findAllByProps({ accessibilityLiveRegion: "polite" })[0];
  expect(live.children).toEqual(["Unlocking Lukapp…"]);
  await tick(7000);
  await act(async () => root.update(tree("account")));
  expect(root.root.findAllByProps({ accessibilityLiveRegion: "polite" })[0]).toBe(live);
  expect(live.children).toEqual(["Connecting to your account…"]);
  await tick(1000);
  expect(texts()).not.toContain("Still connecting…");
  await tick(7000);
  expect(texts()).toContain("Still connecting…");
  expect(buttons()).toHaveLength(0);
});
test("every phase announces once and retry remounts do not repeat it", async () => {
  await mount();
  const announced = [texts()[0]];
  for (const phase of ["session", "account", "device", "data"] satisfies ("session" | "account" | "device" | "data")[]) {
    await act(async () => root.update(tree(phase)));
    announced.push(root.root.findAllByProps({ accessibilityLiveRegion: "polite" })[0].children.join(""));
    await act(async () => root.update(tree(phase, `${phase}-retry`)));
    expect(root.root.findAllByProps({ accessibilityLiveRegion: "polite" })).toHaveLength(1);
  }
  expect(announced).toEqual(Object.values(connectingCopy));
});
test("Reduce Motion disables the clock and still updates status, including a setting change", async () => {
  native.reduced = true;
  await mount();
  expect(native.frameActive).not.toHaveBeenCalledWith(true);
  await act(async () => root.update(tree("account")));
  expect(texts()).toContain("Connecting to your account…");
  await tick(8000);
  expect(texts()).toContain("Still connecting…");
  await act(async () => native.changeMotion(false));
  expect(native.frameActive).toHaveBeenLastCalledWith(true);
  await act(async () => native.changeMotion(true));
  expect(native.frameActive).toHaveBeenLastCalledWith(false);
});
test("VoiceOver queues each phase and slow status once across retry remounts", async () => {
  native.platform = "ios";
  await mount();
  await act(async () => root.update(tree("device")));
  await tick(8000);
  await act(async () => root.update(tree("device", "retry")));
  await tick(0);
  expect(native.announce.mock.calls).toEqual([
    ["Unlocking Lukapp…", { queue: true }], ["Checking this phone…", { queue: true }], ["Still connecting…", { queue: true }],
  ]);
});
function handover(ready: boolean) {
  return createElement(ConnectingProvider, { children: createElement(ConnectingHandover, {
    ready, children: createElement("div", { balance: ready ? "COP 100" : undefined }),
  }) });
}
test("first balances fade only the cover, retain Home, and do not replay on later refresh", async () => {
  await mount(handover(false));
  const home = root.root.findByType("div");
  expect(root.root.findAllByType(ConnectingScreen)).toHaveLength(1);
  await act(async () => root.update(handover(true)));
  expect(root.root.findByType("div")).toBe(home);
  expect(home.props.balance).toBe("COP 100");
  expect(native.timing).toHaveBeenCalledExactlyOnceWith(0, { duration: 320, reduceMotion: "never" });
  await tick(319);
  expect(root.root.findAllByType(ConnectingScreen)).toHaveLength(1);
  await tick(1);
  expect(root.root.findAllByType(ConnectingScreen)).toHaveLength(0);
  await act(async () => root.update(handover(false)));
  expect(root.root.findAllByType(ConnectingScreen)).toHaveLength(0);
});
test("cached first balances retain the outgoing cover and fade once", async () => {
  await mount(handover(true));
  expect(root.root.findAllByType(ConnectingScreen)).toHaveLength(1);
  expect(native.timing).toHaveBeenCalledExactlyOnceWith(0, { duration: 320, reduceMotion: "never" });
  await tick(319);
  expect(root.root.findAllByType(ConnectingScreen)).toHaveLength(1);
  await tick(1);
  expect(root.root.findAllByType(ConnectingScreen)).toHaveLength(0);
  await act(async () => root.update(handover(true)));
  expect(native.timing).toHaveBeenCalledOnce();
});
test("Reduce Motion reveals resolved balances with only a short opacity fade", async () => {
  native.reduced = true;
  await mount(handover(false));
  await act(async () => root.update(handover(true)));
  expect(root.root.findAllByType(ConnectingScreen)).toHaveLength(1);
  expect(native.timing).toHaveBeenCalledExactlyOnceWith(0, { duration: 150, reduceMotion: "never" });
  await tick(149);
  expect(root.root.findAllByType(ConnectingScreen)).toHaveLength(1);
  await tick(1);
  expect(root.root.findAllByType(ConnectingScreen)).toHaveLength(0);
});
