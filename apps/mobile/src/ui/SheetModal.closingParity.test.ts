import * as React from "react";
import { createElement, createRef, useImperativeHandle, useRef, type PropsWithChildren } from "react";
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
    const instance = useRef(Symbol("native-modal"));
    useImperativeHandle(ref, () => ({
      present: (...args: Parameters<BottomSheetModal["present"]>) => native.present(instance.current, ...args),
      dismiss: (...args: Parameters<BottomSheetModal["dismiss"]>) => native.dismiss(instance.current, ...args),
    }));
    return createElement("native-modal", { ...props, instance: instance.current }, children);
  }),
}));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.listeners.clear(); native.present.mockClear(); native.dismiss.mockClear();
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
function modal() { return root!.root.find((node) => String(node.type) === "native-modal"); }
function backgroundHidden() {
  return root!.root.findByType(SheetAccessibilityBoundary).findAllByType(View)[0].props.importantForAccessibility === "no-hide-descendants";
}
function dispatchBack() { return [...native.listeners].reverse().some((listener) => listener()); }

type OrderingStep = {
  event: "present" | "ack" | "negative" | "dismissed" | "back" | "elapsed" | "unmount" | "lateCallbacks";
  expect?: Partial<{ presents: number; dismisses: number; closes: number; hidden: boolean; outerBacks: number; changes: number }>;
};
type Ordering = {
  label: "parity" | "regression";
  name: string;
  tracked?: boolean;
  busy?: boolean;
  presentOnChange?: boolean;
  presentOnDismiss?: boolean;
  steps: OrderingStep[];
};
const orderings: Ordering[] = [
  { label: "regression", name: "early Back is ignored and the next Back after acknowledgement closes", steps: [
    { event: "back", expect: { dismisses: 0, closes: 0, outerBacks: 0 } },
    { event: "elapsed", expect: { dismisses: 0, closes: 0, hidden: true } },
    { event: "ack", expect: { dismisses: 0 } }, { event: "back", expect: { dismisses: 1 } },
    { event: "dismissed", expect: { closes: 1, hidden: false } },
  ] },
  { label: "regression", name: "double early Back leaves no deferred close", tracked: true, steps: [
    { event: "back" }, { event: "back", expect: { dismisses: 0, outerBacks: 0 } },
    { event: "negative", expect: { hidden: true } }, { event: "back", expect: { outerBacks: 0 } },
    { event: "ack", expect: { dismisses: 0, closes: 0, hidden: true } },
    { event: "back" }, { event: "dismissed", expect: { closes: 1 } },
  ] },
  { label: "parity", name: "double Back after acknowledgement retries dismiss and notifies once", steps: [
    { event: "ack" }, { event: "back" }, { event: "negative" },
    { event: "back", expect: { dismisses: 2, closes: 0, hidden: true, outerBacks: 0 } },
    { event: "dismissed", expect: { closes: 1, hidden: false } }, { event: "back", expect: { outerBacks: 1 } },
  ] },
  { label: "parity", name: "busy Back remains consumed after acknowledgement", busy: true, steps: [
    { event: "ack" }, { event: "back" }, { event: "back", expect: { dismisses: 0, closes: 0, outerBacks: 0, hidden: true } },
  ] },
  { label: "parity", name: "same-detent drag cancellation with no callback allows another Back", steps: [
    { event: "ack" }, { event: "back" }, { event: "elapsed", expect: { closes: 0, hidden: true } },
    { event: "back", expect: { dismisses: 2, outerBacks: 0 } }, { event: "dismissed", expect: { closes: 1 } },
  ] },
  { label: "parity", name: "drag back to an open index allows another Back", tracked: true, steps: [
    { event: "ack" }, { event: "back" }, { event: "negative", expect: { hidden: false } },
    { event: "ack", expect: { hidden: true } }, { event: "back", expect: { dismisses: 2, outerBacks: 0 } },
    { event: "dismissed", expect: { closes: 1 } },
  ] },
  { label: "parity", name: "tracked native negative position releases background and Back", tracked: true, steps: [
    { event: "ack" }, { event: "negative", expect: { hidden: false, closes: 0 } },
    { event: "back", expect: { dismisses: 0, outerBacks: 1 } }, { event: "dismissed", expect: { closes: 1 } },
  ] },
  { label: "parity", name: "reopen during close reaches native and the next Back dismisses", steps: [
    { event: "ack" }, { event: "back" }, { event: "present", expect: { presents: 2, hidden: true } },
    { event: "back", expect: { dismisses: 2, outerBacks: 0 } }, { event: "dismissed", expect: { closes: 1 } },
  ] },
  { label: "regression", name: "deferred re-present after dismissal restores early Back ownership", steps: [
    { event: "ack" }, { event: "back" }, { event: "dismissed", expect: { closes: 1, hidden: false } },
    { event: "present", expect: { presents: 2, hidden: true } },
    { event: "back", expect: { dismisses: 1, closes: 1, outerBacks: 0 } },
    { event: "ack", expect: { dismisses: 1 } }, { event: "back", expect: { dismisses: 2 } },
    { event: "dismissed", expect: { closes: 2, hidden: false } },
  ] },
  { label: "regression", name: "reentrant present inside first acknowledgement cannot execute an early close", presentOnChange: true, steps: [
    { event: "back" }, { event: "ack", expect: { presents: 2, dismisses: 0, closes: 0, changes: 1 } },
    { event: "back", expect: { dismisses: 1 } }, { event: "dismissed", expect: { closes: 1 } },
  ] },
  { label: "parity", name: "reentrant present inside a post-ack callback reaches native", presentOnChange: true, steps: [
    { event: "ack", expect: { presents: 2, dismisses: 0, changes: 1 } },
    { event: "back", expect: { dismisses: 1 } }, { event: "dismissed", expect: { closes: 1 } },
  ] },
  { label: "regression", name: "synchronous reopen inside onDismiss restores ownership", presentOnDismiss: true, steps: [
    { event: "ack" }, { event: "back" }, { event: "dismissed", expect: { presents: 2, closes: 1, hidden: true } },
    { event: "back", expect: { dismisses: 1, outerBacks: 0 } }, { event: "ack", expect: { dismisses: 1 } },
    { event: "back", expect: { dismisses: 2 } }, { event: "dismissed", expect: { closes: 2, hidden: false } },
  ] },
  { label: "regression", name: "unmount after early Back does not invent a close", steps: [
    { event: "back" }, { event: "unmount", expect: { closes: 0, dismisses: 0 } },
    { event: "lateCallbacks" }, { event: "elapsed", expect: { closes: 0 } },
  ] },
  { label: "regression", name: "unmount during closing does not invent or duplicate a close", steps: [
    { event: "ack" }, { event: "back" }, { event: "unmount", expect: { closes: 0 } },
    { event: "lateCallbacks", expect: { closes: 0 } },
  ] },
  { label: "parity", name: "unmount after native dismissal does not duplicate its notification", steps: [
    { event: "ack" }, { event: "back" }, { event: "dismissed", expect: { closes: 1 } },
    { event: "unmount", expect: { closes: 1 } },
  ] },
];

