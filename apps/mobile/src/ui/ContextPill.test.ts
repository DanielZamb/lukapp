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
  PanResponder: { create: (handlers: unknown) => ({ panHandlers: handlers }) },
  Animated: { View: "animated-view", Value: class {
    value: number;
    constructor(value: number) { this.value = value; }
    interpolate({ outputRange }: { outputRange: number[] }) {
      return { read: () => outputRange[0] + this.value * (outputRange[1] - outputRange[0]) };
    }
  }, timing: (value: { value: number }, config: { toValue: number }) => ({ start: () => { value.value = config.toValue; }, stop: () => {} }) },
  Easing: { bezier: () => {} },
}));
vi.mock("expo-blur", () => ({ BlurTargetView: "blur-target" }));
vi.mock("./Glass", () => ({ Glass: "glass", usePillAccessibility: () => ({ reduceMotion: native.motion, reduceTransparency: false, screenReader: native.reader, ready: true }) }));
vi.mock("./themeContext", () => ({ useTier: () => native.tier, useThemeMode: () => "light" }));
vi.mock("../device/cameraCutout", () => ({ useCameraCutout: () => { native.camera(); return native.island ? { kind: "centredPunchHole", rect: { x: 142, y: 0, width: 43, height: 40 } } : native.cutout; } }));
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
test("upward swipe stays hidden through more scrolling until the summary returns", async () => {
  await mount(); await layout(); await scroll(208);
  await act(async () => root.root.findAll(node => typeof node.props.onPanResponderRelease === "function")[0].props.onPanResponderRelease({ nativeEvent: { pageY: 12 } }, { dy: -20, y0: 42 }));
  await scroll(400); expect(pills()).toHaveLength(0);
  await scroll(0); await scroll(208); expect(pills()).toHaveLength(1);
});
test.each([[false, 3000], [true, 1200]])("Reduce Motion %s docks at %i ms", async (motion, delay) => {
  native.motion = motion;
  await mount(); await layout(); await scroll(208);
  expect(root.root.find(node => String(node.type) === "glass").props.style.borderRadius.read()).toBe(30);
  await act(async () => { vi.advanceTimersByTime(delay - 1); });
  expect(root.root.find(node => String(node.type) === "glass").props.style.borderRadius.read()).toBe(30);
  await act(async () => { vi.advanceTimersByTime(1); });
  expect(root.root.find(node => String(node.type) === "glass").props.style.borderRadius.read()).toBe(26);
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
  expect(root.root.find(node => String(node.type) === "pill-scroll").props.style.maxHeight).toBe(550);
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
