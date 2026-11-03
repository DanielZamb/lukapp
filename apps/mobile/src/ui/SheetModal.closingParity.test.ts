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
function render({ busy = false, tracked = false, dismissed, presentOnMount = true, androidBack = true, enableDismissOnClose }:
  { busy?: boolean; tracked?: boolean; dismissed: () => void; presentOnMount?: boolean; androidBack?: boolean; enableDismissOnClose?: boolean }) {
  return createElement(SheetAccessibilityProvider, null,
    createElement(SheetAccessibilityBoundary, null, createElement(View, { testID: "background" })),
    createElement(SheetModal, { sheetRef: ref, presentOnMount, trackPresentation: tracked, androidBack, busy, onDismiss: dismissed, enableDismissOnClose }, createElement(View)),
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

type OrderingStep = {
  event: "present" | "dismiss" | "ack" | "negative" | "dismissed" | "back" | "timer" | "unmount" | "oldAck" | "oldDismissed";
  ms?: number;
  expect?: Partial<{ presents: number; dismisses: number; closes: number; hidden: boolean; outerBacks: number; timers: number; replacement: boolean; presentedCurrent: boolean }>;
};
type Ordering = {
  name: string;
  reopenOnDismiss?: boolean;
  enableDismissOnClose?: boolean;
  androidBack?: boolean;
  steps: OrderingStep[];
};
const orderings: Ordering[] = [
  { name: "drag cancels closing and permits present and another Back", steps: [
    { event: "present" }, { event: "ack" }, { event: "back", expect: { dismisses: 1 } },
    { event: "ack", expect: { closes: 0, hidden: true, timers: 0 } },
    { event: "present", expect: { presents: 2 } }, { event: "back", expect: { dismisses: 2, outerBacks: 0 } },
    { event: "negative", expect: { hidden: true } }, { event: "dismissed", expect: { closes: 1, hidden: false } },
    { event: "dismissed", expect: { closes: 1 } },
  ] },
  { name: "drag cancels closing after a negative index", steps: [
    { event: "present" }, { event: "ack" }, { event: "back" }, { event: "negative" },
    { event: "ack", expect: { hidden: true, closes: 0 } }, { event: "back", expect: { dismisses: 2 } },
    { event: "dismissed", expect: { closes: 1, hidden: false } },
  ] },
  { name: "teardown after cancellation has no pending close", steps: [
    { event: "present" }, { event: "ack" }, { event: "back" }, { event: "ack" },
    { event: "unmount", expect: { closes: 0, timers: 0 } }, { event: "oldDismissed", expect: { closes: 0 } },
  ] },
  { name: "closing retains historical Back ownership until native dismissal", steps: [
    { event: "present" }, { event: "ack" }, { event: "back" }, { event: "negative" },
    { event: "back", expect: { dismisses: 1, closes: 0, hidden: true, outerBacks: 0 } },
    { event: "dismissed", expect: { closes: 1, hidden: false } }, { event: "back", expect: { outerBacks: 1 } },
  ] },
  { name: "initial acknowledgement executes the queue and cancels recovery", steps: [
    { event: "present" }, { event: "back", expect: { dismisses: 0, timers: 1 } }, { event: "negative" },
    { event: "present", expect: { presents: 1 } }, { event: "back", expect: { timers: 1 } },
    { event: "timer", ms: 950 }, { event: "ack", expect: { dismisses: 1, timers: 0 } },
    { event: "timer", ms: 1000, expect: { closes: 0, hidden: true } },
    { event: "dismissed", expect: { closes: 1, hidden: false } },
  ] },
  { name: "missing acknowledgement recovers once and ignores the old native instance", steps: [
    { event: "present" }, { event: "back" }, { event: "negative" },
    { event: "timer", expect: { closes: 1, hidden: false, dismisses: 1, timers: 0, replacement: true } },
    { event: "oldAck" }, { event: "oldDismissed", expect: { closes: 1, hidden: false } },
    { event: "present", expect: { presents: 2, hidden: true, presentedCurrent: true } }, { event: "ack" },
    { event: "back", expect: { dismisses: 2 } }, { event: "dismissed", expect: { closes: 2 } },
  ] },
  { name: "queued close settles on teardown", steps: [
    { event: "present" }, { event: "back" }, { event: "unmount", expect: { closes: 1, timers: 0 } },
    { event: "oldAck" }, { event: "oldDismissed" }, { event: "timer", expect: { closes: 1, dismisses: 0 } },
  ] },
  { name: "acknowledged close settles on teardown", steps: [
    { event: "present" }, { event: "ack" }, { event: "back" }, { event: "unmount", expect: { closes: 1 } },
    { event: "oldDismissed", expect: { closes: 1 } },
  ] },
  { name: "a minimized position releases ownership and reopening reacquires it", steps: [
    { event: "present" }, { event: "ack" }, { event: "negative", expect: { hidden: false, closes: 0 } },
    { event: "back", expect: { outerBacks: 1, dismisses: 0 } }, { event: "ack", expect: { hidden: true } },
    { event: "back", expect: { dismisses: 1, outerBacks: 1 } }, { event: "dismissed", expect: { closes: 1 } },
  ] },
  { name: "recovery callback presents the replacement", reopenOnDismiss: true, steps: [
    { event: "present" }, { event: "back" }, { event: "timer", expect: { closes: 1, presents: 2, hidden: true, replacement: true, presentedCurrent: true } },
    { event: "oldAck" }, { event: "oldDismissed", expect: { closes: 1 } },
    { event: "ack" }, { event: "back", expect: { dismisses: 2 } }, { event: "dismissed", expect: { closes: 2 } },
  ] },
  { name: "native negative completes a close with auto-dismiss disabled", enableDismissOnClose: false, steps: [
    { event: "present" }, { event: "ack" }, { event: "back" },
    { event: "negative", expect: { closes: 1, hidden: false } }, { event: "oldDismissed", expect: { closes: 1 } },
    { event: "present", expect: { presents: 2, hidden: true } }, { event: "ack" },
    { event: "back" }, { event: "negative", expect: { closes: 2, hidden: false } },
  ] },
  { name: "Back opt-out keeps immediate imperative dismissal", androidBack: false, steps: [
    { event: "present" }, { event: "dismiss", expect: { dismisses: 1, timers: 0 } },
    { event: "dismissed", expect: { closes: 1, hidden: false } }, { event: "back", expect: { outerBacks: 1 } },
  ] },
];

test.each(orderings)("SEN-100 native presentation ordering: $name", async ({ steps, reopenOnDismiss, enableDismissOnClose, androidBack }) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  ref = createRef<BottomSheetModal>();
  const outerBack = vi.fn(() => true);
  const outerSubscription = BackHandler.addEventListener("hardwareBackPress", outerBack);
  const dismissed = vi.fn(() => { if (reopenOnDismiss && dismissed.mock.calls.length === 1) ref.current?.present(); });
  await act(async () => { root = create(render({ tracked: true, presentOnMount: false, dismissed, enableDismissOnClose, androidBack })); });
  const oldNative: NativeSheetProps = modal().props;
  const oldInstance = modal().props.instance;
  for (const step of steps) {
    await act(async () => {
      switch (step.event) {
        case "present": ref.current?.present(); break;
        case "dismiss": ref.current?.dismiss(); break;
        case "ack": modal().props.onChange?.(0, 0, 0); break;
        case "negative": modal().props.onChange?.(-1, 0, 0); break;
        case "dismissed": modal().props.onDismiss?.(); break;
        case "back": expect(dispatchBack()).toBe(true); break;
        case "timer": vi.advanceTimersByTime(step.ms ?? 1000); break;
        case "unmount": root?.unmount(); root = undefined; break;
        case "oldAck": oldNative.onChange?.(0, 0, 0); break;
        case "oldDismissed": oldNative.onDismiss?.(); break;
      }
    });
    if (step.expect) expect({
      presents: native.present.mock.calls.length, dismisses: native.dismiss.mock.calls.length, closes: dismissed.mock.calls.length,
      hidden: root ? backgroundHidden() : false, outerBacks: outerBack.mock.calls.length, timers: vi.getTimerCount(),
      replacement: root ? modal().props.instance !== oldInstance : false,
      presentedCurrent: root ? native.present.mock.lastCall?.[0] === modal().props.instance : false,
    }, step.event).toMatchObject(step.expect);
  }
  outerSubscription.remove();
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
