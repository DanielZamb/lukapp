import * as React from "react";
import { createElement as h } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { KeyboardFrame } from "./KeyboardFrame";
const native = vi.hoisted(() => {
  const state: { bottom: number; keyboardTop?: number; height: number; state: number; listeners: Map<string, (event: { endCoordinates: { screenY: number } }) => void> } = { bottom: 711, height: 0, state: 0, listeners: new Map() };
  return state;
});
vi.mock("react-native", () => ({ View: "view", StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 }, Dimensions: { get: () => ({ height: 711 }) }, Keyboard: { metrics: () => native.keyboardTop === undefined ? undefined : { screenY: native.keyboardTop }, addListener: (name: string, handler: (event: { endCoordinates: { screenY: number } }) => void) => { native.listeners.set(name, handler); return { remove: () => native.listeners.delete(name) }; } } }));
vi.mock("react-native-reanimated", () => ({ KeyboardState: { UNKNOWN: 0 }, default: { View: "view" }, useAnimatedKeyboard: () => ({ height: { get value() { return native.height; } }, state: { get value() { return native.state; } } }), useAnimatedStyle: (style: () => unknown) => style() }));
let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); native.bottom = 711; native.keyboardTop = undefined; native.height = 0; native.state = 0; });
afterEach(async () => { await act(async () => root?.unmount()); expect(native.listeners.size).toBe(0); vi.unstubAllGlobals(); });
test("edge-to-edge keyboard clearance resets on hide and does not double-count native resize", async () => {
  await act(async () => { root = create(h(KeyboardFrame, null, h("body")), { createNodeMock: () => ({ measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 320, native.bottom) }) }); });
  const host = root?.root.findByType("view");
  await act(async () => host?.props.onLayout({ nativeEvent: { layout: { y: 0, height: 711 } } }));
  await act(async () => native.listeners.get("keyboardDidShow")?.({ endCoordinates: { screenY: 425 } }));
  expect(host?.props.style[1].paddingBottom).toBe(286);
  native.bottom = 425;
  await act(async () => host?.props.onLayout({ nativeEvent: { layout: { y: 0, height: 425 } } }));
  expect(host?.props.style[1].paddingBottom).toBe(0);
  native.bottom = 711;
  await act(async () => { native.listeners.get("keyboardDidHide")?.({ endCoordinates: { screenY: 671 } }); host?.props.onLayout({ nativeEvent: { layout: { y: 0, height: 711 } } }); });
  expect(host?.props.style[1].paddingBottom).toBe(0);
});

test("mounting while the keyboard is open uses its current geometry", async () => {
  native.keyboardTop = 425;
  await act(async () => { root = create(h(KeyboardFrame, null, h("body")), { createNodeMock: () => ({ measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 320, native.bottom) }) }); });
  const host = root?.root.findByType("view");
  await act(async () => host?.props.onLayout({ nativeEvent: { layout: { y: 0, height: 711 } } }));
  expect(host?.props.style[1].paddingBottom).toBe(286);
  native.height = 361;
  native.state = 2;
  await act(async () => root?.update(h(KeyboardFrame, null, h("body"))));
  expect(host?.props.style[1].paddingBottom).toBe(361);
});
