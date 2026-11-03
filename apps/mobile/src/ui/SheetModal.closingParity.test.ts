import * as React from "react";
import { createElement, createRef, useImperativeHandle, type PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BackHandler, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { SheetModal, type NativeSheetProps } from "./SheetModal";
import { SheetAccessibilityBoundary, SheetAccessibilityProvider } from "./SheetAccessibility";

const native = vi.hoisted(() => ({ listeners: new Set<() => boolean>(), present: vi.fn(), dismiss: vi.fn() }));
vi.mock("react-native", () => ({
  View: "view",
  BackHandler: { addEventListener: (_event: string, listener: () => boolean) => {
    native.listeners.add(listener);
    return { remove: () => native.listeners.delete(listener) };
  } },
}));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: React.forwardRef(function ControlledNativeModal({ children, ...props }: PropsWithChildren<NativeSheetProps>, ref) {
    useImperativeHandle(ref, () => ({ present: native.present, dismiss: native.dismiss }));
    return createElement("native-modal", props, children);
  }),
}));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.listeners.clear(); native.present.mockClear(); native.dismiss.mockClear();
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
function modal() { return root!.root.find((node) => String(node.type) === "native-modal"); }
function backgroundHidden() {
  return root!.root.findByType(SheetAccessibilityBoundary).findAllByType(View)[0].props.importantForAccessibility === "no-hide-descendants";
}
function dispatchBack() { return [...native.listeners].reverse().some((listener) => listener()); }
function render({ busy = false, tracked = false, dismissed }: { busy?: boolean; tracked?: boolean; dismissed: () => void }) {
  return createElement(SheetAccessibilityProvider, null,
    createElement(SheetAccessibilityBoundary, null, createElement(View, { testID: "background" })),
    createElement(SheetModal, { sheetRef: ref, presentOnMount: true, trackPresentation: tracked, androidBack: true, busy, onDismiss: dismissed }, createElement(View)),
  );
}
let ref = createRef<BottomSheetModal>();

test.each([
  { label: "parity", tracked: false, busy: false }, { label: "parity", tracked: false, busy: true },
  { label: "regression", tracked: true, busy: false }, { label: "regression", tracked: true, busy: true },
])("SEN-98 $label: closing Back stays owned until onDismiss, tracked=$tracked busy=$busy", async ({ tracked, busy }) => {
  ref = createRef<BottomSheetModal>();
  const backgroundBack = vi.fn(() => true);
  const backgroundSubscription = BackHandler.addEventListener("hardwareBackPress", backgroundBack);
  const dismissed = vi.fn();
  await act(async () => { root = create(render({ tracked, dismissed })); });
  await act(async () => modal().props.onChange?.(0, 0, 0));
  let firstBack = false;
  await act(async () => { firstBack = dispatchBack(); });
  expect(firstBack).toBe(true);
  expect(native.dismiss).toHaveBeenCalledOnce();
  await act(async () => modal().props.onChange?.(-1, 0, 0));
  await act(async () => root!.update(render({ tracked, busy, dismissed })));
  const beforeSecondBack = { hidden: backgroundHidden(), notifications: dismissed.mock.calls.length };
  let secondBack = false;
  await act(async () => { secondBack = dispatchBack(); });
  expect({ beforeSecondBack, secondBack, backgroundBacks: backgroundBack.mock.calls.length, notifications: dismissed.mock.calls.length })
    .toEqual({ beforeSecondBack: { hidden: true, notifications: 0 }, secondBack: true, backgroundBacks: 0, notifications: 0 });
  await act(async () => modal().props.onDismiss());
  expect(dismissed).toHaveBeenCalledOnce();
  expect(backgroundHidden()).toBe(false);
  await act(async () => { expect(dispatchBack()).toBe(true); });
  expect(backgroundBack).toHaveBeenCalledOnce();
  backgroundSubscription.remove();
});

test("SEN-98 parity: a negative index without a close releases a tracked sheet", async () => {
  ref = createRef<BottomSheetModal>();
  const backgroundBack = vi.fn(() => true);
  const backgroundSubscription = BackHandler.addEventListener("hardwareBackPress", backgroundBack);
  const dismissed = vi.fn();
  await act(async () => { root = create(render({ tracked: true, dismissed })); });
  await act(async () => modal().props.onChange?.(0, 0, 0));
  expect(backgroundHidden()).toBe(true);
  await act(async () => modal().props.onChange(-1, 0, 0));
  expect(backgroundHidden()).toBe(false);
  await act(async () => { expect(dispatchBack()).toBe(true); });
  expect(backgroundBack).toHaveBeenCalledOnce();
  expect(native.dismiss).not.toHaveBeenCalled();
  expect(dismissed).not.toHaveBeenCalled();
  backgroundSubscription.remove();
});
