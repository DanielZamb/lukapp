import * as React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, test, vi } from "vitest";
import { ContextIslandController, type IslandOwner, type IslandTransport } from "./ContextIslandController";
import { ContextPillHost, useContextPill } from "./ContextPill";
import { islandExpansion, islandPayload, publicIslandContent, type IslandObservation, type IslandPayload } from "./contextIslandModel";
import { pillVisibility, type ContextPillContent, type PillEvent } from "./contextPillModel";
import { routeIslandIntent } from "./contextPillIntent";

const ui = vi.hoisted(() => {
  const state: { module: import("../../modules/context-island").ContextIslandNativeModule | null; motion: boolean } = { module: null, motion: false };
  return { ...state, appStateListener: vi.fn<(event: string, listener: (state: string) => void) => { remove(): void }>(() => ({ remove() {} })),
    newScope: vi.fn(() => "00000000-0000-4000-8000-000000000001") };
});
vi.mock("../../modules/context-island", () => ({ loadContextIslandModule: async () => ui.module }));
vi.mock("./contextIslandConfig", () => ({ nativeTransientIsland: true }));
vi.mock("expo-crypto", () => ({ randomUUID: () => ui.newScope() }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios", Version: "18.0" }, View: "view", Text: "text", Pressable: "button", ScrollView: "pill-scroll", StatusBar: "status",
  StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
  useWindowDimensions: () => ({ width: 393, height: 852, fontScale: 1.5 }),
  AppState: { currentState: "active", addEventListener: ui.appStateListener },
}));
vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  return {
    default: { View: "animated-view", createAnimatedComponent: (component: unknown) => component },
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
    useAnimatedStyle: (style: () => unknown) => style(),
    useAnimatedReaction: (prepare: () => unknown, react: (value: unknown) => void) => React.useEffect(() => { react(prepare()); }),
    withTiming: (value: number, _options: unknown, complete?: (finished: boolean) => void) => { complete?.(true); return value; },
    cancelAnimation() {}, interpolate: () => 0,
    Easing: { linear() {}, bezier() {}, out() {}, cubic() {} }, ReduceMotion: { Never: "never" },
  };
});
vi.mock("react-native-worklets", () => ({ scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args) }));
vi.mock("react-native-gesture-handler", () => {
  const pan = () => {
    const gesture = { enabled: () => gesture, activeOffsetY: () => gesture, failOffsetX: () => gesture,
      onStart: () => gesture, onUpdate: () => gesture, onEnd: () => gesture, onFinalize: () => gesture };
    return gesture;
  };
  return { Gesture: { Pan: pan }, GestureDetector: "gesture" };
});
vi.mock("expo-blur", () => ({ BlurTargetView: "blur-target" }));
vi.mock("./Glass", () => ({ Glass: "glass", usePillAccessibility: () => ({ reduceMotion: ui.motion, reduceTransparency: false, screenReader: false, ready: true }) }));
vi.mock("./themeContext", () => ({ useTier: () => "xxxl", useThemeMode: () => "light" }));
vi.mock("../device/cameraCutout", () => ({ useCameraCutout: () => ({ kind: "island", rect: { x: 133.5, y: 11, width: 126, height: 37 } }) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34 }) }));

const scope = "00000000-0000-4000-8000-000000000001";
const nextScope = "00000000-0000-4000-8000-000000000002";
const budget: ContextPillContent = { kind: "budget", name: "Food", emoji: "🥗", currency: "COP", limitMinor: 20000000, spentMinor: 12000000 };
const entry: ContextPillContent = { kind: "entry", name: "Groceries", emoji: "🧾", currency: "COP", amountMinor: -4500000 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
}

