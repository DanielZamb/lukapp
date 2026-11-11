import { createElement, forwardRef, useImperativeHandle, useState, type PropsWithChildren } from "react";

type ModalProps = PropsWithChildren<{ onDismiss?: () => void; accessibilityLabel?: string }>;

/** A presented modal renders its children; dismiss() hides it and reports onDismiss, as the native sheet does. */
export const BottomSheetModal = forwardRef<unknown, ModalProps>(function BottomSheetModal(props, ref) {
  const [presented, setPresented] = useState(false);
  useImperativeHandle(ref, () => ({
    present: () => setPresented(true),
    dismiss: () => { setPresented(false); props.onDismiss?.(); },
    close: () => {}, expand: () => {}, collapse: () => {}, forceClose: () => {}, snapToIndex: () => {}, snapToPosition: () => {},
  }));
  return presented ? createElement("sheet", { accessibilityLabel: props.accessibilityLabel }, props.children) : null;
});
export const BottomSheetBackdrop = "sheet-backdrop";
export const BottomSheetScrollView = "sheet-scroll";
export const BottomSheetView = "sheet-view";
export const BottomSheetTextInput = "input";
export const BottomSheetModalProvider = "sheet-provider";

/** Android system Back: the most recent handler that returns true consumes it. */
export function backHandlers() {
  const handlers: Array<() => boolean> = [];
  return {
    BackHandler: {
      addEventListener: (_event: string, handler: () => boolean) => {
        handlers.push(handler);
        return { remove: () => { const index = handlers.lastIndexOf(handler); if (index >= 0) handlers.splice(index, 1); } };
      },
    },
    press() {
      for (let index = handlers.length - 1; index >= 0; index -= 1) if (handlers[index]?.()) return true;
      return false;
    },
    reset() { handlers.length = 0; },
  };
}
