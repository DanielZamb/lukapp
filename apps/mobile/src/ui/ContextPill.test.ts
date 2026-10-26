import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ContextPillHost, useContextPill } from "./ContextPill";

const native = vi.hoisted(() => ({ tier: "xxxl", motion: false, platform: "android", mounts: 0, island: false, reader: false, cutout: { kind: "none", rect: null }, camera: vi.fn(), back: vi.fn() }));
vi.mock("react-native", () => ({
  Platform: { get OS() { return native.platform; } }, View: "view", Text: "text", Pressable: "button", ScrollView: "pill-scroll", StatusBar: "status",
  StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
  useWindowDimensions: () => ({ width: 320, height: 720, fontScale: 1.5 }),

}));
vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  return {
    default: { View: "animated-view", createAnimatedComponent: (component: unknown) => component },
    useSharedValue: (value: number) => React.useRef({ value }).current,
    useAnimatedStyle: (style: () => Record<string, unknown>) => new Proxy({}, { get: (_target, key) => style()[String(key)] }),
    useAnimatedReaction: (prepare: () => unknown, react: (value: unknown) => void) => React.useEffect(() => { react(prepare()); }),
    withTiming: (value: number, _options: unknown, complete?: (finished: boolean) => void) => { complete?.(true); return value; }, cancelAnimation: () => {},
    interpolate: (value: number, inputs: number[], outputs: number[]) => {
      const index = Math.min(inputs.length - 2, Math.max(0, inputs.findIndex(input => input >= value) - 1));
      return outputs[index] + (value - inputs[index]) / (inputs[index + 1] - inputs[index]) * (outputs[index + 1] - outputs[index]);
    },
    Easing: { linear: () => {}, bezier: () => {}, out: () => {}, cubic: () => {} }, ReduceMotion: { Never: "never" },
  };
});
vi.mock("react-native-worklets", () => ({ scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args) }));
vi.mock("react-native-gesture-handler", () => {
  type Callback = (event: { translationY: number }, success?: boolean) => void;
  const pan = () => {
    const handlers: Record<string, Callback> = {};
    const gesture = { handlers, enabled: () => gesture, activeOffsetY: () => gesture, failOffsetX: () => gesture,
      onStart: (fn: Callback) => { handlers.start = fn; return gesture; }, onUpdate: (fn: Callback) => { handlers.update = fn; return gesture; },
      onEnd: (fn: Callback) => { handlers.end = fn; return gesture; }, onFinalize: (fn: Callback) => { handlers.finalize = fn; return gesture; } };
    return gesture;
  };
  return { Gesture: { Pan: pan }, GestureDetector: "gesture" };
});
vi.mock("expo-blur", () => ({ BlurTargetView: "blur-target" }));
vi.mock("./Glass", () => ({ Glass: "glass", usePillAccessibility: () => ({ reduceMotion: native.motion, reduceTransparency: false, screenReader: native.reader, ready: true }) }));
vi.mock("./themeContext", () => ({ useTier: () => native.tier, useThemeMode: () => "light" }));
vi.mock("../device/cameraCutout", () => ({ useCameraCutout: () => { native.camera(); return native.island ? { kind: "centredPunchHole", rect: { x: 150, y: 0, width: 20, height: 30 } } : native.cutout; } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 40, bottom: 24 }) }));
const content = { kind: "budget", name: "Food", emoji: "🥗", currency: "COP", limitMinor: 20000000, spentMinor: 12000000 } satisfies import("./contextPillModel").ContextPillContent;
function Consumer({ active = true, identity = "food" }: { active?: boolean; identity?: string }) {
  React.useEffect(() => { native.mounts++; }, []);
  const props = useContextPill({ active, identity, content, onBackToSummary: native.back });
  return createElement("scroll", { ...props.scrollProps }, createElement("summary", props.summaryProps));
}
let root: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  native.tier = "xxxl"; native.motion = false; native.platform = "android"; native.mounts = 0; native.island = false; native.reader = false;
  vi.clearAllMocks();
});
afterEach(async () => { await act(async () => root?.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function mount(active = true, identity = "food") {
  await act(async () => { root = create(createElement(ContextPillHost, {}, createElement(Consumer, { active, identity }))); });
}
async function layout() { await act(async () => root.root.findByType("summary").props.onLayout({ nativeEvent: { layout: { y: 0, height: 200 } } })); }
async function scroll(y: number) { await act(async () => root.root.find(node => String(node.type) === "scroll").props.onScroll({ nativeEvent: { contentOffset: { y } } })); }
function pills() { return root.root.findAllByType("button").filter(node => node.props.accessibilityRole === "button"); }
function text() { return root.root.findAllByType("text").map(node => node.children.join("")); }

test("observes scroll, hides during return, and re-arms only after seeing the summary", async () => {
  await mount(); await layout(); expect(pills()).toHaveLength(0);
  await scroll(208); expect(pills()).toHaveLength(1);
  expect(pills()[0].props.accessibilityLabel).toBe("Back to summary, Food, COP 80.000 left");
  await act(async () => pills()[0].props.onPress());
  expect(native.back).toHaveBeenCalledWith({ y: 0, animated: true });
  expect(pills()).toHaveLength(0);
  await scroll(180); await scroll(208); expect(pills()).toHaveLength(1);
});
test("a new identity reuses unchanged mounted summary geometry and resets suppression", async () => {
  await mount();
  await act(async () => root.root.findByType("summary").props.onLayout({ nativeEvent: { layout: { y: 40, height: 200 } } }));
  await scroll(248);
  await act(async () => pills()[0].props.onPress());
  expect(pills()).toHaveLength(0);
  await act(async () => root.update(createElement(ContextPillHost, {}, createElement(Consumer, { identity: "transport" }))));
  expect(native.mounts).toBe(1);
  await scroll(0);
  await scroll(248);
  expect(pills()).toHaveLength(1);
  await act(async () => pills()[0].props.onPress());
  expect(native.back).toHaveBeenLastCalledWith({ y: 40, animated: true });
});
test("a covered host collects changed identity geometry before reactivation", async () => {
  await mount();
  await act(async () => root.root.findByType("summary").props.onLayout({ nativeEvent: { layout: { y: 40, height: 200 } } }));
  await scroll(248);
  await act(async () => root.update(createElement(ContextPillHost, {}, createElement(Consumer, { active: false }))));
  await act(async () => root.update(createElement(ContextPillHost, {}, createElement(Consumer, { active: false, identity: "transport" }))));
  await act(async () => root.root.findByType("summary").props.onLayout?.({ nativeEvent: { layout: { y: 120, height: 200 } } }));
  expect(pills()).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => root.update(createElement(ContextPillHost, {}, createElement(Consumer, { identity: "transport" }))));
  expect(pills()).toHaveLength(0);
  await scroll(328);
  expect(pills()).toHaveLength(1);
  await act(async () => pills()[0].props.onPress());
  expect(native.back).toHaveBeenLastCalledWith({ y: 120, animated: true });
});
test("upward swipe stays hidden through more scrolling until the summary returns", async () => {
  await mount(); await layout(); await scroll(208);
  await act(async () => {
    const handlers = root.root.findAll(node => String(node.type) === "gesture")[0].props.gesture.handlers;
    handlers.start({ translationY: 0 }); handlers.update({ translationY: -30 }); handlers.end({ translationY: -30 });
  });
  await scroll(400); expect(pills()).toHaveLength(0);
  await scroll(0); await scroll(208); expect(pills()).toHaveLength(1);
});
test.each([[false, 3000], [true, 1200]])("Reduce Motion %s docks at %i ms", async (motion, delay) => {
  native.motion = motion;
  await mount(); await layout(); await scroll(208);
  expect(root.root.find(node => String(node.type) === "glass").props.style[1].borderRadius).toBe(30);
  await act(async () => { vi.advanceTimersByTime(delay - 1); });
  expect(root.root.find(node => String(node.type) === "glass").props.style[1].borderRadius).toBe(30);
  await act(async () => { vi.advanceTimersByTime(1); });
  expect(root.root.find(node => String(node.type) === "glass").props.style[1].borderRadius).toBe(26);
  expect(pills()).toHaveLength(1);
  await act(async () => pills()[0].props.onPress());
  expect(native.back).toHaveBeenCalledWith({ y: 0, animated: !motion });
});
test("suspension removes the pill and cancels its dock timer", async () => {
  await mount(); await layout(); await scroll(208);
  await act(async () => root.update(createElement(ContextPillHost, {}, createElement(Consumer, { active: false }))));
  expect(pills()).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});
test.each(["default", "reflow"])("%s has no pill, callbacks, detector or timer", async tier => {
  native.tier = tier;
  await mount();
  expect(root.root.findAll(node => String(node.type) === "glass")).toHaveLength(0);
  expect(root.root.find(node => String(node.type) === "scroll").props.onScroll).toBeUndefined();
  expect(root.root.findByType("summary").props.onLayout).toBeUndefined();
  expect(native.camera).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test.each([
  ["android", "default", 0], ["android", "reflow", 0], ["android", "xxxl", 1],
  ["ios", "default", 0], ["ios", "reflow", 0], ["ios", "xxxl", 0],
])("%s %s mounts %i Android blur targets", async (platform, tier, targets) => {
  native.platform = String(platform); native.tier = String(tier);
  await mount();
  expect(root.root.findAll(node => String(node.type) === "blur-target")).toHaveLength(Number(targets));
});
test("iOS Dynamic Type changes preserve the mounted screen", async () => {
  native.platform = "ios"; native.tier = "default";
  await mount(); expect(native.mounts).toBe(1);
  native.tier = "xxxl";
  await act(async () => root.update(createElement(ContextPillHost, {}, createElement(Consumer, {}))));
  expect(native.mounts).toBe(1);
  native.tier = "default";
  await act(async () => root.update(createElement(ContextPillHost, {}, createElement(Consumer, {}))));
  expect(native.mounts).toBe(1);
});

test("expanded island has one Back button and bounded scrolling content", async () => {
  native.island = true;
  await mount(); await layout(); await scroll(208);
  await act(async () => root.root.findAllByType("text").find(node => node.props.onTextLayout)?.props.onTextLayout({ nativeEvent: { lines: [{ width: 120 }] } }));
  await act(async () => pills()[0].props.onPress());
  expect(pills()).toHaveLength(1);
  expect(root.root.find(node => String(node.type) === "pill-scroll").props.style.maxHeight).toBe(560);
  expect(native.back).not.toHaveBeenCalled();
  await act(async () => pills()[0].props.onPress());
  expect(native.back).toHaveBeenCalledWith({ y: 0, animated: true });
});
test("screen-reader Back action does not advertise a collapsed expandable control", async () => {
  native.island = true; native.reader = true;
  await mount(); await layout(); await scroll(208);
  await act(async () => root.root.findAllByType("text").find(node => node.props.onTextLayout)?.props.onTextLayout({ nativeEvent: { lines: [{ width: 120 }] } }));
  expect(pills()[0].props.accessibilityState).toBeUndefined();
  await act(async () => pills()[0].props.onPress());
  expect(native.back).toHaveBeenCalledWith({ y: 0, animated: true });
});

test("Android island mounts black and keeps the below-pill target out of both header-control lanes", async () => {
  native.island = true;
  await mount(); await layout(); await scroll(208);
  await act(async () => root.root.findAllByType("text").find(node => node.props.onTextLayout)?.props.onTextLayout({ nativeEvent: { lines: [{ width: 120 }] } }));
  expect(root.root.findAll(node => String(node.type) === "glass")).toHaveLength(0);
  expect(pills()[0].props.hitSlop).toBeUndefined();
  const extension = root.root.findAllByType("button").find(node => node.props.style?.top === 24);
  expect(extension?.props.style).toEqual({ position: "absolute", top: 24, left: 48, width: 208, height: 20 });
  expect(extension?.props.accessible).toBe(false);
  await act(async () => extension?.props.onPress());
  expect(text()).toContain("Back to summary");
  expect(root.root.findAll(node => String(node.type) === "animated-view").some(node => Array.isArray(node.props.style) && node.props.style.some((style: { backgroundColor?: string } | undefined) => style?.backgroundColor === "#000000"))).toBe(true);
});

test("scroll visibility flips keep the same pill mounted and expose one action", async () => {
  await mount(); await layout(); await scroll(208);
  const pill = root.root.find(node => typeof node.type === "function" && node.type.name === "Pill");
  expect(pills()).toHaveLength(1);
  await scroll(0);
  expect(pills()).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(root.root.find(node => typeof node.type === "function" && node.type.name === "Pill")).toBe(pill);
  await scroll(208);
  expect(pills()).toHaveLength(1);
  expect(root.root.find(node => typeof node.type === "function" && node.type.name === "Pill")).toBe(pill);
});