function fixture() {
  const requests: ReturnType<typeof deferred<unknown>>[] = [];
  const calls: string[] = [];
  const native = {
    setAdmission: vi.fn(async (admitted: boolean) => { calls.push(`admission:${admitted}`); }),
    request: vi.fn((payload: IslandPayload) => {
      calls.push(`request:${payload.scope}`);
      const pending = deferred<unknown>();
      requests.push(pending);
      return pending.promise;
    }),
    update: vi.fn(async (payload: IslandPayload) => { calls.push(`update:${payload.scope}`); }),
    end: vi.fn(async (value: string) => { calls.push(`end:${value}`); }),
    endAll: vi.fn(async () => { calls.push("endAll"); }),
  } satisfies IslandTransport;
  const newScope = vi.fn().mockReturnValueOnce(scope).mockReturnValue(nextScope);
  const controller = new ContextIslandController(native, newScope);
  const send = vi.fn((event: PillEvent, _animated?: boolean) => {
    owner = { ...owner, visibility: pillVisibility(owner.visibility, event) };
  });
  let owner: IslandOwner = { key: "food", cycle: 0, content: budget, visibility: "visible", send };
  const bind = (change: Partial<IslandOwner> = {}, admitted = true) => {
    owner = { ...owner, ...change };
    controller.bind(owner, admitted);
  };
  const observe = (state: IslandObservation["state"], revision = 1, observedScope = scope) => {
    controller.observe({ scope: observedScope, state, revision });
  };
  const start = async () => {
    bind();
    controller.activate();
    await flush();
  };
  const active = async () => {
    await start();
    requests[0].resolve({ scope, state: "active", revision: 0 });
    await flush();
    expect(controller.getSnapshot()).toBe("active");
  };
  const reenter = () => {
    bind({ visibility: "summary", cycle: owner.cycle + 1 });
    bind({ visibility: "visible" });
  };
  return { native, controller, requests, calls, send, bind, observe, start, active, reenter, owner: () => owner };
}

describe("native expansion capability", () => {
  const capable: Parameters<typeof islandExpansion>[0] = {
    platform: "ios", iosVersion: 18, tier: "xxxl", nativeTransientIsland: true, capability: { supported: true, enabled: true },
    cutout: { kind: "island", rect: { x: 133, y: 11, width: 126, height: 37 } },
  };
  test.each([
    { label: "iOS 18 island", change: {}, expected: "native" },
    { label: "newer iOS island", change: { iosVersion: 26.5 }, expected: "native" },
    { label: "iOS 17 island", change: { iosVersion: 17.9 }, expected: "t7" },
    { label: "Android island geometry", change: { platform: "android" }, expected: "t7" },
    { label: "web", change: { platform: "web" }, expected: "t7" },
    { label: "non-island iPhone", change: { cutout: { kind: "none", rect: null } }, expected: "t7" },
    { label: "punch hole", change: { cutout: { kind: "centredPunchHole", rect: { x: 150, y: 0, width: 20, height: 30 } } }, expected: "t7" },
    { label: "disabled Live Activities", change: { capability: { supported: true, enabled: false } }, expected: "t7" },
    { label: "disabled native transient island configuration", change: { nativeTransientIsland: false }, expected: "t7" },
    { label: "unsupported ActivityKit", change: { capability: { supported: false, enabled: true } }, expected: "t7" },
    { label: "default tier", change: { tier: "default" }, expected: "inert" },
    { label: "reflow tier", change: { tier: "reflow" }, expected: "inert" },
  ] satisfies { label: string; change: Partial<typeof capable>; expected: string }[])("$label selects $expected", ({ change, expected }) => {
    expect(islandExpansion({ ...capable, ...change })).toBe(expected);
  });
});

describe("native content and public privacy", () => {
  test("carries both labelled budget figures to the expanded presentation", () => {
    expect(islandPayload(scope, budget)).toEqual({ scope, name: "Food", emoji: "🥗", progress: 0.6, tone: "positive",
      figures: [{ label: "Left to spend", value: "COP 80.000" }, { label: "Spent of COP 200.000", value: "COP 120.000" }] });
  });
  test("uses absolute over-limit money and retains the spent figure", () => {
    expect(islandPayload(scope, { ...budget, kind: "budget", limitMinor: 20000000, spentMinor: 21200000 })).toEqual({ scope, name: "Food", emoji: "🥗", progress: 1, tone: "warning",
      figures: [{ label: "Over the limit", value: "COP 12.000" }, { label: "Spent of COP 200.000", value: "COP 212.000" }] });
  });
  test("carries the signed entry amount without invented budget figures", () => {
    expect(islandPayload(scope, entry)).toEqual({ scope, name: "Groceries", emoji: "🧾", progress: null, tone: "default",
      figures: [{ label: "Amount", value: "−COP 45.000" }] });
  });
  test.each([
    { content: budget, expected: { name: "Food", emoji: "🥗", progress: 0.6 } },
    { content: entry, expected: { name: "Groceries", emoji: "🧾", progress: null } },
  ])("public projection contains no amount, limit, currency, or figures for $content.kind", ({ content, expected }) => {
    expect(publicIslandContent(content)).toEqual(expected);
  });
});

