import { BottomSheetModal, type BottomSheetModalProps } from "@gorhom/bottom-sheet";
import { useEffect, useImperativeHandle, useRef, useState, type PropsWithChildren, type RefObject } from "react";
import { BackHandler, View } from "react-native";
import { useSheetAccessibility } from "./SheetAccessibility";

export type NativeSheetProps = Omit<BottomSheetModalProps, "children" | "ref" | "enableDismissOnClose"> & {
  /** Disabling native onDismiss completion with enableDismissOnClose:false is unsupported. */
  enableDismissOnClose?: true;
};
export type SheetRef = RefObject<BottomSheetModal | null>;
export type SheetPresentation =
  | { sheetRef?: never; presentOnMount?: true }
  | { sheetRef: SheetRef; presentOnMount?: boolean };

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
  const acknowledged = useRef(false);
  const mounted = useRef(true);
  const native = useRef<BottomSheetModal>(null);
  const id = useRef(Symbol("sheet"));
  const { setPresented } = useSheetAccessibility();
  const locked = busy || !dismissible;
  const lock = useRef(locked);
  lock.current = locked;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useImperativeHandle(sheetRef, () => ({
    present: (...args) => {
      if (!mounted.current) return;
      setOpen(true);
      native.current?.present(...args);
    },
    dismiss: (...args) => native.current?.dismiss(...args),
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
      if (acknowledged.current && !lock.current) sheetRef.current?.dismiss();
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
      if (!mounted.current) return;
      acknowledged.current = false;
      setOpen(false);
      onDismiss?.();
    }} {...props} backdropComponent={backdropComponent}
    {...((androidBack || trackPresentation || onChange) && { onChange: (...args: Parameters<NonNullable<NativeSheetProps["onChange"]>>) => {
      if (!mounted.current) return;
      if (args[0] >= 0) acknowledged.current = true;
      if (acknowledged.current && (trackPresentation || onChange)) setOpen(args[0] >= 0);
      onChange?.(...args);
    } })}
    {...(busy && { enableHandlePanningGesture: false })}>
    {children}
  </BottomSheetModal>;
}
