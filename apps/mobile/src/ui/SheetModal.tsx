import { BottomSheetModal, type BottomSheetModalProps } from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState, type PropsWithChildren, type RefObject } from "react";
import { BackHandler, View } from "react-native";
import { useSheetAccessibility } from "./SheetAccessibility";

export type NativeSheetProps = Omit<BottomSheetModalProps, "children" | "ref">;
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
  const id = useRef(Symbol("sheet"));
  const { setPresented } = useSheetAccessibility();
  const locked = busy || !dismissible;
  const lock = useRef(locked);
  lock.current = locked;
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
  return <BottomSheetModal ref={sheetRef} accessibilityLabel={accessibilityLabel}
    enablePanDownToClose={locked ? false : enablePanDownToClose} enableDynamicSizing={enableDynamicSizing}
    onDismiss={() => { setOpen(false); onDismiss?.(); }} {...props} backdropComponent={backdropComponent}
    {...((trackPresentation || onChange) && { onChange: (...args: Parameters<NonNullable<NativeSheetProps["onChange"]>>) => { setOpen(args[0] >= 0); onChange?.(...args); } })}
    {...(busy && { enableHandlePanningGesture: false })}>
    {children}
  </BottomSheetModal>;
}