describe("transient island controller with a deferred native transport", () => {
  test("a tap requests once with the expanded payload, including repeated taps while pending", async () => {
    const f = fixture();
    await f.start();
    f.controller.activate();
    f.controller.activate();
    expect(f.controller.getSnapshot()).toBe("requesting");
    expect(f.native.request.mock.calls).toEqual([[{ scope, name: "Food", emoji: "🥗", progress: 0.6, tone: "positive",
      figures: [{ label: "Left to spend", value: "COP 80.000" }, { label: "Spent of COP 200.000", value: "COP 120.000" }] }]]);
    f.requests[0].resolve({ scope, state: "active", revision: 0 });
    await flush();
    expect(f.controller.getSnapshot()).toBe("active");
  });

  test.each([false, true])("Back dispatches the host action before ending and consumes the ticket, animated=%s", async animated => {
    const f = fixture();
    await f.active();
    f.send.mockImplementationOnce((event, receivedAnimation) => {
      f.calls.push(`host:${event}:${receivedAnimation}`);
    });
    expect(f.controller.back(scope, animated)).toBe(true);
    await flush();
    expect(f.calls.slice(-2)).toEqual([`host:back:${animated}`, `end:${scope}`]);
    expect(f.send.mock.calls).toEqual([["back", animated]]);
    expect(f.controller.back(scope, animated)).toBe(false);
    expect(f.controller.getSnapshot()).toBe("idle");
  });

  test("summary re-entry ends the activity and invalidates its Back ticket", async () => {
    const f = fixture();
    await f.active();
    f.bind({ visibility: "summary", cycle: 1 });
    await flush();
    expect(f.native.end.mock.calls).toEqual([[scope]]);
    expect(f.owner().visibility).toBe("summary");
    expect(f.controller.back(scope, true)).toBe(false);
    expect(f.controller.getSnapshot()).toBe("idle");
  });

  test.each(["ended", "dismissed"] satisfies IslandObservation["state"][])("native %s suppresses further taps until summary re-entry", async state => {
    const f = fixture();
    await f.active();
    f.observe(state);
    f.bind();
    f.controller.activate();
    expect(f.owner().visibility).toBe("dismissed");
    expect(f.send.mock.calls).toEqual([["swipeUp"]]);
    expect(f.native.request).toHaveBeenCalledTimes(1);
    f.reenter();
    f.controller.activate();
    await flush();
    expect(f.native.request).toHaveBeenCalledTimes(2);
    expect(f.native.request.mock.calls[1][0].scope).toBe(nextScope);
  });

  test("a terminal event before the request result cannot resurrect the activity", async () => {
    const f = fixture();
    await f.start();
    f.observe("dismissed", 2);
    f.bind();
    f.requests[0].resolve({ scope, state: "active", revision: 1 });
    await flush();
    expect(f.controller.getSnapshot()).toBe("idle");
    expect(f.owner().visibility).toBe("dismissed");
    expect(f.send.mock.calls).toEqual([["swipeUp"]]);
    expect(f.native.update).not.toHaveBeenCalled();
  });

  test("an early active observation wins over an older request result", async () => {
    const f = fixture();
    await f.start();
    f.observe("active", 2);
    f.requests[0].resolve({ scope, state: "active", revision: 0 });
    await flush();
    expect(f.controller.getSnapshot()).toBe("active");
    expect(f.send).not.toHaveBeenCalled();
    expect(f.native.update).toHaveBeenCalledWith(expect.objectContaining({ scope, progress: 0.6 }));
  });

  test("summary re-entry ends immediately while request is held and ignores its late result", async () => {
    const f = fixture();
    const end = deferred<void>();
    f.native.end.mockReturnValueOnce(end.promise);
    await f.start();
    f.bind({ visibility: "summary", cycle: 1 });
    expect(f.native.end.mock.calls).toEqual([[scope]]);
    expect(f.controller.getSnapshot()).toBe("ending");
    expect(f.controller.back(scope, true)).toBe(false);
    end.resolve(undefined);
    await flush();
    f.requests[0].resolve({ scope, state: "active", revision: 0 });
    await flush();
    expect(f.controller.getSnapshot()).toBe("idle");
    expect(f.native.end.mock.calls).toEqual([[scope]]);
    expect(f.native.update).not.toHaveBeenCalled();
  });

  test("old-scope and out-of-order observations cannot dismiss a new cycle", async () => {
    const f = fixture();
    await f.active();
    f.observe("dismissed", 3);
    f.reenter();
    f.controller.activate();
    await flush();
    f.requests[1].resolve({ scope: nextScope, state: "active", revision: 4 });
    await flush();
    f.observe("ended", 99, scope);
    f.observe("dismissed", 3, nextScope);
    f.observe("ended", 4, nextScope);
    expect(f.controller.getSnapshot()).toBe("active");
    expect(f.owner().visibility).toBe("visible");
    expect(f.controller.back(scope, true)).toBe(false);
    expect(f.send.mock.calls).toEqual([["swipeUp"]]);
  });

  test("a terminal observation preserves one Back action for the current owner", async () => {
    const f = fixture();
    await f.active();
    f.observe("ended");
    f.bind();
    expect(f.controller.back(scope, false)).toBe(true);
    expect(f.controller.back(scope, false)).toBe(false);
    expect(f.send.mock.calls).toEqual([["swipeUp"], ["back", false]]);
  });

  test.each(["request", "update"] as const)("background revocation bypasses a held %s and suppresses foreground recreation", async held => {
    const f = fixture();
    const update = deferred<void>();
    if (held === "request") await f.start();
    else {
      await f.active();
      f.native.update.mockReturnValueOnce(update.promise);
      f.bind({ content: { ...entry, amountMinor: 1200 } });
      await flush();
    }
    const end = deferred<void>();
    f.native.end.mockReturnValueOnce(end.promise);
    f.bind({}, false);
    expect(f.native.setAdmission.mock.calls).toEqual([[true], [false]]);
    expect(f.native.end.mock.calls).toEqual([[scope]]);
    expect(f.owner().visibility).toBe("dismissed");
    expect(f.controller.getSnapshot()).toBe("ending");
    end.resolve(undefined);
    await flush();
    if (held === "request") f.requests[0].resolve({ scope, state: "active", revision: 0 });
    else update.resolve(undefined);
    await flush();
    f.bind();
    f.controller.activate();
    await flush();
    expect(f.native.request).toHaveBeenCalledTimes(1);
    expect(f.controller.getSnapshot()).toBe("idle");
  });

  test("ownership change ends the old scope, rejects its Back ticket, and allows the new owner", async () => {
    const f = fixture();
    await f.active();
    const newSend = vi.fn();
    f.bind({ key: "groceries", content: entry, send: newSend });
    await flush();
    expect(f.native.end.mock.calls).toEqual([[scope]]);
    expect(f.controller.back(scope, true)).toBe(false);
    expect(f.send).not.toHaveBeenCalled();
    f.controller.activate();
    await flush();
    expect(f.native.request.mock.calls[1][0]).toEqual({ scope: nextScope, name: "Groceries", emoji: "🧾", progress: null, tone: "default",
      figures: [{ label: "Amount", value: "−COP 45.000" }] });
    expect(newSend).not.toHaveBeenCalled();
  });

  test("coalesces content changes queued behind one held update into the newest payload", async () => {
    const f = fixture();
    await f.active();
    f.native.update.mockClear();
    const held = deferred<void>();
    f.native.update.mockReturnValueOnce(held.promise);
    f.bind({ content: { ...entry, amountMinor: 1000 } });
    await flush();
    f.bind({ content: { ...entry, amountMinor: 2000 } });
    f.bind({ content: { ...entry, amountMinor: 3000 } });
    f.bind({ content: { ...entry, amountMinor: 4000 } });
    expect(f.native.update).toHaveBeenCalledTimes(1);
    held.resolve(undefined);
    await flush();
    expect(f.native.update.mock.calls).toEqual([
      [{ scope, name: "Groceries", emoji: "🧾", progress: null, tone: "default", figures: [{ label: "Amount", value: "COP 10" }] }],
      [{ scope, name: "Groceries", emoji: "🧾", progress: null, tone: "default", figures: [{ label: "Amount", value: "COP 40" }] }],
    ]);
    expect(f.controller.getSnapshot()).toBe("active");
  });

  test.each(["reject", "malformed", "wrong scope"])("request refusal (%s) cleans up before permitting a retry", async refusal => {
    const f = fixture();
    const cleanup = deferred<void>();
    f.native.end.mockReturnValueOnce(cleanup.promise);
    await f.start();
    if (refusal === "reject") f.requests[0].reject(new Error("ActivityKit refused"));
    else f.requests[0].resolve(refusal === "malformed" ? { state: "active" } : { scope: nextScope, state: "active", revision: 0 });
    await flush();
    f.controller.activate();
    expect(f.native.end.mock.calls).toEqual([[scope]]);
    expect(f.native.request).toHaveBeenCalledTimes(1);
    expect(f.controller.back(scope, true)).toBe(false);
    cleanup.resolve(undefined);
    await flush();
    expect(f.controller.getSnapshot()).toBe("idle");
    f.controller.activate();
    await flush();
    expect(f.native.request).toHaveBeenCalledTimes(2);
    f.requests[1].resolve({ scope: nextScope, state: "active", revision: 0 });
    await flush();
    expect(f.controller.getSnapshot()).toBe("active");
  });

  test.each(["request", "update"] as const)("end failure during held %s remains blocked after late success and events", async held => {
    const f = fixture();
    const update = deferred<void>();
    if (held === "request") await f.start();
    else {
      await f.active();
      f.native.update.mockReturnValueOnce(update.promise);
      f.bind();
      await flush();
    }
    f.native.end.mockRejectedValueOnce(new Error("cleanup failed"));
    f.bind({}, false);
    await flush();
    expect(f.controller.getSnapshot()).toBe("blocked");
    if (held === "request") f.requests[0].resolve({ scope, state: "active", revision: 0 });
    else update.resolve(undefined);
    await flush();
    f.observe("ended", 10);
    f.reenter();
    f.controller.activate();
    await flush();
    expect(f.controller.getSnapshot()).toBe("blocked");
    expect(f.native.request).toHaveBeenCalledTimes(1);
  });

  test("a terminal event cannot release the cleanup barrier before end settles", async () => {
    const f = fixture();
    await f.active();
    const cleanup = deferred<void>();
    f.native.end.mockReturnValueOnce(cleanup.promise);
    f.bind({ key: "other", content: entry });
    f.observe("ended", 2);
    f.controller.activate();
    await flush();
    expect(f.controller.getSnapshot()).toBe("ending");
    expect(f.native.request).toHaveBeenCalledTimes(1);
    cleanup.reject(new Error("end acknowledgement failed"));
    await flush();
    expect(f.controller.getSnapshot()).toBe("blocked");
    f.controller.activate();
    await flush();
    expect(f.native.request).toHaveBeenCalledTimes(1);
  });

  test("failed request cleanup blocks retry even after summary re-entry", async () => {
    const f = fixture();
    f.native.end.mockRejectedValueOnce(new Error("cleanup failed"));
    await f.start();
    f.requests[0].reject(new Error("request refused"));
    await flush();
    expect(f.controller.getSnapshot()).toBe("blocked");
    f.reenter();
    f.controller.activate();
    await flush();
    expect(f.controller.getSnapshot()).toBe("blocked");
    expect(f.native.request).toHaveBeenCalledTimes(1);
    expect(f.controller.back(scope, true)).toBe(false);
  });

  test("dispose revokes admission and ends promptly despite a held request", async () => {
    const f = fixture();
    await f.start();
    f.controller.dispose();
    expect(f.native.end.mock.calls).toEqual([[scope]]);
    expect(f.native.setAdmission.mock.calls).toEqual([[true], [false]]);
    await flush();
    expect(f.native.endAll.mock.calls).toEqual([]);
    f.requests[0].resolve({ scope, state: "active", revision: 0 });
    await flush();
    f.controller.activate();
    expect(f.controller.back(scope, true)).toBe(false);
    expect(f.native.request).toHaveBeenCalledTimes(1);
    expect(f.native.update).not.toHaveBeenCalled();
  });

  test("a disposed controller's delayed revocation acknowledgement leaves its replacement active", async () => {
    const f = fixture();
    await f.active();
    const revoked = deferred<void>();
    f.native.setAdmission.mockImplementationOnce(async admitted => {
      expect(admitted).toBe(false);
      await revoked.promise;
    });
    f.controller.dispose();
    const replacement = new ContextIslandController(f.native, () => nextScope);
    const send = vi.fn();
    try {
      replacement.bind({ key: "groceries", cycle: 0, content: entry, visibility: "visible", send }, true);
      replacement.activate();
      await flush();
      f.requests[1].resolve({ scope: nextScope, state: "active", revision: 0 });
      await replacement.settled();
      expect(replacement.getSnapshot()).toBe("active");
      revoked.resolve(undefined);
      await flush();
      expect(f.native.setAdmission.mock.calls).toEqual([[true], [false], [true]]);
      expect(f.native.endAll.mock.calls).toEqual([]);
      expect(f.native.end.mock.calls).toEqual([[scope]]);
      expect(replacement.getSnapshot()).toBe("active");
      expect(replacement.back(nextScope, true)).toBe(true);
      expect(send.mock.calls).toEqual([["back", true]]);
    } finally {
      replacement.dispose();
      await flush();
    }
  });

  test("queued readmission from a disposed owner cannot revoke its active replacement", async () => {
    const f = fixture();
    await f.start();
    f.bind({}, false);
    f.bind({ visibility: "visible" }, true);
    f.controller.dispose();
    const replacement = new ContextIslandController(f.native, () => nextScope);
    const send = vi.fn();
    try {
      replacement.bind({ key: "groceries", cycle: 0, content: entry, visibility: "visible", send }, true);
      replacement.activate();
      await flush();
      f.requests[1].resolve({ scope: nextScope, state: "active", revision: 0 });
      await replacement.settled();
      expect(replacement.getSnapshot()).toBe("active");
      f.requests[0].resolve({ scope, state: "active", revision: 0 });
      await f.controller.settled();
      expect(f.native.setAdmission.mock.calls).toEqual([[true], [false], [false], [true]]);
      expect(f.native.end.mock.calls).toEqual([[scope]]);
      expect(replacement.getSnapshot()).toBe("active");
      expect(replacement.back(nextScope, true)).toBe(true);
      expect(send.mock.calls).toEqual([["back", true]]);
    } finally {
      replacement.dispose();
      await flush();
    }
  });

  test("an unadmitted or invisible owner cannot request an activity", async () => {
    const f = fixture();
    f.bind({}, false);
    f.controller.activate();
    f.bind({ visibility: "summary" });
    f.controller.activate();
    f.bind({ visibility: "dismissed" });
    f.controller.activate();
    await flush();
    expect(f.native.request).not.toHaveBeenCalled();
    f.bind({ visibility: "visible" });
    f.controller.activate();
    await flush();
    expect(f.controller.getSnapshot()).toBe("requesting");
    expect(f.native.request).toHaveBeenCalledTimes(1);
  });
});

