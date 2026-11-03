import { BottomSheetModal, type BottomSheetModalProps } from "@gorhom/bottom-sheet";
import { useEffect, useImperativeHandle, useRef, useState, type PropsWithChildren, type RefObject } from "react";
import { BackHandler, View } from "react-native";
import { useSheetAccessibility } from "./SheetAccessibility";

export type NativeSheetProps = Omit<BottomSheetModalProps, "children" | "ref">;
export type SheetRef = RefObject<BottomSheetModal | null>;
export type SheetPresentation =
  | { sheetRef?: never; presentOnMount?: true }
  | { sheetRef: SheetRef; presentOnMount?: boolean };

type Presentation =
  | { kind: "idle" | "hidden" | "opening" | "open" | "closing" }
  | { kind: "waitingToClose"; args: Parameters<BottomSheetModal["dismiss"]> };

export function SheetModal({ sheetRef, presentOnMount, trackPresentation, androidBack, busy, dismissible = true,
  children, onDismiss, onChange, accessibilityLabel, enablePanDownToClose, enableDynamicSizing, backdropComponent: Backdrop, ...props
}: PropsWithChildren<NativeSheetProps & {
  sheetRef: SheetRef;
  presentOnMount: boolean;
  trackPresentation: boolean;
  androidBack: boolean;
  busy: boolean;
  dismissible?: boolean;
}>) {
  const [open, setOpen] = useState(presentOnMount);
  const native = useRef<BottomSheetModal>(null);
  const presentation = useRef<Presentation>({ kind: "idle" });
  const backEnabled = useRef(androidBack);
  backEnabled.current = androidBack;
  const id = useRef(Symbol("sheet"));
  const { setPresented } = useSheetAccessibility();
  const locked = busy || !dismissible;
  const lock = useRef(locked);
  lock.current = locked;
  useImperativeHandle(sheetRef, () => ({
    present: (...args) => {
      const { kind } = presentation.current;
      if (backEnabled.current && (kind === "waitingToClose" || kind === "closing")) return;
      if (kind !== "open") presentation.current = { kind: "opening" };
      setOpen(true);
      native.current?.present(...args);
    },
    dismiss: (...args) => {
      const { kind } = presentation.current;
      if (backEnabled.current) {
        if (kind === "hidden" || kind === "closing" || kind === "waitingToClose") return;
        if (kind === "opening") {
          presentation.current = { kind: "waitingToClose", args };
          return;
        }
      }
      presentation.current = { kind: "closing" };
      native.current?.dismiss(...args);
    },
    snapToIndex: (...args) => native.current?.snapToIndex(...args),
    snapToPosition: (...args) => native.current?.snapToPosition(...args),
    expand: (...args) => native.current?.expand(...args),
    collapse: (...args) => native.current?.collapse(...args),
    close: (...args) => native.current?.close(...args),
    forceClose: (...args) => native.current?.forceClose(...args),
  }), [sheetRef]);
  useEffect(() => {
    if (presentOnMount) {
      sheetRef.current?.present();
      setOpen(true);
    }
  }, [presentOnMount, sheetRef]);
  useEffect(() => {
    const key = id.current;
    setPresented(key, open);
    return () => setPresented(key, false);
  }, [open, setPresented]);
  useEffect(() => {
    if (!androidBack || !open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!lock.current) sheetRef.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [androidBack, open, sheetRef]);
  const backdropComponent: NativeSheetProps["backdropComponent"] = locked && Backdrop ? (backdropProps) =>
    <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} pointerEvents="box-only" importantForAccessibility="no-hide-descendants">
      <Backdrop {...backdropProps} />
    </View> : Backdrop;
  return <BottomSheetModal ref={native} accessibilityLabel={accessibilityLabel}
    enablePanDownToClose={locked ? false : enablePanDownToClose} enableDynamicSizing={enableDynamicSizing}
    onDismiss={() => {
      if (presentation.current.kind === "hidden") return;
      presentation.current = { kind: "hidden" };
      setOpen(false);
      onDismiss?.();
    }} {...props} backdropComponent={backdropComponent}
    {...((androidBack || trackPresentation || onChange) && { onChange: (...args: Parameters<NonNullable<NativeSheetProps["onChange"]>>) => {
      const current = presentation.current;
      if (args[0] >= 0) {
        if (current.kind === "waitingToClose") {
          presentation.current = { kind: "closing" };
        } else if (current.kind !== "closing") presentation.current = { kind: "open" };
      }
      setOpen(args[0] >= 0 || presentation.current.kind === "opening" || presentation.current.kind === "waitingToClose");
      onChange?.(...args);
      if (args[0] >= 0 && current.kind === "waitingToClose") native.current?.dismiss(...current.args);
    } })}
    {...(busy && { enableHandlePanningGesture: false })}>
    {children}
  </BottomSheetModal>;
}