test.each(orderings)("SEN-98 $label: $name", async ({ steps, tracked = false, busy = false, presentOnChange, presentOnDismiss }) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const ref = createRef<BottomSheetModal>();
  const outerBack = vi.fn(() => true);
  const outerSubscription = BackHandler.addEventListener("hardwareBackPress", outerBack);
  const changed = vi.fn(() => { if (presentOnChange && changed.mock.calls.length === 1) ref.current?.present(); });
  const dismissed = vi.fn(() => { if (presentOnDismiss && dismissed.mock.calls.length === 1) ref.current?.present(); });
  await act(async () => { root = create(createElement(SheetAccessibilityProvider, null,
    createElement(SheetAccessibilityBoundary, null, createElement(View)),
    createElement(SheetModal, { sheetRef: ref, presentOnMount: true, trackPresentation: tracked, androidBack: true, busy,
      onDismiss: dismissed, onChange: presentOnChange ? changed : undefined }, createElement(View)),
  )); });
  const original: NativeSheetProps = modal().props;
  for (const step of steps) {
    await act(async () => {
      switch (step.event) {
        case "present": ref.current?.present(); break;
        case "ack": modal().props.onChange?.(0, 0, 0); break;
        case "negative": modal().props.onChange?.(-1, 0, 0); break;
        case "dismissed": modal().props.onDismiss?.(); break;
        case "back": expect(dispatchBack()).toBe(true); break;
        case "elapsed": vi.advanceTimersByTime(10000); break;
        case "unmount": root?.unmount(); root = undefined; break;
        case "lateCallbacks": original.onChange?.(0, 0, 0); original.onDismiss?.(); break;
      }
    });
    expect(vi.getTimerCount(), step.event).toBe(0);
    if (step.expect) expect({
      presents: native.present.mock.calls.length, dismisses: native.dismiss.mock.calls.length, closes: dismissed.mock.calls.length,
      hidden: root ? backgroundHidden() : false, outerBacks: outerBack.mock.calls.length, changes: changed.mock.calls.length,
    }, step.event).toMatchObject(step.expect);
  }
  outerSubscription.remove();
});