test.each([
  { reduceMotion: false, rejectPreviousRequest: false },
  { reduceMotion: true, rejectPreviousRequest: false },
  { reduceMotion: false, rejectPreviousRequest: true },
])("native Back scrolls to the measured summary, Reduce Motion=$reduceMotion, late rejection=$rejectPreviousRequest", async ({ reduceMotion, rejectPreviousRequest }) => {
  const f = fixture();
  const onBack = vi.fn((target: { y: number; animated: boolean }) => { f.calls.push(`scroll:${target.y}:${target.animated}`); });
  ui.motion = reduceMotion;
  ui.newScope.mockReset().mockReturnValueOnce(scope).mockReturnValue(nextScope);
  ui.module = {
    ...f.native,
    getCapability: async () => ({ supported: true, enabled: true }),
    addListener: () => ({ remove() {} }),
  };
  function Consumer() {
    const props = useContextPill({ identity: "food", active: true, content: budget, onBackToSummary: onBack });
    return React.createElement("scroll", props.scrollProps, React.createElement("summary", props.summaryProps));
  }
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let root: ReactTestRenderer | undefined;
  try {
    await act(async () => { root = create(React.createElement(ContextPillHost, { admitted: true }, React.createElement(Consumer))); });
    if (!root) throw new Error("Host did not mount");
    const tree = root;
    await act(async () => {
      tree.root.findByType("summary").props.onLayout({ nativeEvent: { layout: { y: 64, height: 200 } } });
      tree.root.find(node => String(node.type) === "scroll").props.onScroll({ nativeEvent: { contentOffset: { y: 272 } } });
    });
    await act(async () => {
      tree.root.findAllByType("text").find(node => node.props.onTextLayout)?.props.onTextLayout({ nativeEvent: { lines: [{ width: 120 }] } });
    });
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(tree.root.findAllByType("button").find(node => node.props.accessibilityRole === "button")?.props.accessibilityLabel)
        .toBe("Show summary, Food, COP 80.000 left");
    });
    const pill = tree.root.findAllByType("button").find(node => node.props.accessibilityRole === "button");
    expect(pill?.props.accessibilityLabel).toBe("Show summary, Food, COP 80.000 left");
    await act(async () => { pill?.props.onPress(); });
    expect(f.native.request).toHaveBeenCalledTimes(1);
    if (rejectPreviousRequest) {
      await act(async () => {
        tree.root.find(node => String(node.type) === "scroll").props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
      });
      await act(async () => {
        tree.root.find(node => String(node.type) === "scroll").props.onScroll({ nativeEvent: { contentOffset: { y: 272 } } });
      });
      await act(async () => {
        tree.root.findAllByType("button").find(node => node.props.accessibilityRole === "button")?.props.onPress();
      });
      await act(async () => { f.requests[0].reject(new Error("old request refused late")); });
      expect(f.native.request.mock.calls.map(([payload]) => payload.scope)).toEqual([scope, nextScope]);
    }
    const currentScope = rejectPreviousRequest ? nextScope : scope;
    await act(async () => { f.requests.at(-1)?.resolve({ scope: currentScope, state: "active", revision: 0 }); });
    await act(async () => {
      expect(routeIslandIntent({ path: `lukapp-u01:///context-pill?scope=${currentScope}`, initial: false })).toBeNull();
    });
    expect(onBack.mock.calls).toEqual([[{ y: 64, animated: !reduceMotion }]]);
    expect(f.calls.slice(-2)).toEqual([`scroll:64:${!reduceMotion}`, `end:${currentScope}`]);
    expect(tree.root.findAllByType("button").filter(node => node.props.accessibilityRole === "button")).toHaveLength(0);
  } finally {
    await act(async () => { root?.unmount(); });
    ui.module = null;
    ui.newScope.mockReset().mockReturnValue(scope);
    vi.unstubAllGlobals();
  }
});

