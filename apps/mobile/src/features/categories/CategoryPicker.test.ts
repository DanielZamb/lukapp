import * as React from "react";
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { BottomSheetProps, BottomSheetModal } from "@gorhom/bottom-sheet";
import type { CategorySheet } from "./CategorySheet";
import { CategoryPicker } from "./CategoryPicker";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

const android = vi.hoisted(() => ({
  os: "ios", busy: false, handler: undefined as (() => boolean) | undefined,
}));
vi.mock("react-native", () => ({
  Platform: { get OS() { return android.os; } },
  BackHandler: { addEventListener: (_event: string, handler: () => boolean) => {
    android.handler = handler;
    return { remove: () => { android.handler = undefined; } };
  } },
}));
// Exercise the installed Gorhom modal, provider and portal. Only native drawing/animation is replaced.
vi.mock("@gorhom/bottom-sheet", async () => ({
  BottomSheetModal: (await vi.importActual<{ default: typeof BottomSheetModal }>("@gorhom/bottom-sheet/src/components/bottomSheetModal/BottomSheetModal")).default,
  BottomSheetModalProvider: (await vi.importActual<{ default: typeof BottomSheetModalProvider }>("@gorhom/bottom-sheet/src/components/bottomSheetModalProvider/BottomSheetModalProvider")).default,
}));
vi.mock("@gorhom/bottom-sheet/src/constants", () => ({
  INITIAL_CONTAINER_LAYOUT: { height: 800, offset: { top: 0, bottom: 0, left: 0, right: 0 } },
  MODAL_STACK_BEHAVIOR: { replace: "replace", switch: "switch" },
}));
vi.mock("react-native-reanimated", () => ({
  useSharedValue: (value: unknown) => useRef({ value }).current,
}));
vi.mock("@gorhom/bottom-sheet/src/hooks", () =>
  vi.importActual<Record<string, unknown>>("@gorhom/bottom-sheet/src/hooks/useBottomSheetModalInternal"));
vi.mock("@gorhom/bottom-sheet/src/utilities", () => ({ print: () => {} }));
vi.mock("@gorhom/bottom-sheet/src/components/bottomSheetHostingContainer", () => ({
  BottomSheetHostingContainer: () => null,
}));
vi.mock("@gorhom/bottom-sheet/src/components/bottomSheet", () => ({
  default: forwardRef(function NativeSheet(props: BottomSheetProps, ref) {
    useEffect(() => { props.onChange?.(props.index ?? 0, 0, 0); }, []);
    useImperativeHandle(ref, () => ({
      forceClose: () => props.onClose?.(),
      snapToIndex: (index: number) => props.onChange?.(index, 0, 0),
    }));
    return createElement("sheet-surface", null,
      typeof props.children === "function" ? null : props.children);
  }),
}));
vi.mock("./useCategoryPicker", () => ({
  useCategoryPicker: (_mode: unknown, onClose: () => void) => ({ sheet: { busy: android.busy, onDismiss: onClose } }),
}));
vi.mock("./CategorySheet", async () => {
  const { default: Modal } = await vi.importActual<{ default: typeof BottomSheetModal }>("@gorhom/bottom-sheet/src/components/bottomSheetModal/BottomSheetModal");
  return {
    CategorySheet: (props: ComponentProps<typeof CategorySheet>) => createElement(
      Modal<never>,
      {
        ref: props.sheetRef, onDismiss: props.onDismiss,
        snapPoints: ["92%"], enableDynamicSizing: false,
        children: createElement("category-options", { testID: "category-options" }, "Search categories"),
      },
    ),
  };
});

let root: ReactTestRenderer | undefined;
let frames: FrameRequestCallback[];
beforeEach(() => {
  android.os = "ios";
  android.busy = false;
  android.handler = undefined;
  frames = [];
  vi.stubGlobal("__DEV__", false);
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
async function flushFrames() {
  await act(async () => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(0));
  });
}
function render(visible: boolean, onClose = () => {}) {
  return createElement(BottomSheetModalProvider, null,
    createElement(CategoryPicker, {
      workspaceId: "workspace", value: { ids: [], primaryId: null },
      onChange: () => {}, visible, onClose,
    }));
}
function content() {
  return root?.toJSON();
}

test("a picker initially hidden renders its actual portal content on the first open", async () => {
  await act(async () => { root = create(render(false)); });
  await flushFrames();
  expect(content()).toBeNull();
  await act(async () => { root?.update(render(true)); });
  await flushFrames();
  expect(content()).toEqual({
    type: "sheet-surface", props: {}, children: [
      { type: "category-options", props: { testID: "category-options" }, children: ["Search categories"] },
    ],
  });
});

test("a visible picker dismisses and can reopen the actual modal portal", async () => {
  const onClose = vi.fn();
  await act(async () => { root = create(render(true, onClose)); });
  await flushFrames();
  expect(root?.root.findAll((node) => node.props.testID === "category-options")).toHaveLength(1);
  await act(async () => { root?.update(render(false, onClose)); });
  expect(content()).toBeNull();
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () => { root?.update(render(true, onClose)); });
  await flushFrames();
  expect(root?.root.findAll((node) => node.props.testID === "category-options")).toHaveLength(1);
});

test("Android Back consumes without dismissing while saving, then dismisses the actual portal when idle", async () => {
  android.os = "android";
  android.busy = true;
  const onClose = vi.fn();
  await act(async () => { root = create(render(true, onClose)); });
  await flushFrames();
  expect(android.handler?.()).toBe(true);
  expect(root?.root.findAll((node) => node.props.testID === "category-options")).toHaveLength(1);
  expect(onClose).not.toHaveBeenCalled();
  android.busy = false;
  await act(async () => { root?.update(render(true, onClose)); });
  let handled = false;
  await act(async () => { handled = android.handler?.() ?? false; });
  expect(handled).toBe(true);
  expect(content()).toBeNull();
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () => { root?.update(render(false, onClose)); });
  expect(android.handler).toBeUndefined();
  await act(async () => { root?.update(render(true, onClose)); });
  await flushFrames();
  expect(root?.root.findAll((node) => node.props.testID === "category-options")).toHaveLength(1);
  await act(async () => root?.unmount());
  root = undefined;
  expect(android.handler).toBeUndefined();
});