test.each([true, false])("foreground capability refresh switches the rendered pill from enabled=%s", async initiallyEnabled => {
  const f = fixture();
  const bootstrapped = deferred<void>();
  const refreshed = deferred<unknown>();
  const getCapability = vi.fn().mockResolvedValueOnce({ supported: true, enabled: initiallyEnabled }).mockReturnValue(refreshed.promise);
  const onBack = vi.fn();
  ui.motion = false;
  ui.appStateListener.mockClear();
  f.native.endAll.mockImplementation(() => bootstrapped.promise);
  ui.module = { ...f.native, getCapability, addListener: () => ({ remove() {} }) };
  function Consumer() {
    const props = useContextPill({ identity: "food", active: true, content: budget, onBackToSummary: onBack });
    return React.createElement("scroll", props.scrollProps, React.createElement("summary", props.summaryProps));
  }
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let root: ReactTestRenderer | undefined;
  try {
    await act(async () => { root = create(React.createElement(ContextPillHost, { admitted: true }, React.createElement(Consumer))); });
    if (!root) throw new Error("Host did not mount");
    const tree = root;
    const button = () => tree.root.findAllByType("button").find(node => node.props.accessibilityRole === "button");
    const scroll = (y: number) => tree.root.find(node => String(node.type) === "scroll").props.onScroll({ nativeEvent: { contentOffset: { y } } });
    const reenter = async () => {
      await act(async () => { scroll(0); });
      await act(async () => { scroll(272); });
    };
    await act(async () => {
      tree.root.findByType("summary").props.onLayout({ nativeEvent: { layout: { y: 64, height: 200 } } });
      scroll(272);
    });
    await act(async () => {
      tree.root.findAllByType("text").find(node => node.props.onTextLayout)?.props.onTextLayout({ nativeEvent: { lines: [{ width: 120 }] } });
    });
    expect(getCapability).not.toHaveBeenCalled();
    await act(async () => { bootstrapped.resolve(); });
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(getCapability).toHaveBeenCalledTimes(1);
      expect(button()?.props.accessibilityLabel).toBe(initiallyEnabled
        ? "Show summary, Food, COP 80.000 left" : "Back to summary, Food, COP 80.000 left");
    });
    if (initiallyEnabled) {
      await act(async () => { button()?.props.onPress(); });
      await act(async () => { f.requests[0].resolve({ scope, state: "active", revision: 0 }); });
    }
    const listener = ui.appStateListener.mock.calls.at(-1)?.[1];
    if (!listener) throw new Error("AppState listener was not registered");
    await act(async () => { listener("background"); });
    await act(async () => { listener("active"); });
    await reenter();
    expect(getCapability).toHaveBeenCalledTimes(2);
    expect(button()?.props.accessibilityLabel).toBe("Back to summary, Food, COP 80.000 left");
    await act(async () => { button()?.props.onPress(); });
    expect(button()?.props.accessibilityLabel).toBe("Back to summary, Food, COP 80.000 left");
    expect(button()?.findByType("text").children).toEqual(["Back to summary"]);
    await act(async () => { button()?.props.onPress(); });
    expect(onBack.mock.calls).toEqual([[{ y: 64, animated: true }]]);
    expect(f.native.request).toHaveBeenCalledTimes(initiallyEnabled ? 1 : 0);
    await reenter();
    await act(async () => { refreshed.resolve({ supported: true, enabled: !initiallyEnabled }); });
    expect(button()?.props.accessibilityLabel).toBe(initiallyEnabled
      ? "Back to summary, Food, COP 80.000 left" : "Show summary, Food, COP 80.000 left");
    await act(async () => { button()?.props.onPress(); });
    if (initiallyEnabled) {
      expect(button()?.findByType("text").children).toEqual(["Back to summary"]);
      await act(async () => { button()?.props.onPress(); });
    } else {
      expect(f.native.request).toHaveBeenCalledTimes(1);
      await act(async () => { f.requests[0].resolve({ scope, state: "active", revision: 0 }); });
      await act(async () => {
        expect(routeIslandIntent({ path: `lukapp-u01:///context-pill?scope=${scope}`, initial: false })).toBeNull();
      });
    }
    expect(onBack.mock.calls).toEqual([[{ y: 64, animated: true }], [{ y: 64, animated: true }]]);
    expect(f.native.request).toHaveBeenCalledTimes(1);
    expect(f.native.endAll.mock.calls).toEqual([[]]);
  } finally {
    await act(async () => { root?.unmount(); });
    ui.module = null;
    vi.unstubAllGlobals();
  }
});

test("changing the rendered owner preserves the native controller and routes Back to the new summary", async () => {
  const f = fixture();
  const onBack = vi.fn();
  ui.motion = false;
  ui.newScope.mockReset().mockReturnValueOnce(scope).mockReturnValue(nextScope);
  ui.module = { ...f.native, getCapability: async () => ({ supported: true, enabled: true }), addListener: () => ({ remove() {} }) };
  function Consumer({ identity }: { identity: string }) {
    const props = useContextPill({ identity, active: true, content: identity === "food" ? budget : entry, onBackToSummary: onBack });
    return React.createElement("scroll", props.scrollProps, React.createElement("summary", props.summaryProps));
  }
  const render = (identity: string) => React.createElement(ContextPillHost, { admitted: true }, React.createElement(Consumer, { identity }));
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let root: ReactTestRenderer | undefined;
  try {
    await act(async () => { root = create(render("food")); });
    if (!root) throw new Error("Host did not mount");
    const tree = root;
    const button = () => tree.root.findAllByType("button").find(node => node.props.accessibilityRole === "button");
    const measure = async () => {
      await act(async () => {
        tree.root.findAllByType("text").find(node => node.props.onTextLayout)?.props.onTextLayout({ nativeEvent: { lines: [{ width: 120 }] } });
      });
    };
    await act(async () => {
      tree.root.findByType("summary").props.onLayout({ nativeEvent: { layout: { y: 64, height: 200 } } });
      tree.root.find(node => String(node.type) === "scroll").props.onScroll({ nativeEvent: { contentOffset: { y: 272 } } });
    });
    await measure();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(button()?.props.accessibilityLabel).toBe("Show summary, Food, COP 80.000 left");
    });
    await act(async () => { button()?.props.onPress(); });
    await act(async () => { f.requests[0].resolve({ scope, state: "active", revision: 0 }); });
    await act(async () => { tree.update(render("groceries")); });
    await measure();
    expect(button()?.props.accessibilityLabel).toBe("Show summary, Groceries, −COP 45.000");
    expect(f.native.endAll.mock.calls).toEqual([[]]);
    expect(f.native.setAdmission.mock.calls).toEqual([[true]]);
    expect(f.native.end.mock.calls).toEqual([[scope]]);
    await act(async () => {
      tree.root.findByType("summary").props.onLayout({ nativeEvent: { layout: { y: 96, height: 160 } } });
      button()?.props.onPress();
    });
    expect(f.native.request.mock.calls.map(([payload]) => payload.scope)).toEqual([scope, nextScope]);
    await act(async () => { f.requests[1].resolve({ scope: nextScope, state: "active", revision: 0 }); });
    await act(async () => {
      expect(routeIslandIntent({ path: `lukapp-u01:///context-pill?scope=${scope}`, initial: false })).toBe("/");
      expect(routeIslandIntent({ path: `lukapp-u01:///context-pill?scope=${nextScope}`, initial: false })).toBeNull();
    });
    expect(onBack.mock.calls).toEqual([[{ y: 96, animated: true }]]);
  } finally {
    await act(async () => { root?.unmount(); });
    ui.module = null;
    ui.newScope.mockReset().mockReturnValue(scope);
    vi.unstubAllGlobals();
  }
});
